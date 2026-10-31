"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { requireOrgUserAction } from "@/lib/auth/session";
import { logAction } from "@/server/actions/audit";
import { isEmailInUse } from "@/lib/db/accounts";
import type { OrgDb } from "@/lib/db/scoped";
import type { ActionResult } from "@/lib/action-result";
import { canEmailLinks } from "@/server/auth/links";
import {
  leaseData as buildLease,
  lockUnit,
  parseDateInput,
  readLeaseTerms,
  unitAvailabilityError,
  type LeaseTerms,
} from "@/server/actions/lease-rules";
import { deliverAccess, unusablePasswordHash, type AccessDelivery } from "@/server/auth/access";
import { userQuotaErrorFor } from "@/server/user-quota";

/**
 * Alta de inquilino. Crea el perfil y, si se indicó una unidad, el contrato
 * correspondiente en un solo paso: es el flujo real del arrendador.
 */

const tenantSchema = z.object({
  name: z.string().trim().min(3, "Escribe el nombre completo."),
  /** Opcional: sin correo se registra, ocupa un usuario, pero no entra al portal. */
  email: z.string().trim().toLowerCase().email("Escribe un correo válido.").optional(),
  phone: z.string().trim().optional(),
  documentId: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  /** Opcional si hay correo: sin contraseña se le manda una invitación. */
  password: z.string().min(8, "La contraseña temporal debe tener al menos 8 caracteres.").optional(),
});


export async function createTenant(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { session, orgId, db } = await requireOrgUserAction(["OWNER", "ADMIN"]);

  const parsed = tenantSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email") || undefined,
    phone: formData.get("phone") || undefined,
    documentId: formData.get("documentId") || undefined,
    notes: formData.get("notes") || undefined,
    password: formData.get("password") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisa los datos." };
  }
  const email = parsed.data.email;
  if (!email && parsed.data.password) {
    return { error: "Para darle acceso al portal, escribe también su correo." };
  }

  // Cada inquilino activo ocupa un usuario contratado, tenga o no correo.
  const overQuota = await userQuotaErrorFor(db);
  if (overQuota) return { error: overQuota };

  // El correo es único en toda la plataforma, no solo en esta arrendadora.
  if (email && (await isEmailInUse(email))) {
    return { error: "Ese correo ya está registrado. Usa otro." };
  }

  const unitId = String(formData.get("unitId") ?? "");
  let terms: LeaseTerms | null = null;

  if (unitId) {
    const parsedTerms = readLeaseTerms(formData);
    if (!parsedTerms.success) {
      return { error: parsedTerms.error.issues[0]?.message ?? "Revisa los datos del contrato." };
    }
    const unavailable = await unitAvailabilityError(
      db,
      unitId,
      parseDateInput(parsedTerms.data.startDate),
      parseDateInput(parsedTerms.data.endDate),
    );
    if (unavailable) return { error: unavailable };
    terms = parsedTerms.data;
  }

  // Dos formas de darle acceso al portal: una contraseña temporal que el
  // arrendador le entrega (y que deberá cambiar al entrar) o, si hay correo
  // configurado, una invitación para que elija la suya. Nunca una contraseña
  // por defecto: una conocida por todos abriría cualquier cuenta nueva.
  // Sin correo no hay ninguna de las dos: queda registrado sin acceso.
  const invite = Boolean(email) && !parsed.data.password;
  if (invite && !(await canEmailLinks())) {
    return { error: "Escribe una contraseña temporal para que pueda entrar al portal." };
  }
  const passwordHash = parsed.data.password
    ? await bcrypt.hash(parsed.data.password, 10)
    : await unusablePasswordHash();

  // Perfil, contrato y estado de la unidad se guardan juntos: si algo falla
  // no queda un inquilino a medias ni una unidad ocupada sin contrato. La
  // disponibilidad se vuelve a validar bajo el candado de la unidad: otra alta
  // simultánea (contrato o reserva) pudo ocuparla después de la primera
  // comprobación.
  const result = await db.$transaction(async (tx) => {
    if (terms) {
      await lockUnit(tx, unitId);
      const unavailable = await unitAvailabilityError(
        tx,
        unitId,
        parseDateInput(terms.startDate),
        parseDateInput(terms.endDate),
      );
      if (unavailable) return { error: unavailable };
    }

    const created = await tx.user.create({
      data: {
        organizationId: orgId,
        name: parsed.data.name,
        email: email ?? null,
        phone: parsed.data.phone,
        documentId: parsed.data.documentId,
        notes: parsed.data.notes,
        role: "TENANT",
        passwordHash,
        mustChangePassword: Boolean(parsed.data.password),
      },
    });

    if (terms) {
      await tx.lease.create({ data: buildLease(orgId, unitId, created.id, terms) });

      await tx.unit.update({
        where: { id: unitId },
        data: { status: "OCCUPIED" },
      });
    }

    return { tenant: created };
  });
  if ("error" in result) return { error: result.error };
  const { tenant } = result;

  await logAction(db, session.sub, "Alta de inquilino", "User", tenant.id, tenant.name);

  // La invitación sale después de guardar: si el correo fallara, deliverAccess
  // cae a una contraseña temporal que no se podría mostrar tras redirigir, así
  // que en ese caso se avisa en la ficha para generar otra.
  let invited = false;
  if (invite) {
    const delivery = await deliverAccess(tenant.id, "INVITE");
    invited = delivery.method === "email";
  }

  revalidatePath("/inquilinos");
  revalidatePath("/edificios");
  revalidatePath("/dashboard");
  revalidatePath("/hoy");
  redirect(
    invite
      ? `/inquilinos/${tenant.id}?acceso=${invited ? "invitacion" : "pendiente"}`
      : `/inquilinos/${tenant.id}`,
  );
}

