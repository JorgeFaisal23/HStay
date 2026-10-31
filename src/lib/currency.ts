/**
 * Moneda de una propiedad y totales por moneda.
 *
 * Cada propiedad cobra en una moneda (pesos o dólares) y todo lo suyo se
 * guarda y se muestra en ella: aquí no hay tipo de cambio ni conversión. Por
 * eso un total que junta varias propiedades no es un número sino uno por
 * moneda, y nunca se suman pesos con dólares.
 */

export const CURRENCIES = ["MXN", "USD"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const CURRENCY_LABELS: Record<Currency, string> = {
  MXN: "Pesos mexicanos (MXN)",
  USD: "Dólares estadounidenses (USD)",
};

export function isCurrency(value: unknown): value is Currency {
  return typeof value === "string" && (CURRENCIES as readonly string[]).includes(value);
}

/** Total por moneda. Una moneda ausente vale cero. */
export type MoneyByCurrency = Partial<Record<Currency, number>>;

const cents = (value: number) => Math.round(value * 100);

/** Suma un monto a su moneda, en centavos para no acumular errores. */
export function addMoney(totals: MoneyByCurrency, currency: Currency, amount: number): MoneyByCurrency {
  return { ...totals, [currency]: (cents(totals[currency] ?? 0) + cents(amount)) / 100 };
}

/** Suma de varios totales por moneda. */
export function sumMoney(...totals: MoneyByCurrency[]): MoneyByCurrency {
  let result: MoneyByCurrency = {};
  for (const total of totals) {
    for (const currency of CURRENCIES) {
      const value = total[currency];
      if (value !== undefined) result = addMoney(result, currency, value);
    }
  }
  return result;
}

/** Resta `b` de `a` moneda por moneda. */
export function subtractMoney(a: MoneyByCurrency, b: MoneyByCurrency): MoneyByCurrency {
  let result: MoneyByCurrency = { ...a };
  for (const currency of CURRENCIES) {
    const value = b[currency];
    if (value !== undefined) result = addMoney(result, currency, -value);
  }
  return result;
}

/** Total por moneda de una lista, eligiendo moneda y monto de cada elemento. */
export function totalByCurrency<T>(
  items: readonly T[],
  currencyOf: (item: T) => Currency,
  amountOf: (item: T) => number,
): MoneyByCurrency {
  let result: MoneyByCurrency = {};
  for (const item of items) result = addMoney(result, currencyOf(item), amountOf(item));
  return result;
}

/**
 * Las monedas a mostrar, pesos primero. Las que valen cero se omiten salvo que
 * todas valgan cero: entonces se muestra un cero en pesos (o en la única
 * moneda que haya).
 */
export function moneyEntries(totals: MoneyByCurrency): [Currency, number][] {
  const present = CURRENCIES.filter((c) => totals[c] !== undefined).map(
    (c) => [c, totals[c] ?? 0] as [Currency, number],
  );
  const nonZero = present.filter(([, value]) => value !== 0);
  if (nonZero.length > 0) return nonZero;
  return [[present[0]?.[0] ?? "MXN", 0]];
}

/** ¿Algún monto distinto de cero? */
export function hasMoney(totals: MoneyByCurrency) {
  return CURRENCIES.some((c) => (totals[c] ?? 0) !== 0);
}

/** ¿Algún monto negativo? Para pintar en rojo un pendiente, por ejemplo. */
export function anyNegative(totals: MoneyByCurrency) {
  return CURRENCIES.some((c) => (totals[c] ?? 0) < 0);
}

/** Selección de Prisma para llegar a la moneda desde una unidad. */
export const UNIT_CURRENCY = { building: { select: { currency: true } } } as const;

/**
 * Moneda de una cuenta de servicio: la de su propiedad, o la de la propiedad
 * de su unidad si es un servicio de unidad.
 */
export function accountCurrency(account: {
  building: { currency: Currency } | null;
  unit: { building: { currency: Currency } } | null;
}): Currency {
  return account.building?.currency ?? account.unit?.building.currency ?? "MXN";
}

/** Selección de Prisma para `accountCurrency`. */
export const ACCOUNT_CURRENCY = {
  building: { select: { currency: true } },
  unit: { select: UNIT_CURRENCY },
} as const;

/**
 * Porcentaje cobrado de lo esperado, por moneda (pesos primero). Solo aparecen
 * las monedas con algo esperado; sin nada esperado, la lista queda vacía.
 */
export function progressByCurrency(
  expected: MoneyByCurrency,
  collected: MoneyByCurrency,
): [Currency, number][] {
  return CURRENCIES.filter((c) => (expected[c] ?? 0) > 0).map((c) => [
    c,
    Math.round(((collected[c] ?? 0) / (expected[c] ?? 1)) * 100),
  ]);
}
