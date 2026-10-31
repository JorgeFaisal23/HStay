"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserAction } from "@/lib/auth/session";
import { logAction } from "@/server/actions/audit";
import type { ActionResult } from "@/server/actions/properties";
import { MAX_PAYMENT_DAY, MIN_PAYMENT_DAY } from "@/lib/services/rent-schedule";

/**
 * Alta de inquilino. Crea el perfil y, si se indicó una unidad, el contrato
 * correspondiente en un solo paso: es el flujo real del arrendador.
 */

const tenantSchema = z.object({
  name: z.string().trim().min(3, "Escribe el nombre completo."),
  // Opcional: un inquilino sin correo se registra igual, pero no entra al portal.
  email: z.string().trim().toLowerCase().email("Escribe un correo válido.").optional(),
  phone: z.string().trim().optional(),
  documentId: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  password: z
    .string()
    .min(8, "La contraseña debe tener al menos 8 caracteres.")
    .optional(),
});

const leaseSchema = z.object({
  unitId: z.string().min(1),
  startDate: z.string().min(1, "Indica el inicio del contrato."),
  endDate: z.string().min(1, "Indica el vencimiento del contrato."),
  rentAmount: z.coerce.number().min(0),
  depositAmount: z.coerce.number().min(0).optional(),
  paymentDay: z.coerce
    .number()
    .int()
    .min(MIN_PAYMENT_DAY, "El día de pago va del 1 al 31.")
    .max(MAX_PAYMENT_DAY, "El día de pago va del 1 al 31."),
});

export async function createTenant(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireUserAction(["OWNER", "ADMIN"]);

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

  if (parsed.data.email) {
    const existing = await prisma.user.findUnique({
      where: { email: parsed.data.email },
      select: { id: true },
    });
    if (existing) {
      return { error: "Ya existe un usuario con ese correo." };
    }
  }

  const unitId = String(formData.get("unitId") ?? "");
  let leaseData: z.infer<typeof leaseSchema> | null = null;

  if (unitId) {
    const leaseParsed = leaseSchema.safeParse({
      unitId,
      startDate: formData.get("startDate"),
      endDate: formData.get("endDate"),
      rentAmount: formData.get("rentAmount"),
      depositAmount: formData.get("depositAmount") || undefined,
      paymentDay: formData.get("paymentDay") || 1,
    });

    if (!leaseParsed.success) {
      return {
        error: leaseParsed.error.issues[0]?.message ?? "Revisa los datos del contrato.",
      };
    }

    if (new Date(leaseParsed.data.endDate) <= new Date(leaseParsed.data.startDate)) {
      return { error: "El vencimiento debe ser posterior al inicio del contrato." };
    }

    if (session.organizationId) {
      const unitBelongs = await prisma.unit.findFirst({
        where: {
          id: unitId,
          building: { organizationId: session.organizationId },
        },
        select: { id: true },
      });
      if (!unitBelongs) {
        return { error: "La unidad seleccionada no pertenece a tu organización." };
      }
    }

    // Una unidad no puede tener dos contratos vigentes a la vez.
    const busy = await prisma.lease.findFirst({
      where: { unitId, status: "ACTIVE" },
      select: { id: true },
    });
    if (busy) {
      return { error: "Esa unidad ya tiene un contrato vigente." };
    }

    leaseData = leaseParsed.data;
  }

  // La contraseña temporal permite al inquilino entrar al portal desde el día
  // uno; en producción aquí iría un correo de invitación. Sin correo no hay
  // acceso al portal, así que se guarda una contraseña aleatoria que nadie conoce.
  const password = parsed.data.email
    ? (parsed.data.password ?? "demo1234")
    : randomUUID();
  const passwordHash = bcrypt.hashSync(password, 10);

  const tenant = await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email ?? null,
      phone: parsed.data.phone,
      documentId: parsed.data.documentId,
      notes: parsed.data.notes,
      role: "TENANT",
      organizationId: session.organizationId ?? null,
      passwordHash,
    },
  });

  if (leaseData) {
    await prisma.lease.create({
      data: {
        unitId: leaseData.unitId,
        tenantId: tenant.id,
        startDate: new Date(leaseData.startDate),
        endDate: new Date(leaseData.endDate),
        rentAmount: leaseData.rentAmount,
        depositAmount: leaseData.depositAmount ?? null,
        paymentDay: leaseData.paymentDay,
        status: "ACTIVE",
      },
    });

    await prisma.unit.update({
      where: { id: leaseData.unitId },
      data: { status: "OCCUPIED" },
    });
  }

  await logAction(
    session.sub,
    "Alta de inquilino",
    "User",
    tenant.id,
    tenant.name,
    session.organizationId,
  );

  revalidatePath("/inquilinos");
  revalidatePath("/edificios");
  revalidatePath("/dashboard");
  redirect(`/inquilinos/${tenant.id}`);
}

/**
 * Edita el perfil. La contraseña es opcional: se usa para dar acceso al portal
 * a un inquilino que se registró sin correo, o para restablecerla.
 */
export async function updateTenant(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireUserAction(["OWNER", "ADMIN"]);
  const tenantId = String(formData.get("tenantId") ?? "");
  if (!tenantId) return { error: "No se identificó al inquilino." };

  const allowed = await prisma.user.findFirst({
    where: {
      id: tenantId,
      role: "TENANT",
      ...(session.organizationId ? { organizationId: session.organizationId } : {}),
    },
    select: { id: true },
  });
  if (!allowed) {
    return { error: "Inquilino no encontrado o sin permisos." };
  }

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

  if (parsed.data.password && !parsed.data.email) {
    return { error: "Para dar acceso al portal, escribe también su correo." };
  }

  if (parsed.data.email) {
    const clash = await prisma.user.findFirst({
      where: { email: parsed.data.email, NOT: { id: tenantId } },
      select: { id: true },
    });
    if (clash) return { error: "Ese correo ya lo usa otro usuario." };
  }

  await prisma.user.update({
    where: { id: tenantId },
    data: {
      name: parsed.data.name,
      email: parsed.data.email ?? null,
      phone: parsed.data.phone ?? null,
      documentId: parsed.data.documentId ?? null,
      notes: parsed.data.notes ?? null,
      ...(parsed.data.password
        ? { passwordHash: bcrypt.hashSync(parsed.data.password, 10) }
        : {}),
    },
  });

  await logAction(
    session.sub,
    parsed.data.password ? "Edición de inquilino y nueva contraseña" : "Edición de inquilino",
    "User",
    tenantId,
    parsed.data.name,
    session.organizationId,
  );

  revalidatePath(`/inquilinos/${tenantId}`);
  revalidatePath("/inquilinos");
  return { ok: true };
}
