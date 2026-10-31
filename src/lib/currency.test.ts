import { describe, expect, it } from "vitest";
import {
  addMoney,
  anyNegative,
  hasMoney,
  isCurrency,
  progressByCurrency,
  moneyEntries,
  subtractMoney,
  sumMoney,
  totalByCurrency,
} from "./currency";
import { money, moneyCompact, moneyParts, moneyTotals } from "./format";

describe("totales por moneda", () => {
  it("nunca suma pesos con dólares", () => {
    const totals = totalByCurrency(
      [
        { c: "MXN" as const, v: 12000 },
        { c: "USD" as const, v: 2000 },
        { c: "MXN" as const, v: 3500 },
      ],
      (i) => i.c,
      (i) => i.v,
    );
    expect(totals).toEqual({ MXN: 15500, USD: 2000 });
  });

  it("suma en centavos, sin errores de punto flotante", () => {
    expect(addMoney(addMoney({}, "USD", 0.1), "USD", 0.2)).toEqual({ USD: 0.3 });
  });

  it("suma y resta totales moneda por moneda", () => {
    expect(sumMoney({ MXN: 100 }, { USD: 50 }, { MXN: 25 })).toEqual({ MXN: 125, USD: 50 });
    expect(subtractMoney({ MXN: 100, USD: 50 }, { USD: 80 })).toEqual({ MXN: 100, USD: -30 });
  });

  it("muestra pesos primero y omite ceros, pero nunca queda vacío", () => {
    expect(moneyEntries({ USD: 10, MXN: 5 })).toEqual([["MXN", 5], ["USD", 10]]);
    expect(moneyEntries({ MXN: 0, USD: 10 })).toEqual([["USD", 10]]);
    expect(moneyEntries({})).toEqual([["MXN", 0]]);
    expect(moneyEntries({ USD: 0 })).toEqual([["USD", 0]]);
  });

  it("detecta montos y negativos", () => {
    expect(hasMoney({ MXN: 0 })).toBe(false);
    expect(hasMoney({ USD: 1 })).toBe(true);
    expect(anyNegative({ MXN: 10, USD: -1 })).toBe(true);
  });

  it("valida la moneda que llega de un formulario", () => {
    expect(isCurrency("USD")).toBe(true);
    expect(isCurrency("EUR")).toBe(false);
    expect(isCurrency(undefined)).toBe(false);
  });
});

describe("formato de dinero", () => {
  it("los pesos se ven como siempre", () => {
    expect(money(12345.5)).toBe("$12,345.50");
    expect(money(12345.5, "MXN")).toBe("$12,345.50");
    expect(moneyCompact(12345.5)).toBe("$12,346");
  });

  it("los dólares llevan USD para no confundirse", () => {
    expect(money(12345.5, "USD")).toBe("USD 12,345.50");
    expect(moneyCompact(2000, "USD")).toBe("USD 2,000");
    expect(moneyParts(-5, { currency: "USD" })).toMatchObject({ sign: "-", symbol: "USD", number: "5.00" });
  });
});

describe("moneyTotals", () => {
  it("une las monedas con un punto medio, pesos primero", () => {
    expect(moneyTotals({ USD: 2000, MXN: 12000 }, { compact: true })).toBe("$12,000 · USD 2,000");
    expect(moneyTotals({})).toBe("$0.00");
  });
});

describe("progressByCurrency", () => {
  it("calcula el avance de cada moneda por separado", () => {
    expect(progressByCurrency({ MXN: 1000, USD: 200 }, { MXN: 500, USD: 200 })).toEqual([
      ["MXN", 50],
      ["USD", 100],
    ]);
    expect(progressByCurrency({}, {})).toEqual([]);
  });
});
