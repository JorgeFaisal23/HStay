"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOrgUserAction } from "@/lib/auth/session";
import type { OrgDb } from "@/lib/db/scoped";
import { periodKey } from "@/lib/format";
import { startOfToday } from "@/lib/payments";
import { logAction } from "@/server/actions/audit";
import type { ActionResult } from "@/lib/action-result";
import {
  leaseData,
  lockUnit,
  parseDateInput,
  readLeaseTerms,
  unitAvailabilityError,
} from "@/server/actions/lease-rules";

/**
 * Ciclo de vida del contrato: alta para un inquilino que ya existe,
 * terminación (antes de tiempo o al vencer), renovación y cancelación.
 *
 * Al terminar o cancelar, la unidad vuelve a estar disponible y los cargos de
 * meses que ya no corresponden se borran si nadie los pagó.
 */

type Tx = Parameters<Parameters<OrgDb["$transaction"]>[0]>[0];

function refresh(tenantId: string, unitId: string) {
  revalidatePath(`/inquilinos/${tenantId}`);
  revalidatePath("/inquilinos");
  revalidatePath(`/unidades/${unitId}`);
  revalidatePath("/edificios");
  revalidatePath("/pagos");
  revalidatePath("/calendario");
  revalidatePath("/dashboard");
  revalidatePath("/hoy");
}

/** La unidad vuelve a estar disponible (salvo que esté en mantenimiento). */
async function releaseUnit(tx: Tx, unitId: string) {
  await tx.unit.updateMany({
    where: { id: unitId, status: { in: ["OCCUPIED"] } },
    data: { status: "AVAILABLE" },
  });
}

/** Borra los cargos sin pagos de los periodos posteriores a `afterPeriod`. */
async function dropUnpaidChargesAfter(tx: Tx, leaseId: string, afterPeriod: string) {
  await tx.rentCharge.deleteMany({
    where: { leaseId, period: { gt: afterPeriod }, payments: { none: {} } },
  });
}

// ------------------------------------------------------------------ alta

/** Contrato nuevo para un inquilino que ya está registrado. */
export async function createLease(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const { session, orgId, db } = await requireOrgUserAction(["OWNER", "ADMIN"]);

  const tenantId = String(formData.get("tenantId") ?? "");
  const unitId = String(formData.get("unitId") ?? "");
  if (!tenantId) return { error: "Elige al inquilino." };
  if (!unitId) return { error: "Elige la unidad." };

  const parsed = readLeaseTerms(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisa los datos del contrato." };
  }

  const tenant = await db.user.findFirst({
    where: { id: tenantId, role: "TENANT" },
    select: { id: true, name: true, active: true },
  });
  if (!tenant) return { error: "No se encontró al inquilino." };
  if (!tenant.active) return { error: "Reactiva al inquilino antes de asignarle una unidad." };

  const current = await db.lease.findFirst({
    where: { tenantId, status: "ACTIVE" },
    select: { id: true },
  });
  if (current) return { error: "Ese inquilino ya tiene un contrato vigente." };

  const start = parseDateInput(parsed.data.startDate);
  const end = parseDateInput(parsed.data.endDate);

  // Se valida bajo el candado de la unidad: dos altas simultáneas (contrato o
  // reserva) sobre la misma unidad no deben pasar las dos.
  const result = await db.$transaction(async (tx) => {
    await lockUnit(tx, unitId);
    const unavailable = await unitAvailabilityError(tx, unitId, start, end);
    if (unavailable) return { error: unavailable };
    const created = await tx.lease.create({ data: leaseData(orgId, unitId, tenantId, parsed.data) });
    await tx.unit.update({ where: { id: unitId }, data: { status: "OCCUPIED" } });
    return { lease: created };
  });
  if ("error" in result) return { error: result.error };
  const { lease } = result;

  await logAction(db, session.sub, "Alta de contrato", "Lease", lease.id, tenant.name);
  refresh(tenantId, unitId);
  redirect(`/inquilinos/${tenantId}`);
}

// ------------------------------------------------------------------ terminar

const endSchema = z.object({
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Indica la fecha de terminación."),
  reason: z.string().trim().max(200).optional(),
});

/**
 * Termina un contrato vigente en la fecha indicada.
 *
 * - Fecha de hoy o anterior: termina ya; la unidad queda disponible.
 * - Fecha futura (antes del vencimiento): solo se adelanta el vencimiento; el
 *   contrato termina solo ese día (ver src/lib/sweep.ts).
 *
 * En ambos casos se borran los cargos sin pagos de los meses posteriores.
 */
