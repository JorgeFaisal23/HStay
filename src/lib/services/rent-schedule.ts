/**
 * Fechas de cobro de renta. El día de pago del contrato va del 1 al 31; en los
 * meses que no tienen ese día, el cobro cae el último día del mes
 * (día 31 en abril → 30 de abril; día 30 en febrero → 28 o 29).
 */

export const MIN_PAYMENT_DAY = 1;
export const MAX_PAYMENT_DAY = 31;

/** Día real de cobro dentro de un mes dado (month: 0 = enero). */
export function effectivePaymentDay(year: number, month: number, paymentDay: number): number {
  const lastDay = new Date(year, month + 1, 0).getDate();
  const day = Math.trunc(paymentDay);
  return Math.min(Math.max(day, MIN_PAYMENT_DAY), lastDay);
}

/**
 * Fecha de vencimiento del cargo de un periodo "YYYY-MM". Se fija a mediodía
 * para que un cambio de zona horaria no la mueva al día anterior.
 */
export function rentDueDate(period: string, paymentDay: number): Date {
  const [year, month] = period.split("-").map(Number);
  const monthIndex = (month ?? 1) - 1;
  return new Date(year, monthIndex, effectivePaymentDay(year, monthIndex, paymentDay), 12);
}
