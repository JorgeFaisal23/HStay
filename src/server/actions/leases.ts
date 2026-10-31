"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserAction } from "@/lib/auth/session";
import { logAction } from "@/server/actions/audit";
import type { ActionResult } from "@/server/actions/properties";
import { MAX_PAYMENT_DAY, MIN_PAYMENT_DAY } from "@/lib/services/rent-schedule";
import { dayToDate, utcDay } from "@/lib/services/lease-renewal";

/**
 * Ciclo de vida del contrato después del alta: corregir datos, renovar y
 * terminar. Renovar crea un contrato nuevo y cierra el anterior, para que el
 * historial de rentas y cargos de cada periodo quede intacto.
 */

// ---------------------------------------------------------------- esquemas

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Escribe una fecha válida.");

const leaseTermsSchema = z
  .object({
    startDate: isoDay,
    endDate: isoDay,
    rentAmount: z.coerce.number().min(0, "La renta no puede ser negativa."),
    depositAmount: z.coerce.number().min(0, "El depósito no puede ser negativo.").optional(),
    paymentDay: z.coerce
      .number()
      .int()
      .min(MIN_PAYMENT_DAY, "El día de pago va del 1 al 31.")
      .max(MAX_PAYMENT_DAY, "El día de pago va del 1 al 31."),
    notes: z.string().trim().max(1000, "Las notas son demasiado largas.").optional(),
  })
  .refine((d) => d.endDate > d.startDate, {
    message: "El vencimiento debe ser posterior al inicio.",
    path: ["endDate"],
  });

const endLeaseSchema = z.object({
  endDate: isoDay,
  reason: z.string().trim().max(500, "El motivo es demasiado largo.").optional(),
});

function readTerms(formData: FormData) {
  return leaseTermsSchema.safeParse({
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    rentAmount: formData.get("rentAmount"),
    depositAmount: formData.get("depositAmount") || undefined,
    paymentDay: formData.get("paymentDay"),
    notes: formData.get("notes") || undefined,
  });
}

/** Contrato dentro de la organización de la sesión, o null. */
async function findLease(leaseId: string, organizationId: string | null | undefined) {
  if (!leaseId) return null;
  return prisma.lease.findFirst({
    where: {
      id: leaseId,
      ...(organizationId ? { unit: { building: { organizationId } } } : {}),
    },
    select: {
      id: true,
      status: true,
      unitId: true,
      tenantId: true,
      startDate: true,
      notes: true,
      unit: { select: { code: true, status: true, building: { select: { name: true } } } },
      tenant: { select: { name: true } },
    },
  });
}

function refresh(tenantId: string, unitId: string) {
  revalidatePath(`/inquilinos/${tenantId}`);
  revalidatePath(`/unidades/${unitId}`);
  revalidatePath("/inquilinos");
  revalidatePath("/edificios");
  revalidatePath("/dashboard");
  revalidatePath("/calendario");
}

// ---------------------------------------------------------------- editar

/** Corrige los datos de un contrato. Los cargos ya generados no cambian. */
export async function updateLease(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireUserAction(["OWNER", "ADMIN"]);

  const parsed = readTerms(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisa los datos del contrato." };
  }

  const lease = await findLease(String(formData.get("leaseId") ?? ""), session.organizationId);
  if (!lease) return { error: "Contrato no encontrado o sin permisos." };

  const terms = parsed.data;
  await prisma.lease.update({
    where: { id: lease.id },
    data: {
      startDate: dayToDate(terms.startDate),
      endDate: dayToDate(terms.endDate),
      rentAmount: terms.rentAmount,
      depositAmount: terms.depositAmount ?? null,
      paymentDay: terms.paymentDay,
      notes: terms.notes ?? null,
    },
  });

  await logAction(
    session.sub,
    "Edición de contrato",
    "Lease",
    lease.id,
    `${lease.unit.building.name} ${lease.unit.code} · ${lease.tenant.name}`,
    session.organizationId,
  );

  refresh(lease.tenantId, lease.unitId);
  return { ok: true };
}

// ---------------------------------------------------------------- asignar

/**
 * Crea el contrato de un inquilino que ya existe (dado de alta sin unidad o
 * cuyo contrato anterior terminó). Antes este botón llevaba a "Nuevo
 * inquilino" y terminaba duplicando a la persona.
 */
export async function assignLease(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireUserAction(["OWNER", "ADMIN"]);

  const parsed = readTerms(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisa los datos del contrato." };
  }
  const terms = parsed.data;

  const tenantId = String(formData.get("tenantId") ?? "");
  const unitId = String(formData.get("unitId") ?? "");
  if (!unitId) return { error: "Elige la unidad." };

  const [tenant, unit] = await Promise.all([
    prisma.user.findFirst({
      where: {
        id: tenantId,
        role: "TENANT",
        ...(session.organizationId ? { organizationId: session.organizationId } : {}),
      },
      select: { id: true, name: true },
    }),
    prisma.unit.findFirst({
      where: {
        id: unitId,
        ...(session.organizationId
          ? { building: { organizationId: session.organizationId } }
          : {}),
      },
      select: { id: true, code: true, status: true, building: { select: { name: true } } },
    }),
  ]);
  if (!tenant) return { error: "Inquilino no encontrado o sin permisos." };
  if (!unit) return { error: "La unidad seleccionada no pertenece a tu organización." };

  // Una unidad no puede tener dos contratos vigentes a la vez.
  const other = await prisma.lease.findFirst({
    where: { unitId: unit.id, status: "ACTIVE" },
    select: { tenant: { select: { name: true } } },
  });
  if (other) {
    return { error: `La unidad ya tiene un contrato vigente (${other.tenant.name}).` };
  }

  const lease = await prisma.$transaction(async (tx) => {
    const created = await tx.lease.create({
      data: {
        unitId: unit.id,
        tenantId: tenant.id,
        startDate: dayToDate(terms.startDate),
        endDate: dayToDate(terms.endDate),
        rentAmount: terms.rentAmount,
        depositAmount: terms.depositAmount ?? null,
        paymentDay: terms.paymentDay,
        notes: terms.notes ?? null,
        status: "ACTIVE",
      },
      select: { id: true },
    });

    // No se pisa un estado de mantenimiento o de renta corta.
    if (unit.status === "AVAILABLE") {
      await tx.unit.update({ where: { id: unit.id }, data: { status: "OCCUPIED" } });
    }
    return created;
  });

  await logAction(
    session.sub,
    "Asignación de unidad",
    "Lease",
    lease.id,
    `${unit.building.name} ${unit.code} · ${tenant.name} · ${terms.startDate} → ${terms.endDate}`,
    session.organizationId,
  );

  refresh(tenant.id, unit.id);
  return { ok: true };
}

