"use server";

import { revalidatePath } from "next/cache";
import { requireOrgUserAction } from "@/lib/auth/session";
import { toNumber } from "@/lib/format";
import {
  chargeDueDate,
  chargeableLeasesWhere,
  computeChargeStatus,
  toCents,
} from "@/lib/payments";
import {
  chargeRemaining,
  lockCharge,
  receiptError,
  recalcCharge,
  refreshPayments,
} from "@/server/payments-core";
import { z } from "zod";
import { logAction } from "@/server/actions/audit";
import type { ActionResult } from "@/lib/action-result";

const PERIOD = /^\d{4}-\d{2}$/;

/**
 * Genera los cargos de renta del periodo para todos los contratos vigentes que
 * aún no lo tengan. Es idempotente: correrlo dos veces no duplica cargos.
 */
export async function generateMonthlyCharges(
  period: string,
): Promise<ActionResult & { created?: number }> {
  const { session, orgId, db } = await requireOrgUserAction(["OWNER", "ADMIN"]);
  if (!PERIOD.test(period)) return { error: "Periodo no válido." };

  const leases = await db.lease.findMany({
    where: chargeableLeasesWhere(period),
    select: { id: true, rentAmount: true, paymentDay: true },
  });

  if (leases.length === 0) return { ok: true, created: 0 };

  await db.rentCharge.createMany({
    data: leases.map((lease) => {
      const dueDate = chargeDueDate(period, lease.paymentDay);
      return {
        organizationId: orgId,
        leaseId: lease.id,
        period,
        dueDate,
        amount: lease.rentAmount,
        // Un mes que ya pasó nace vencido.
        status: computeChargeStatus({ amount: toNumber(lease.rentAmount), paid: 0, dueDate }),
      };
    }),
    skipDuplicates: true,
  });

  await logAction(
    db,
    session.sub,
    "Generación de cargos de renta",
    "RentCharge",
    undefined,
    `${period}: ${leases.length} cargos`,
  );

  revalidatePath("/pagos");
  revalidatePath("/dashboard");
  revalidatePath("/hoy");
  return { ok: true, created: leases.length };
}

const paymentSchema = z.object({
  chargeId: z.string().min(1),
  amount: z.number().positive("El monto debe ser mayor a cero.").max(99_999_999),
  method: z.string().trim().min(1, "Indica la forma de pago.").max(40),
  reference: z.string().trim().max(80).optional(),
  receiptUrl: z.string().optional(),
});

/**
 * Registra un pago, total o parcial. No se puede pagar más de lo que falta:
 * un error de captura no debe dejar saldos a favor fantasmas.
 *
 * Es la única forma de confirmar un pago y solo la usa el equipo (OWNER o
 * ADMIN). El comprobante es evidencia que adjunta quien confirma: subir una
 * imagen nunca marca un cargo como pagado. Los comprobantes que envía el
 * inquilino (src/server/actions/proofs.ts) quedan por revisar y, al
 * aprobarlos, crean el pago por este mismo camino (`recalcCharge`).
 */
export async function registerPayment(input: {
  chargeId: string;
  amount: number;
  method: string;
  reference?: string;
  receiptUrl?: string;
}): Promise<ActionResult> {
  const { session, orgId, db } = await requireOrgUserAction(["OWNER", "ADMIN"]);

  const parsed = paymentSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisa los datos del pago." };
  }
  const data = parsed.data;

  const receipt = data.receiptUrl?.trim();
  if (receipt) {
    const invalid = receiptError(receipt);
    if (invalid) return { error: invalid };
  }

  const charge = await db.rentCharge.findUnique({
    where: { id: data.chargeId },
    select: { lease: { select: { tenantId: true } } },
  });
  if (!charge) return { error: "No se encontró el cargo." };

  // Lo que falta se lee bajo el candado del cargo: otro pago o la aprobación
  // de un comprobante simultáneos no deben sumar más que el cargo.
  const result = await db.$transaction(async (tx) => {
    await lockCharge(tx, data.chargeId);
    const remaining = (await chargeRemaining(tx, data.chargeId)) ?? 0;
    if (remaining === 0) return { error: "Este cargo ya está pagado." };
    if (toCents(data.amount) > toCents(remaining)) {
      return { error: `El monto excede lo que falta por pagar (${remaining.toFixed(2)}).` };
    }
    await tx.rentPayment.create({
      data: {
        organizationId: orgId,
        rentChargeId: data.chargeId,
        amount: data.amount,
        paidAt: new Date(),
        method: data.method,
        reference: data.reference || null,
        receiptUrl: receipt || null,
        recordedById: session.sub,
      },
    });
    await recalcCharge(tx, data.chargeId);
    return { remaining };
  });
  if ("error" in result) return { error: result.error };
  const { remaining } = result;

  await logAction(
    db,
    session.sub,
    toCents(data.amount) === toCents(remaining) ? "Registro de pago" : "Registro de pago parcial",
    "RentCharge",
    data.chargeId,
    `${data.method} · ${data.amount.toFixed(2)}`,
  );
  refreshPayments(charge.lease.tenantId);
  return { ok: true };
}

/** Borra un pago registrado por error; el cargo vuelve a su estado. */
export async function deletePayment(paymentId: string): Promise<ActionResult> {
  const { session, db } = await requireOrgUserAction(["OWNER", "ADMIN"]);

  const payment = await db.rentPayment.findUnique({
    where: { id: paymentId },
    select: { rentChargeId: true, amount: true, rentCharge: { select: { lease: { select: { tenantId: true } } } } },
  });
  if (!payment) return { error: "No se encontró el pago." };

  await db.$transaction(async (tx) => {
    await tx.rentPayment.delete({ where: { id: paymentId } });
    await recalcCharge(tx, payment.rentChargeId);
  });

  await logAction(db, session.sub, "Cancelación de pago", "RentCharge", payment.rentChargeId, toNumber(payment.amount).toFixed(2));
  refreshPayments(payment.rentCharge.lease.tenantId);
  return { ok: true };
}

/** Deshace todos los pagos de un cargo (registrados por error). */
export async function markChargeUnpaid(chargeId: string): Promise<ActionResult> {
  const { session, db } = await requireOrgUserAction(["OWNER", "ADMIN"]);

  const charge = await db.rentCharge.findUnique({
    where: { id: chargeId },
    select: { lease: { select: { tenantId: true } } },
  });
  if (!charge) return { error: "No se encontró el cargo." };

  await db.$transaction(async (tx) => {
    // Los comprobantes eran evidencia de esos pagos: se van con ellos.
    await tx.rentPayment.deleteMany({ where: { rentChargeId: chargeId } });
    await recalcCharge(tx, chargeId);
  });

  await logAction(db, session.sub, "Cancelación de pagos", "RentCharge", chargeId);
  refreshPayments(charge.lease.tenantId);
  return { ok: true };
}
