import { describe, it, expect } from "vitest";
import { dayToDate, suggestRenewal, utcDay } from "./lease-renewal";

describe("suggestRenewal", () => {
  it("propone el siguiente periodo con la misma duración", () => {
    expect(suggestRenewal("2025-11-18", "2026-11-18", "2026-10-30")).toEqual({
      startDate: "2026-11-18",
      endDate: "2027-11-18",
      months: 12,
    });
    expect(suggestRenewal("2026-05-08", "2026-11-08", "2026-10-30")).toEqual({
      startDate: "2026-11-08",
      endDate: "2027-05-08",
      months: 6,
    });
  });

  it("recorre periodos vencidos hasta el que incluye hoy", () => {
    // Venció el 28 abr 2026; periodos de 6 meses: abr→oct (ya pasó), oct→abr.
    expect(suggestRenewal("2025-10-28", "2026-04-28", "2026-10-30")).toEqual({
      startDate: "2026-10-28",
      endDate: "2027-04-28",
      months: 6,
    });
    // Venció el 20 sep 2026, periodo anual: el siguiente ya incluye hoy.
    expect(suggestRenewal("2025-09-20", "2026-09-20", "2026-10-30")).toEqual({
      startDate: "2026-09-20",
      endDate: "2027-09-20",
      months: 12,
    });
  });

  it("limita la duración a 12 meses para contratos largos", () => {
    // Contrato de 2 años (con renovaciones dentro): propone 12 meses.
    const result = suggestRenewal("2024-08-15", "2026-08-15", "2026-10-30");
    expect(result).toEqual({ startDate: "2026-08-15", endDate: "2027-08-15", months: 12 });
  });

  it("usa al menos un mes", () => {
    expect(suggestRenewal("2026-10-01", "2026-10-20", "2026-10-10").months).toBe(1);
  });

  it("no pierde el día 31 al recorrer meses cortos", () => {
    const result = suggestRenewal("2026-01-31", "2026-03-31", "2026-06-15");
    // Periodos de 2 meses desde el 31 mar: may 31 (pasó), jul 31 (incluye hoy).
    expect(result).toEqual({ startDate: "2026-05-31", endDate: "2026-07-31", months: 2 });
  });

  it("si vence hoy, el nuevo periodo empieza hoy", () => {
    expect(suggestRenewal("2025-10-30", "2026-10-30", "2026-10-30").startDate).toBe("2026-10-30");
  });
});

describe("utcDay / dayToDate", () => {
  it("ida y vuelta sin cambiar de día", () => {
    expect(utcDay(dayToDate("2026-02-28"))).toBe("2026-02-28");
    expect(utcDay(new Date("2026-03-01T00:00:00Z"))).toBe("2026-03-01");
  });
});
