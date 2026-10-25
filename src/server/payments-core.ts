import "server-only";
import { revalidatePath } from "next/cache";
import type { OrgDb } from "@/lib/db/scoped";
import { toNumber } from "@/lib/format";
import { computeChargeStatus, toCents } from "@/lib/payments";

/**
 * Piezas de pagos que comparten las acciones del equipo (Cobros) y las de
 * comprobantes (portal y revisión). Viven fuera de los archivos "use server"
 * porque esos solo pueden exportar acciones.
 */

export type Tx = Parameters<Parameters<OrgDb["$transaction"]>[0]>[0];

/**
 * Formatos aceptados para la foto de un comprobante. El navegador siempre
 * manda JPEG (ver src/lib/images.ts); la lista es la red de seguridad del
 * servidor.
 */
const RECEIPT_PATTERN = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const MAX_RECEIPT_CHARS = 1_400_000; // ~1 MB de imagen ya en base64

/**
 * Por qué la imagen (data URL) no sirve, o null si sirve. `what` nombra la
 * imagen en el mensaje: "El comprobante", "La foto"…
 */
export function imageError(dataUrl: string, what = "El comprobante") {
  if (dataUrl.length > MAX_RECEIPT_CHARS) return `${what} es demasiado pesad${what.startsWith("La ") ? "a" : "o"}.`;
  if (!RECEIPT_PATTERN.test(dataUrl)) return `${what} debe ser una imagen.`;
  return null;
}

/** Por qué la imagen no sirve como comprobante, o null si sirve. */
export function receiptError(receipt: string) {
  return imageError(receipt, "El comprobante");
}

/**
 * Candado del cargo hasta que termine la transacción: dos pagos (o un pago y
 * la aprobación de un comprobante) del mismo cargo se validan de uno en uno,
 * así la suma nunca rebasa lo que falta.
 */
export async function lockCharge(tx: Tx, chargeId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`charge:${chargeId}`}))`;
}

/** Lo que falta por pagar del cargo, leído dentro de la transacción. */
export async function chargeRemaining(tx: Tx, chargeId: string) {
  const charge = await tx.rentCharge.findUnique({
    where: { id: chargeId },
    select: { amount: true, paidAmount: true },
  });
  if (!charge) return null;
  return Math.max(0, toCents(toNumber(charge.amount)) - toCents(toNumber(charge.paidAmount))) / 100;
}

/**
 * Recalcula el resumen del cargo a partir de sus pagos: suma, estado y datos
 * del último pago (los que muestran Cobros y el portal).
 */
export async function recalcCharge(tx: Tx, chargeId: string) {
  const charge = await tx.rentCharge.findUniqueOrThrow({
    where: { id: chargeId },
    select: {
      amount: true,
      dueDate: true,
      payments: {
        orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
        select: { amount: true, paidAt: true, method: true, reference: true, receiptUrl: true },
      },
    },
  });
  const paidCents = charge.payments.reduce((sum, p) => sum + toCents(toNumber(p.amount)), 0);
  const last = charge.payments[0];
  await tx.rentCharge.update({
    where: { id: chargeId },
    data: {
      paidAmount: paidCents / 100,
      status: computeChargeStatus({
        amount: toNumber(charge.amount),
        paid: paidCents / 100,
        dueDate: charge.dueDate,
      }),
      paidAt: last?.paidAt ?? null,
      method: last?.method ?? null,
      reference: last?.reference ?? null,
      receiptUrl: last?.receiptUrl ?? null,
    },
  });
}

/** Pantallas que muestran cargos, pagos o comprobantes de un inquilino. */
export function refreshPayments(tenantId: string) {
  revalidatePath("/pagos");
  revalidatePath("/dashboard");
  revalidatePath("/hoy");
  revalidatePath("/portal");
  revalidatePath("/portal/pagos");
  revalidatePath(`/inquilinos/${tenantId}`);
}
