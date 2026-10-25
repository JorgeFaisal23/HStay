/**
 * Total sugerido de una estancia corta a partir de las tarifas de la unidad.
 *
 * Regla (decisión del 2026-10-25): por bloques. Cada 30 noches usan la tarifa
 * mensual, cada 7 la semanal y el resto la de por noche; si una tarifa falta,
 * esas noches pasan al bloque siguiente más chico. Si no hay tarifa por noche,
 * las noches sueltas se prorratean de la semanal (÷7) o, si tampoco hay, de la
 * mensual (÷30). El total siempre es una sugerencia: quien captura la
 * reserva lo puede cambiar.
 */

export type StayRates = {
  nightly: number | null;
  weekly: number | null;
  monthly: number | null;
};

export const NIGHTS_PER_WEEK = 7;
export const NIGHTS_PER_MONTH = 30;

export type QuotePart = { unit: "month" | "week" | "night"; count: number; rate: number; subtotal: number };

export type StayQuote = { total: number; parts: QuotePart[] };

const cents = (value: number) => Math.round(value * 100);
const positive = (value: number | null): value is number => value !== null && value > 0;

export function hasStayRates(rates: StayRates) {
  return positive(rates.nightly) || positive(rates.weekly) || positive(rates.monthly);
}

/** La cotización, o null si no hay noches o la unidad no tiene tarifas. */
export function quoteStay(nights: number, rates: StayRates): StayQuote | null {
  if (!Number.isInteger(nights) || nights <= 0 || !hasStayRates(rates)) return null;

  const parts: QuotePart[] = [];
  let left = nights;

  if (positive(rates.monthly) && left >= NIGHTS_PER_MONTH) {
    const count = Math.floor(left / NIGHTS_PER_MONTH);
    parts.push({ unit: "month", count, rate: rates.monthly, subtotal: count * rates.monthly });
    left -= count * NIGHTS_PER_MONTH;
  }
  if (positive(rates.weekly) && left >= NIGHTS_PER_WEEK) {
    const count = Math.floor(left / NIGHTS_PER_WEEK);
    parts.push({ unit: "week", count, rate: rates.weekly, subtotal: count * rates.weekly });
    left -= count * NIGHTS_PER_WEEK;
  }
  if (left > 0) {
    const nightly = positive(rates.nightly)
      ? rates.nightly
      : positive(rates.weekly)
        ? rates.weekly / NIGHTS_PER_WEEK
        : (rates.monthly as number) / NIGHTS_PER_MONTH;
    const rate = cents(nightly) / 100;
    parts.push({ unit: "night", count: left, rate, subtotal: left * rate });
  }

  const total = parts.reduce((sum, part) => sum + cents(part.subtotal), 0) / 100;
  return { total, parts: parts.map((part) => ({ ...part, subtotal: cents(part.subtotal) / 100 })) };
}

const UNIT_WORDS: Record<QuotePart["unit"], [string, string]> = {
  month: ["mes", "meses"],
  week: ["semana", "semanas"],
  night: ["noche", "noches"],
};

/** "1 mes + 2 semanas + 3 noches". */
export function quoteLabel(quote: StayQuote) {
  return quote.parts
    .map((part) => `${part.count} ${UNIT_WORDS[part.unit][part.count === 1 ? 0 : 1]}`)
    .join(" + ");
}