export async function endLease(leaseId: string, formData: FormData): Promise<ActionResult> {
  const { session, db } = await requireOrgUserAction(["OWNER", "ADMIN"]);

  const parsed = endSchema.safeParse({
    endDate: formData.get("endDate"),
    reason: formData.get("reason") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Revisa los datos." };

  const lease = await db.lease.findFirst({
    where: { id: leaseId, status: "ACTIVE" },
    select: { id: true, unitId: true, tenantId: true, startDate: true, endDate: true, tenant: { select: { name: true } } },
  });
  if (!lease) return { error: "No se encontró un contrato vigente." };

  const endDate = parseDateInput(parsed.data.endDate);
  if (endDate < lease.startDate) return { error: "La fecha no puede ser anterior al inicio del contrato." };
  if (endDate > lease.endDate) {
    return { error: "Para extender el contrato usa Renovar." };
  }

  const endsNow = endDate < startOfToday() || parsed.data.endDate === toInput(new Date());

  await db.$transaction(async (tx) => {
    await tx.lease.update({
      where: { id: lease.id },
      data: endsNow
        ? { status: "ENDED", endDate, endedAt: new Date(), endReason: parsed.data.reason || "Terminación anticipada" }
        : { endDate, endReason: parsed.data.reason || null },
    });
    await dropUnpaidChargesAfter(tx, lease.id, periodKey(endDate));
    if (endsNow) await releaseUnit(tx, lease.unitId);
  });

  await logAction(
    db,
    session.sub,
    endsNow ? "Terminación de contrato" : "Fin anticipado programado",
    "Lease",
    lease.id,
    `${lease.tenant.name} · ${parsed.data.endDate}${parsed.data.reason ? ` · ${parsed.data.reason}` : ""}`,
  );
  refresh(lease.tenantId, lease.unitId);
  return { ok: true };
}

function toInput(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// ------------------------------------------------------------------ renovar

const renewSchema = z.object({
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Indica el nuevo vencimiento."),
  rentAmount: z.coerce.number().min(0, "La renta no puede ser negativa.").max(99_999_999).optional(),
});

/**
 * Extiende un contrato vigente. Una renta nueva solo aplica a los cargos que
 * aún no se generan: lo ya cobrado no cambia.
 */
export async function renewLease(leaseId: string, formData: FormData): Promise<ActionResult> {
  const { session, db } = await requireOrgUserAction(["OWNER", "ADMIN"]);

  const parsed = renewSchema.safeParse({
    endDate: formData.get("endDate"),
    rentAmount: formData.get("rentAmount") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Revisa los datos." };

  const lease = await db.lease.findFirst({
    where: { id: leaseId, status: "ACTIVE" },
    select: { id: true, unitId: true, tenantId: true, endDate: true, tenant: { select: { name: true } } },
  });
  if (!lease) return { error: "No se encontró un contrato vigente." };

  const endDate = parseDateInput(parsed.data.endDate);
  if (endDate <= lease.endDate) {
    return { error: "El nuevo vencimiento debe ser posterior al actual." };
  }

  // Que la extensión no se cruce con reservas de corta estancia ya tomadas,
  // bajo el mismo candado que el alta de reservas.
  const renewed = await db.$transaction(async (tx) => {
    await lockUnit(tx, lease.unitId);
    const booking = await tx.booking.findFirst({
      where: { unitId: lease.unitId, status: "CONFIRMED", checkIn: { lt: endDate }, checkOut: { gt: lease.endDate } },
      select: { id: true },
    });
    if (booking) return false;
    await tx.lease.update({
      where: { id: lease.id },
      data: {
        endDate,
        endReason: null,
        ...(parsed.data.rentAmount !== undefined ? { rentAmount: parsed.data.rentAmount } : {}),
      },
    });
    return true;
  });
  if (!renewed) return { error: "Hay reservas de corta estancia en el periodo de la renovación." };

  await logAction(
    db,
    session.sub,
    "Renovación de contrato",
    "Lease",
    lease.id,
    `${lease.tenant.name} · hasta ${parsed.data.endDate}${parsed.data.rentAmount !== undefined ? ` · renta ${parsed.data.rentAmount}` : ""}`,
  );
  refresh(lease.tenantId, lease.unitId);
  return { ok: true };
}

// ------------------------------------------------------------------ cancelar

/**
 * Cancela un contrato capturado por error o que no llegó a empezar. Con pagos
 * registrados no se puede: hay historia que conservar, se termina en su lugar.
 */
export async function cancelLease(leaseId: string, formData: FormData): Promise<ActionResult> {
  const { session, db } = await requireOrgUserAction(["OWNER", "ADMIN"]);
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 200);

  const lease = await db.lease.findFirst({
    where: { id: leaseId, status: { in: ["ACTIVE", "DRAFT"] } },
    select: {
      id: true,
      unitId: true,
      tenantId: true,
      tenant: { select: { name: true } },
      _count: { select: { rentCharges: { where: { payments: { some: {} } } } } },
    },
  });
  if (!lease) return { error: "No se encontró el contrato." };
  if (lease._count.rentCharges > 0) {
    return { error: "El contrato ya tiene pagos registrados. Termínalo en lugar de cancelarlo." };
  }

  await db.$transaction(async (tx) => {
    await tx.lease.update({
      where: { id: lease.id },
      data: { status: "CANCELLED", endedAt: new Date(), endReason: reason || "Cancelado" },
    });
    await tx.rentCharge.deleteMany({ where: { leaseId: lease.id } });
    await releaseUnit(tx, lease.unitId);
  });

  await logAction(db, session.sub, "Cancelación de contrato", "Lease", lease.id, `${lease.tenant.name}${reason ? ` · ${reason}` : ""}`);
  refresh(lease.tenantId, lease.unitId);
  return { ok: true };
}
