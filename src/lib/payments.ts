import type { ChargeStatus } from "@/generated/prisma/enums";

/**
 * Estado de un cargo de renta a partir de lo pagado. Todo en centavos: sumar
 * pagos en punto flotante deja residuos (0.1 + 0.2) que convertirían un cargo
 * liquidado en "parcial".
 */

export function toCents(amount: number) {
  return Math.round(amount * 100);
}

/** Inicio del día de hoy: un cargo vence a partir del día siguiente a su fecha. */
export function startOfToday(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function computeChargeStatus(input: {
  amount: number;
  paid: number;
  dueDate: Date;
  now?: Date;
}): ChargeStatus {
  const amount = toCents(input.amount);
  const paid = toCents(input.paid);
  if (paid >= amount) return "PAID";
  if (paid > 0) return "PARTIAL";
  return input.dueDate < startOfToday(input.now) ? "OVERDUE" : "PENDING";
}

/** Lo que falta por pagar, nunca negativo. */
export function remainingOf(amount: number, paid: number) {
  return Math.max(0, toCents(amount) - toCents(paid)) / 100;
}

/** Primer y último día de un periodo "YYYY-MM". */
export function periodBounds(period: string) {
  const [year, month] = period.split("-").map(Number);
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  return { start, end };
}

/**
 * Contratos que deben tener cargo en el periodo y aún no lo tienen. Lo usan
 * "Generar cargos" y el aviso de "Hoy", para que cuenten exactamente lo mismo.
 */
export function chargeableLeasesWhere(period: string) {
  const { start, end } = periodBounds(period);
  return {
    status: "ACTIVE" as const,
    startDate: { lte: end },
    endDate: { gte: start },
    rentCharges: { none: { period } },
  };
}

/** Fecha de pago del cargo: si el contrato dice "día 31" y el mes tiene 30, el último día. */
export function chargeDueDate(period: string, paymentDay: number) {
  const { start, end } = periodBounds(period);
  return new Date(start.getFullYear(), start.getMonth(), Math.min(paymentDay, end.getDate()), 12);
}
