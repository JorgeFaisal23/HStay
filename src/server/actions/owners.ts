"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrgUserAction } from "@/lib/auth/session";
import { isEmailInUse } from "@/lib/db/accounts";
import type { OrgDb } from "@/lib/db/scoped";
import { money, periodKey, periodLabel, periodToDate, toNumber } from "@/lib/format";
import { startOfToday, toCents } from "@/lib/payments";
import { statementForBuilding } from "@/lib/queries/owners";
import type { ActionResult } from "@/lib/action-result";
import { userQuotaErrorFor } from "@/server/user-quota";
import { deliverAccess, unusablePasswordHash } from "@/server/auth/access";
import { receiptError } from "@/server/payments-core";
import { logAction } from "@/server/actions/audit";
import type { AccessResult } from "@/server/actions/team";

/**
 * Propietarios (B-05): personas dueñas de un inmueble que administra la
 * arrendadora. Tienen una vista de solo lectura con su estado de cuenta; el
 * equipo (OWNER/ADMIN) les da acceso, les asigna propiedades y registra a
 * mano lo que se les entrega.
 */

const PERIOD = /^\d{4}-\d{2}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function refreshOwners(ownerId?: string | null, buildingId?: string) {
  revalidatePath("/propietarios");
  if (ownerId) revalidatePath(`/propietarios/${ownerId}`);
  if (buildingId) revalidatePath(`/edificios/${buildingId}`);
  revalidatePath("/propietario");
}

async function findOwner(db: OrgDb, userId: string) {
  return db.user.findFirst({
    where: { id: userId, role: "PROPERTY_OWNER" },
    select: { id: true, name: true, email: true, active: true },
  });
}

// ------------------------------------------------------------------ cuentas

const ownerSchema = z.object({
  name: z.string().trim().min(3, "Escribe el nombre completo.").max(80),
  email: z.string().trim().toLowerCase().email("Escribe un correo válido."),
  phone: z.string().trim().max(30).optional(),
});

/** Alta de un propietario con acceso a su vista. Ocupa un usuario contratado. */
export async function createOwner(_prev: AccessResult, formData: FormData): Promise<AccessResult> {
  const { session, orgId, db } = await requireOrgUserAction(["OWNER", "ADMIN"]);

  const parsed = ownerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Revisa los datos." };

  const overLimit = await userQuotaErrorFor(db);
  if (overLimit) return { error: overLimit };
  if (await isEmailInUse(parsed.data.email)) {
    return { error: "Ese correo ya está registrado. Usa otro." };
  }

  const user = await db.user.create({
    data: {
      organizationId: orgId,
      name: parsed.data.name,
      email: parsed.data.email,
      phone: parsed.data.phone ?? null,
      role: "PROPERTY_OWNER",
      passwordHash: await unusablePasswordHash(),
    },
  });
  const delivery = await deliverAccess(user.id, "INVITE");

  await logAction(db, session.sub, "Alta de propietario", "User", user.id, user.name);
  refreshOwners();
  return { ok: true, delivery };
}

/** Desactivar corta su acceso sin borrar su historial; reactivar ocupa un usuario. */
export async function setOwnerActive(userId: string, active: boolean): Promise<ActionResult> {
  const { session, db } = await requireOrgUserAction(["OWNER", "ADMIN"]);

  const owner = await findOwner(db, userId);
  if (!owner) return { error: "No se encontró al propietario." };
  if (owner.active === active) return { ok: true };

  if (active) {
    const overLimit = await userQuotaErrorFor(db);
    if (overLimit) return { error: overLimit };
  }

  await db.user.update({
    where: { id: owner.id },
    data: active ? { active: true } : { active: false, currentSessionId: null },
  });
  await logAction(
    db,
    session.sub,
    active ? "Reactivación de propietario" : "Desactivación de propietario",
    "User",
    owner.id,
    owner.name,
  );
  refreshOwners(owner.id);
  return { ok: true };
}

export async function resetOwnerAccess(userId: string): Promise<AccessResult> {
  const { session, db } = await requireOrgUserAction(["OWNER", "ADMIN"]);

  const owner = await findOwner(db, userId);
  if (!owner) return { error: "No se encontró al propietario." };
  if (!owner.active) return { error: "Reactiva la cuenta antes de darle acceso." };

  const delivery = await deliverAccess(owner.id, "RESET");
  await logAction(db, session.sub, "Restablecimiento de acceso", "User", owner.id, owner.name);
  refreshOwners(owner.id);
  return { ok: true, delivery };
}

// ------------------------------------------------------------------ propiedades

const assignSchema = z.object({
  buildingId: z.string().min(1),
  ownerId: z.string().min(1).nullable(),
  since: z.string().regex(PERIOD, "Elige desde qué mes se le rinden cuentas.").optional(),
});

/**
 * Asigna (o quita) el propietario de una propiedad y desde qué mes se le
 * rinden cuentas. Quitarlo no borra las entregas: quedan en su historial.
 */
