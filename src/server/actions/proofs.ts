"use server";

import { z } from "zod";
import { requireOrgUserAction } from "@/lib/auth/session";
import { money, periodLabel, toNumber } from "@/lib/format";
import { remainingOf, startOfToday, toCents } from "@/lib/payments";
import { PAYMENT_METHODS } from "@/lib/payment-methods";
import { logAction } from "@/server/actions/audit";
import { parseDateInput } from "@/server/actions/lease-rules";
import {
  chargeRemaining,
  lockCharge,
  receiptError,
  recalcCharge,
  refreshPayments,
} from "@/server/payments-core";
import type { ActionResult } from "@/lib/action-result";
import type { OrgDb } from "@/lib/db/scoped";

/**
 * Comprobantes de pago que envía el inquilino desde el portal.
 *
 * Regla central: enviar un comprobante **no** paga nada. Queda "por revisar"
 * hasta que alguien del equipo lo aprueba (y entonces se crea el pago, con el
 * monto que el equipo confirme) o lo rechaza con un motivo que el inquilino
 * ve. Un cargo tiene como máximo un comprobante por revisar a la vez (lo
 * impone también un índice único parcial en la base).
 */

const PENDING_EXISTS = "Ya enviaste un comprobante de este cargo; espera a que lo revisen.";

const submitSchema = z.object({
  chargeId: z.string().min(1),
  amount: z.number().positive("El monto debe ser mayor a cero.").max(99_999_999),
  method: z.enum(PAYMENT_METHODS, { error: "Elige la forma de pago." }),
  reference: z.string().trim().max(80).optional(),
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Indica cuándo pagaste."),
  receiptUrl: z.string().trim().min(1, "Agrega la foto del comprobante."),
});

function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";
}

/** El inquilino avisa que pagó un cargo suyo, con la foto del comprobante. */
export async function submitPaymentProof(input: {
  chargeId: string;
  amount: number;
  method: string;
  reference?: string;
  paidOn: string;
  receiptUrl: string;
}): Promise<ActionResult> {
  const { session, orgId, db } = await requireOrgUserAction(["TENANT"]);

  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisa los datos del comprobante." };
  }
  const data = parsed.data;

  const invalid = receiptError(data.receiptUrl);
  if (invalid) return { error: invalid };

  const paidOn = parseDateInput(data.paidOn);
  if (Number.isNaN(paidOn.getTime())) return { error: "Indica cuándo pagaste." };
  const tomorrow = new Date(startOfToday());
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (paidOn >= tomorrow) return { error: "La fecha de pago no puede ser futura." };

  // Solo sus propios cargos: el filtro por inquilino va en la consulta, así un
  // id de otro inquilino (o de otra arrendadora) responde igual que uno que no existe.
  const charge = await db.rentCharge.findFirst({
    where: { id: data.chargeId, lease: { tenantId: session.sub } },
    select: {
      period: true,
      amount: true,
      paidAmount: true,
      proofs: { where: { status: "SUBMITTED" }, select: { id: true }, take: 1 },
      lease: { select: { unit: { select: { building: { select: { currency: true } } } } } },
    },
  });
  if (!charge) return { error: "No se encontró el cargo." };

  const remaining = remainingOf(toNumber(charge.amount), toNumber(charge.paidAmount));
  if (remaining === 0) return { error: "Este cargo ya está pagado." };
  if (toCents(data.amount) > toCents(remaining)) {
    return { error: `El monto es mayor a lo que falta por pagar (${money(remaining, charge.lease.unit.building.currency)}).` };
  }
  if (charge.proofs.length > 0) return { error: PENDING_EXISTS };

  let proofId: string;
  try {
    const proof = await db.paymentProof.create({
      data: {
        organizationId: orgId,
        rentChargeId: data.chargeId,
        submittedById: session.sub,
        amount: data.amount,
        method: data.method,
        reference: data.reference || null,
        paidOn,
        receiptUrl: data.receiptUrl,
      },
      select: { id: true },
    });
    proofId = proof.id;
  } catch (error) {
    if (isUniqueViolation(error)) return { error: PENDING_EXISTS };
    throw error;
  }

  await logAction(
    db,
    session.sub,
    "Envío de comprobante",
    "PaymentProof",
    proofId,
    `${periodLabel(charge.period)} · ${money(data.amount, charge.lease.unit.building.currency)} · ${data.method}`,
  );
  refreshPayments(session.sub);
  return { ok: true };
}

/** Datos de un comprobante por revisar, o un error si ya no lo está. */
async function findSubmitted(db: OrgDb, proofId: string) {
  const proof = await db.paymentProof.findUnique({
    where: { id: proofId },
    select: {
      status: true,
      rentChargeId: true,
      submittedById: true,
      amount: true,
      method: true,
      reference: true,
      paidOn: true,
      receiptUrl: true,
      rentCharge: {
        select: {
          period: true,
          lease: { select: { unit: { select: { building: { select: { currency: true } } } } } },
        },
      },
      submittedBy: { select: { name: true } },
    },
  });
  if (!proof) return { error: "No se encontró el comprobante." };
  if (proof.status !== "SUBMITTED") return { error: "Este comprobante ya se revisó." };
  return { proof };
}

