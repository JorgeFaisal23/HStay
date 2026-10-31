import { describe, it, expect } from "vitest";
import { effectivePaymentDay, rentDueDate } from "./rent-schedule";

function ymd(date: Date) {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()];
}

describe("effectivePaymentDay", () => {
  it("respeta el día pactado cuando el mes lo tiene", () => {
    expect(effectivePaymentDay(2026, 0, 31)).toBe(31); // enero
    expect(effectivePaymentDay(2026, 9, 15)).toBe(15); // octubre
    expect(effectivePaymentDay(2026, 2, 1)).toBe(1); // marzo
  });

  it("recorre al último día en meses de 30 días", () => {
    expect(effectivePaymentDay(2026, 3, 31)).toBe(30); // abril
    expect(effectivePaymentDay(2026, 10, 31)).toBe(30); // noviembre
  });

  it("recorre al último día de febrero, con y sin bisiesto", () => {
    expect(effectivePaymentDay(2026, 1, 30)).toBe(28);
    expect(effectivePaymentDay(2026, 1, 29)).toBe(28);
    expect(effectivePaymentDay(2028, 1, 30)).toBe(29);
    expect(effectivePaymentDay(2028, 1, 29)).toBe(29);
  });

  it("nunca devuelve un día menor a 1", () => {
    expect(effectivePaymentDay(2026, 0, 0)).toBe(1);
  });
});

describe("rentDueDate", () => {
  it("arma la fecha del periodo con el día efectivo", () => {
    expect(ymd(rentDueDate("2026-11", 31))).toEqual([2026, 11, 30]);
    expect(ymd(rentDueDate("2027-02", 30))).toEqual([2027, 2, 28]);
    expect(ymd(rentDueDate("2026-12", 31))).toEqual([2026, 12, 31]);
    expect(ymd(rentDueDate("2026-10", 18))).toEqual([2026, 10, 18]);
  });

  it("fija la hora a mediodía", () => {
    expect(rentDueDate("2026-10", 5).getHours()).toBe(12);
  });
});