// ---------------------------------------------------------------- renovar

/**
 * Crea el siguiente periodo del contrato. Si el anterior seguía vigente, se
 * cierra; si ya estaba terminado (p. ej. importado como vencido), queda igual.
 */
export async function renewLease(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireUserAction(["OWNER", "ADMIN"]);

  const parsed = readTerms(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisa los datos del contrato." };
  }
  const terms = parsed.data;

  if (terms.endDate <= utcDay(new Date())) {
    return {
      error:
        "La renovación debe vencer después de hoy. Para corregir un periodo que ya pasó, usa Editar.",
    };
  }

  const previous = await findLease(String(formData.get("leaseId") ?? ""), session.organizationId);
  if (!previous) return { error: "Contrato no encontrado o sin permisos." };
  if (previous.status === "CANCELLED") {
    return { error: "Un contrato cancelado no se puede renovar." };
  }

  // Una unidad no puede tener dos contratos vigentes a la vez.
  const other = await prisma.lease.findFirst({
    where: { unitId: previous.unitId, status: "ACTIVE", NOT: { id: previous.id } },
    select: { tenant: { select: { name: true } } },
  });
  if (other) {
    return { error: `La unidad ya tiene otro contrato vigente (${other.tenant.name}).` };
  }

  const renewed = await prisma.$transaction(async (tx) => {
    if (previous.status === "ACTIVE") {
      await tx.lease.update({ where: { id: previous.id }, data: { status: "ENDED" } });
    }

    const created = await tx.lease.create({
      data: {
        unitId: previous.unitId,
        tenantId: previous.tenantId,
        startDate: dayToDate(terms.startDate),
        endDate: dayToDate(terms.endDate),
        rentAmount: terms.rentAmount,
        depositAmount: terms.depositAmount ?? null,
        paymentDay: terms.paymentDay,
        notes: terms.notes ?? null,
        status: "ACTIVE",
      },
      select: { id: true },
    });

    // No se pisa un estado de mantenimiento o de renta corta.
    if (previous.unit.status === "AVAILABLE" || previous.unit.status === "OCCUPIED") {
      await tx.unit.update({ where: { id: previous.unitId }, data: { status: "OCCUPIED" } });
    }

    return created;
  });

  await logAction(
    session.sub,
    "Renovación de contrato",
    "Lease",
    renewed.id,
    `${previous.unit.building.name} ${previous.unit.code} · ${previous.tenant.name} · ${terms.startDate} → ${terms.endDate}`,
    session.organizationId,
  );

  refresh(previous.tenantId, previous.unitId);
  return { ok: true };
}

// ---------------------------------------------------------------- terminar

/**
 * Cierra un contrato vigente en la fecha real de salida. La unidad queda
 * disponible. Los cargos pendientes no se borran: se cobran o se ajustan
 * desde Cobros.
 */
export async function endLease(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireUserAction(["OWNER", "ADMIN"]);

  const parsed = endLeaseSchema.safeParse({
    endDate: formData.get("endDate"),
    reason: formData.get("reason") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisa los datos." };
  }

  const lease = await findLease(String(formData.get("leaseId") ?? ""), session.organizationId);
  if (!lease) return { error: "Contrato no encontrado o sin permisos." };
  if (lease.status !== "ACTIVE") return { error: "Este contrato ya no está vigente." };
  if (parsed.data.endDate < utcDay(lease.startDate)) {
    return { error: "La fecha de salida no puede ser anterior al inicio del contrato." };
  }

  const reasonNote = parsed.data.reason
    ? `Terminado el ${parsed.data.endDate}: ${parsed.data.reason}`
    : null;

  await prisma.$transaction(async (tx) => {
    await tx.lease.update({
      where: { id: lease.id },
      data: {
        status: "ENDED",
        endDate: dayToDate(parsed.data.endDate),
        ...(reasonNote
          ? { notes: lease.notes ? `${lease.notes}\n${reasonNote}` : reasonNote }
          : {}),
      },
    });

    if (lease.unit.status === "OCCUPIED") {
      await tx.unit.update({ where: { id: lease.unitId }, data: { status: "AVAILABLE" } });
    }
  });

  await logAction(
    session.sub,
    "Terminación de contrato",
    "Lease",
    lease.id,
    `${lease.unit.building.name} ${lease.unit.code} · ${lease.tenant.name} · salida ${parsed.data.endDate}`,
    session.organizationId,
  );

  refresh(lease.tenantId, lease.unitId);
  return { ok: true };
}