export async function assignBuildingOwner(input: {
  buildingId: string;
  ownerId: string | null;
  since?: string;
}): Promise<ActionResult> {
  const { session, db } = await requireOrgUserAction(["OWNER", "ADMIN"]);
  const parsed = assignSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Revisa los datos." };
  const { buildingId, ownerId, since } = parsed.data;

  const building = await db.building.findUnique({
    where: { id: buildingId },
    select: { id: true, name: true, ownerId: true },
  });
  if (!building) return { error: "No se encontró la propiedad." };

  if (ownerId === null) {
    await db.building.update({ where: { id: buildingId }, data: { ownerId: null, ownerSince: null } });
    await logAction(db, session.sub, "Propiedad sin propietario", "Building", buildingId, building.name);
    refreshOwners(building.ownerId, buildingId);
    return { ok: true };
  }

  if (!since) return { error: "Elige desde qué mes se le rinden cuentas." };
  if (since > periodKey(new Date())) return { error: "El inicio de cuentas no puede ser un mes futuro." };

  const owner = await findOwner(db, ownerId);
  if (!owner || !owner.active) return { error: "No se encontró al propietario." };

  await db.building.update({
    where: { id: buildingId },
    data: { ownerId: owner.id, ownerSince: periodToDate(since) },
  });
  await logAction(
    db,
    session.sub,
    "Asignación de propietario",
    "Building",
    buildingId,
    `${building.name} · ${owner.name} · desde ${periodLabel(since)}`,
  );
  refreshOwners(owner.id, buildingId);
  if (building.ownerId && building.ownerId !== owner.id) refreshOwners(building.ownerId);
  return { ok: true };
}

// ------------------------------------------------------------------ entregas

const payoutSchema = z.object({
  buildingId: z.string().min(1),
  amount: z.number().positive("El monto debe ser mayor a cero.").max(99_999_999),
  paidOn: z.string().regex(DAY, "Elige la fecha de la entrega."),
  method: z.string().trim().min(1, "Indica la forma de pago.").max(40),
  reference: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(200).optional(),
  receiptUrl: z.string().optional(),
});

/**
 * Registra dinero entregado al propietario de una propiedad. No se puede
 * entregar más de lo pendiente: un error de captura no debe dejar un saldo
 * a favor fantasma. Se valida bajo un candado por propiedad para que dos
 * capturas simultáneas no rebasen lo pendiente.
 */
export async function recordOwnerPayout(input: {
  buildingId: string;
  amount: number;
  paidOn: string;
  method: string;
  reference?: string;
  notes?: string;
  receiptUrl?: string;
}): Promise<ActionResult> {
  const { session, orgId, db } = await requireOrgUserAction(["OWNER", "ADMIN"]);
  const parsed = payoutSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Revisa los datos de la entrega." };
  const data = parsed.data;

  const receipt = data.receiptUrl?.trim();
  if (receipt) {
    const invalid = receiptError(receipt);
    if (invalid) return { error: invalid };
  }

  const [year, month, day] = data.paidOn.split("-").map(Number);
  const paidOn = new Date(year, month - 1, day);
  if (paidOn > startOfToday()) return { error: "La fecha de la entrega no puede ser futura." };

  const building = await db.building.findUnique({
    where: { id: data.buildingId },
    select: { id: true, name: true, ownerId: true, ownerSince: true, currency: true },
  });
  if (!building) return { error: "No se encontró la propiedad." };
  const { ownerId, ownerSince } = building;
  if (!ownerId || !ownerSince) return { error: "Asigna primero un propietario a esta propiedad." };
  if (paidOn < ownerSince) {
    return { error: `La entrega no puede ser anterior al inicio de cuentas (${periodLabel(periodKey(ownerSince))}).` };
  }

  const result = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`payout:${building.id}`}))`;
    const { pending } = await statementForBuilding(tx, { id: building.id, ownerId, ownerSince });
    if (toCents(data.amount) > toCents(pending)) {
      return {
        error:
          pending > 0
            ? `El monto excede lo pendiente de entregar (${money(pending, building.currency)}).`
            : "No hay dinero pendiente de entregar en esta propiedad.",
      };
    }
    await tx.ownerPayout.create({
      data: {
        organizationId: orgId,
        buildingId: building.id,
        ownerId,
        amount: data.amount,
        paidOn,
        method: data.method,
        reference: data.reference || null,
        notes: data.notes || null,
        receiptUrl: receipt || null,
        recordedById: session.sub,
      },
    });
    return { ok: true as const };
  });
  if ("error" in result) return { error: result.error };

  await logAction(
    db,
    session.sub,
    "Entrega al propietario",
    "Building",
    building.id,
    `${building.name} · ${data.method} · ${money(data.amount, building.currency)}`,
  );
  refreshOwners(ownerId, building.id);
  return { ok: true };
}

/** Borra una entrega registrada por error; vuelve a contar como pendiente. */
export async function deleteOwnerPayout(payoutId: string): Promise<ActionResult> {
  const { session, db } = await requireOrgUserAction(["OWNER", "ADMIN"]);

  const payout = await db.ownerPayout.findUnique({
    where: { id: payoutId },
    select: { id: true, amount: true, ownerId: true, buildingId: true, building: { select: { name: true, currency: true } } },
  });
  if (!payout) return { error: "No se encontró la entrega." };

  await db.ownerPayout.delete({ where: { id: payout.id } });
  await logAction(
    db,
    session.sub,
    "Cancelación de entrega al propietario",
    "Building",
    payout.buildingId,
    `${payout.building.name} · ${money(toNumber(payout.amount), payout.building.currency)}`,
  );
  refreshOwners(payout.ownerId, payout.buildingId);
  return { ok: true };
}
