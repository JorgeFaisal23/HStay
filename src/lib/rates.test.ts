import { describe, expect, it } from "vitest";
import { quoteLabel, quoteStay } from "@/lib/rates";

const all = { nightly: 1000, weekly: 6000, monthly: 20000 };

describe("quoteStay", () => {
  it("arma bloques de meses, semanas y noches", () => {
    const quote = quoteStay(40, all)!; // 30 + 7 + 3
    expect(quoteLabel(quote)).toBe("1 mes + 1 semana + 3 noches");
    expect(quote.total).toBe(20000 + 6000 + 3000);
  });

  it("10 noches = 1 semana + 3 noches", () => {
    const quote = quoteStay(10, all)!;
    expect(quoteLabel(quote)).toBe("1 semana + 3 noches");
    expect(quote.total).toBe(9000);
  });

  it("sin tarifa mensual, los meses pasan a semanas; sin semanal, a noches", () => {
    expect(quoteLabel(quoteStay(31, { ...all, monthly: null })!)).toBe("4 semanas + 3 noches");
    expect(quoteStay(9, { nightly: 1000, weekly: null, monthly: null })).toEqual({
      total: 9000,
      parts: [{ unit: "night", count: 9, rate: 1000, subtotal: 9000 }],
    });
  });

  it("sin tarifa por noche, las noches sueltas se prorratean", () => {
    // 8 noches con solo semanal de 7,000: 1 semana + 1 noche a 1,000.
    expect(quoteStay(8, { nightly: null, weekly: 7000, monthly: null })?.total).toBe(8000);
    // 2 noches con solo mensual de 30,000: 2 × 1,000.
    expect(quoteStay(2, { nightly: null, weekly: null, monthly: 30000 })?.total).toBe(2000);
    // Redondeo a centavos: 6,000 ÷ 7 = 857.14 por noche.
    expect(quoteStay(1, { nightly: null, weekly: 6000, monthly: null })?.total).toBe(857.14);
  });

  it("sin noches o sin tarifas no sugiere nada", () => {
    expect(quoteStay(0, all)).toBeNull();
    expect(quoteStay(3, { nightly: null, weekly: null, monthly: null })).toBeNull();
    expect(quoteStay(3, { nightly: 0, weekly: 0, monthly: null })).toBeNull();
  });
});