const approveSchema = z.object({
  amount: z.number().positive("El monto debe ser mayor a cero.").max(99_999_999).optional(),
});

/**
 * Aprueba un comprobante y registra el pago. El equipo puede ajustar el monto
 * (p. ej. si la transferencia fue por menos): el pago se registra por lo que
 * el equipo confirme y el comprobante conserva lo que declaró el inquilino.
 */
export async function approvePaymentProof(
  proofId: string,
  input: { amount?: number } = {},
): Promise<ActionResult> {
  const { session, orgId, db } = await requireOrgUserAction(["OWNER", "ADMIN"]);

  const parsed = approveSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Revisa el monto." };

  const found = await findSubmitted(db, proofId);
  if ("error" in found) return { error: found.error };
  const { proof } = found;
  const declared = toNumber(proof.amount);
  const amount = parsed.data.amount ?? declared;

  const result = await db.$transaction(async (tx) => {
    await lockCharge(tx, proof.rentChargeId);

    // Tomar el comprobante solo si sigue por revisar: dos revisiones
    // simultáneas no pueden registrar dos pagos.
    const claimed = await tx.paymentProof.updateMany({
      where: { id: proofId, status: "SUBMITTED" },
      data: { status: "APPROVED", reviewedById: session.sub, reviewedAt: new Date() },
    });
    if (claimed.count === 0) return { error: "Este comprobante ya se revisó." };

    const remaining = (await chargeRemaining(tx, proof.rentChargeId)) ?? 0;
    if (remaining === 0 || toCents(amount) > toCents(remaining)) {
      // Deshace la toma del comprobante: la transacción se revierte entera.
      throw new AmountError(
        remaining === 0
          ? "Este cargo ya está pagado. Rechaza el comprobante con el motivo."
          : `El monto es mayor a lo que falta por pagar (${money(remaining, proof.rentCharge.lease.unit.building.currency)}).`,
      );
    }

    const payment = await tx.rentPayment.create({
      data: {
        organizationId: orgId,
        rentChargeId: proof.rentChargeId,
        amount,
        paidAt: proof.paidOn,
        method: proof.method,
        reference: proof.reference,
        receiptUrl: proof.receiptUrl,
        recordedById: session.sub,
      },
      select: { id: true },
    });
    await tx.paymentProof.update({ where: { id: proofId }, data: { paymentId: payment.id } });
    await recalcCharge(tx, proof.rentChargeId);
    return { ok: true as const };
  }).catch((error: unknown) => {
    if (error instanceof AmountError) return { error: error.message };
    throw error;
  });
  if ("error" in result) return { error: result.error };

  const adjusted = toCents(amount) !== toCents(declared);
  await logAction(
    db,
    session.sub,
    adjusted ? "Aprobación de comprobante con monto ajustado" : "Aprobación de comprobante",
    "PaymentProof",
    proofId,
    `${proof.submittedBy.name} · ${periodLabel(proof.rentCharge.period)} · ${money(amount, proof.rentCharge.lease.unit.building.currency)}${adjusted ? ` (declaró ${money(declared, proof.rentCharge.lease.unit.building.currency)})` : ""}`,
  );
  refreshPayments(proof.submittedById);
  return { ok: true };
}

class AmountError extends Error {}

const rejectSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(3, "Escribe el motivo del rechazo: el inquilino lo verá.")
    .max(200, "El motivo debe tener como máximo 200 caracteres."),
});

/** Rechaza un comprobante con un motivo que el inquilino ve; puede reenviar otro. */
export async function rejectPaymentProof(proofId: string, reason: string): Promise<ActionResult> {
  const { session, db } = await requireOrgUserAction(["OWNER", "ADMIN"]);

  const parsed = rejectSchema.safeParse({ reason });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Escribe el motivo." };

  const found = await findSubmitted(db, proofId);
  if ("error" in found) return { error: found.error };

  const updated = await db.paymentProof.updateMany({
    where: { id: proofId, status: "SUBMITTED" },
    data: {
      status: "REJECTED",
      reviewedById: session.sub,
      reviewedAt: new Date(),
      rejectionReason: parsed.data.reason,
    },
  });
  if (updated.count === 0) return { error: "Este comprobante ya se revisó." };

  await logAction(
    db,
    session.sub,
    "Rechazo de comprobante",
    "PaymentProof",
    proofId,
    `${found.proof.submittedBy.name} · ${periodLabel(found.proof.rentCharge.period)} · ${parsed.data.reason}`,
  );
  refreshPayments(found.proof.submittedById);
  return { ok: true };
}
