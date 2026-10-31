import { describe, expect, it } from "vitest";
import { stayDaysInMonth } from "./stay-range";

// Fechas como las guardan las acciones: mediodía local.
const d = (value: string) => new Date(`${value}T12:00:00`);
const FEB = [2027, 1] as const;
const MAR = [2027, 2] as const;
const APR = [2027, 3] as const;

describe("stayDaysInMonth", () => {
  it("una estancia dentro del mes ocupa de la llegada a la víspera de la salida", () => {
    expect(stayDaysInMonth(d("2027-02-10"), d("2027-02-13"), ...FEB)).toEqual({
      startDay: 10,
      endDay: 12,
      continuesBefore: false,
      continuesAfter: false,
    });
  });

  it("una estancia de dos meses se reparte en ambos", () => {
    expect(stayDaysInMonth(d("2027-02-01"), d("2027-03-31"), ...FEB)).toEqual({
      startDay: 1,
      endDay: 28,
      continuesBefore: false,
      continuesAfter: true,
    });
    expect(stayDaysInMonth(d("2027-02-01"), d("2027-03-31"), ...MAR)).toEqual({
      startDay: 1,
      endDay: 30,
      continuesBefore: true,
      continuesAfter: false,
    });
  });

  it("salir el día 1 no pinta el mes siguiente", () => {
    // Antes la barra cubría abril completo.
    expect(stayDaysInMonth(d("2027-02-01"), d("2027-04-01"), ...APR)).toBeNull();
    expect(stayDaysInMonth(d("2027-02-01"), d("2027-04-01"), ...MAR)).toMatchObject({
      endDay: 31,
      continuesAfter: false,
    });
  });

  it("no dibuja estancias que empiezan después del mes", () => {
    expect(stayDaysInMonth(d("2027-03-01"), d("2027-03-05"), ...FEB)).toBeNull();
  });

  it("acepta fechas a medianoche (como las importadas)", () => {
    expect(stayDaysInMonth(new Date(2027, 2, 30), new Date(2027, 3, 1), ...APR)).toBeNull();
    expect(stayDaysInMonth(new Date(2027, 2, 30), new Date(2027, 3, 1), ...MAR)).toMatchObject({
      startDay: 30,
      endDay: 31,
    });
  });
});