/** Un inquilino de esta arrendadora. */
async function findTenant(db: OrgDb, tenantId: string) {
  return db.user.findFirst({
    where: { id: tenantId, role: "TENANT" },
    select: { id: true, name: true, email: true, active: true },
  });
}

/**
 * Desactivar corta su acceso al portal (cierra su sesión) sin borrar su
 * historial y libera su usuario contratado. Con un contrato vigente no se
 * puede: primero se termina. Reactivar ocupa un usuario contratado.
 */
export async function setTenantActive(tenantId: string, active: boolean): Promise<ActionResult> {
  const { session, db } = await requireOrgUserAction(["OWNER", "ADMIN"]);

  const tenant = await findTenant(db, tenantId);
  if (!tenant) return { error: "No se encontró al inquilino." };
  if (tenant.active === active) return { ok: true };

  if (active) {
    const overQuota = await userQuotaErrorFor(db);
    if (overQuota) return { error: overQuota };
  } else {
    const lease = await db.lease.findFirst({
      where: { tenantId, status: "ACTIVE" },
      select: { id: true },
    });
    if (lease) {
      return { error: "Tiene un contrato vigente. Termina el contrato antes de desactivarlo." };
    }
  }

  await db.user.update({
    where: { id: tenant.id },
    data: active ? { active: true } : { active: false, currentSessionId: null },
  });
  await logAction(
    db,
    session.sub,
    active ? "Reactivación de inquilino" : "Desactivación de inquilino",
    "User",
    tenant.id,
    tenant.name,
  );

  revalidatePath(`/inquilinos/${tenant.id}`);
  revalidatePath("/inquilinos");
  return { ok: true };
}

/** Nuevo acceso al portal para un inquilino que perdió su contraseña. */
export async function resetTenantAccess(
  tenantId: string,
): Promise<ActionResult & { delivery?: AccessDelivery }> {
  const { session, db } = await requireOrgUserAction(["OWNER", "ADMIN"]);

  const tenant = await findTenant(db, tenantId);
  if (!tenant) return { error: "No se encontró al inquilino." };
  if (!tenant.active) return { error: "Reactiva al inquilino antes de darle acceso." };
  if (!tenant.email) return { error: "Agrega su correo antes de darle acceso al portal." };

  const delivery = await deliverAccess(tenant.id, "RESET");
  await logAction(db, session.sub, "Restablecimiento de acceso", "User", tenant.id, tenant.name);
  revalidatePath(`/inquilinos/${tenant.id}`);
  return { ok: true, delivery };
}

const updateSchema = tenantSchema.omit({ password: true });

export async function updateTenant(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { session, db } = await requireOrgUserAction(["OWNER", "ADMIN"]);
  const tenantId = String(formData.get("tenantId") ?? "");
  if (!tenantId) return { error: "No se identificó al inquilino." };

  const parsed = updateSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email") || undefined,
    phone: formData.get("phone") || undefined,
    documentId: formData.get("documentId") || undefined,
    notes: formData.get("notes") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisa los datos." };
  }

  // La acción se puede invocar directamente con cualquier id: sin esta
  // comprobación, alguien del equipo podría cambiar el correo del dueño y
  // quedarse con su cuenta.
  const tenant = await db.user.findFirst({
    where: { id: tenantId, role: "TENANT" },
    select: { id: true, email: true },
  });
  if (!tenant) return { error: "No se encontró al inquilino." };

  const email = parsed.data.email ?? null;
  if (email && (await isEmailInUse(email, tenantId))) {
    return { error: "Ese correo ya está registrado. Usa otro." };
  }
  // Quitarle el correo le quita el acceso: se cierra su sesión abierta.
  const losesAccess = Boolean(tenant.email) && !email;

  await db.user.update({
    where: { id: tenantId },
    data: {
      name: parsed.data.name,
      email,
      ...(losesAccess ? { currentSessionId: null } : {}),
      phone: parsed.data.phone ?? null,
      documentId: parsed.data.documentId ?? null,
      notes: parsed.data.notes ?? null,
    },
  });

  await logAction(db, session.sub, "Edición de inquilino", "User", tenantId, parsed.data.name);

  revalidatePath(`/inquilinos/${tenantId}`);
  revalidatePath("/inquilinos");
  return { ok: true };
}
