import { describe, expect, it } from "vitest";
import { chargeDueDate, computeChargeStatus, remainingOf } from "@/lib/payments";

describe("chargeDueDate (día de pago 1–31)", () => {
  const ymd = (d: Date) => [d.getFullYear(), d.getMonth() + 1, d.getDate()];

  it("respeta el día pactado cuando el mes lo tiene", () => {
    expect(ymd(chargeDueDate("2026-10", 31))).toEqual([2026, 10, 31]);
    expect(ymd(chargeDueDate("2026-10", 18))).toEqual([2026, 10, 18]);
  });

  it("en meses cortos cobra el último día", () => {
    expect(ymd(chargeDueDate("2026-11", 31))).toEqual([2026, 11, 30]);
    expect(ymd(chargeDueDate("2027-02", 30))).toEqual([2027, 2, 28]);
    expect(ymd(chargeDueDate("2028-02", 30))).toEqual([2028, 2, 29]);
  });

  it("vence a mediodía", () => {
    expect(chargeDueDate("2026-10", 5).getHours()).toBe(12);
  });
});

const now = new Date(2026, 9, 15, 10); // 15 oct 2026
const yesterday = new Date(2026, 9, 14, 12);
const today = new Date(2026, 9, 15, 12);

describe("computeChargeStatus", () => {
  it("pagado completo, aunque los pagos sumen con decimales", () => {
    expect(computeChargeStatus({ amount: 0.3, paid: 0.1 + 0.2, dueDate: yesterday, now })).toBe("PAID");
    expect(computeChargeStatus({ amount: 6500, paid: 7000, dueDate: today, now })).toBe("PAID");
  });

  it("parcial cuando hay algo pagado", () => {
    expect(computeChargeStatus({ amount: 6500, paid: 3000, dueDate: yesterday, now })).toBe("PARTIAL");
  });

  it("vencido solo a partir del día siguiente a la fecha de pago", () => {
    expect(computeChargeStatus({ amount: 6500, paid: 0, dueDate: today, now })).toBe("PENDING");
    expect(computeChargeStatus({ amount: 6500, paid: 0, dueDate: yesterday, now })).toBe("OVERDUE");
  });
});

describe("remainingOf", () => {
  it("resta en centavos y nunca da negativo", () => {
    expect(remainingOf(6500, 3000.5)).toBe(3499.5);
    expect(remainingOf(100, 150)).toBe(0);
  });
});
