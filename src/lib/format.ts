import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

/** Prisma devuelve Decimal; en la UI siempre trabajamos con number. */
export type Decimalish = { toString(): string } | number | string | null | undefined;

export function toNumber(value: Decimalish): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? parsed : 0;
}

const currencyFormatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  minimumFractionDigits: 2,
});

const compactCurrencyFormatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
});

export function money(value: Decimalish) {
  return currencyFormatter.format(toNumber(value));
}

/** Para tarjetas de KPI, donde los centavos son ruido. */
export function moneyCompact(value: Decimalish) {
  return compactCurrencyFormatter.format(toNumber(value));
}

/**
 * Monto separado en signo, símbolo y cifra. Lo usa <Amount> para atenuar el
 * símbolo de moneda y dejar la cifra como protagonista.
 */
export function moneyParts(value: Decimalish, { compact = false } = {}) {
  const formatter = compact ? compactCurrencyFormatter : currencyFormatter;
  const parts = formatter.formatToParts(toNumber(value));
  const pick = (types: Intl.NumberFormatPartTypes[]) =>
    parts
      .filter((part) => types.includes(part.type))
      .map((part) => part.value)
      .join("");
  return {
    sign: pick(["minusSign"]),
    symbol: pick(["currency"]),
    number: pick(["integer", "group", "decimal", "fraction"]),
  };
}

export function longDate(value: Date | string) {
  const date = typeof value === "string" ? parseISO(value) : value;
  return format(date, "d 'de' MMMM 'de' yyyy", { locale: es });
}

export function shortDate(value: Date | string) {
  const date = typeof value === "string" ? parseISO(value) : value;
  return format(date, "d MMM yyyy", { locale: es });
}

export function dayMonth(value: Date | string) {
  const date = typeof value === "string" ? parseISO(value) : value;
  return format(date, "d MMM", { locale: es });
}

export function inputDate(value: Date | string) {
  const date = typeof value === "string" ? parseISO(value) : value;
  return format(date, "yyyy-MM-dd");
}

// ------------------------------------------------------------------ periodos

/** Los periodos se guardan como "YYYY-MM" para poder ordenarlos como texto. */
export function periodKey(date: Date) {
  return format(date, "yyyy-MM");
}

export function periodLabel(period: string) {
  const [year, month] = period.split("-").map(Number);
  const date = new Date(year, (month ?? 1) - 1, 1);
  const label = format(date, "MMMM yyyy", { locale: es });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function periodShortLabel(period: string) {
  const [year, month] = period.split("-").map(Number);
  const date = new Date(year, (month ?? 1) - 1, 1);
  return format(date, "MMM yy", { locale: es });
}

export function shiftPeriod(period: string, months: number) {
  const [year, month] = period.split("-").map(Number);
  const date = new Date(year, (month ?? 1) - 1 + months, 1);
  return periodKey(date);
}

export function periodToDate(period: string) {
  const [year, month] = period.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, 1);
}

/** Lista de periodos recientes para los selectores de mes. */
export function recentPeriods(count = 12, from = new Date()) {
  const base = periodKey(from);
  return Array.from({ length: count }, (_, i) => shiftPeriod(base, -i));
}

export function daysBetween(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** "1 día" / "12 días" — evita el clásico "1 días". */
export function dayCount(days: number) {
  return days === 1 ? "1 día" : `${days} días`;
}

/**
 * Cuánto falta para un vencimiento, en lenguaje natural.
 * Evita frases como "vence en 0 días", que se leen mal justo cuando más
 * importa entenderlas.
 */
export function deadlineLabel(days: number) {
  if (days < 0) return `venció hace ${dayCount(Math.abs(days))}`;
  if (days === 0) return "vence hoy";
  if (days === 1) return "vence mañana";
  return `vence en ${dayCount(days)}`;
}

/** Cuándo pasa algo respecto de hoy: "hoy", "mañana", "en 3 días", "hace 2 días". */
export function relativeDay(days: number) {
  if (days === 0) return "hoy";
  if (days === 1) return "mañana";
  if (days === -1) return "ayer";
  return days > 0 ? `en ${dayCount(days)}` : `hace ${dayCount(Math.abs(days))}`;
}

/** Para cuándo es algo por hacer: "para hoy", "para mañana", "en 3 días", "atrasada 2 días". */
export function dueLabel(days: number) {
  if (days === 0) return "para hoy";
  if (days === 1) return "para mañana";
  return days > 1 ? `en ${dayCount(days)}` : `atrasada ${dayCount(Math.abs(days))}`;
}

export function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
