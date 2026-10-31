import { describe, expect, it } from "vitest";
import { buildOwnerStatement, type StatementMovement } from "./owner-statement";

const d = (iso: string) => new Date(`${iso}T12:00:00`);

describe("buildOwnerStatement", () => {
  it("pendiente = cobrado − gastos − entregas", () => {
    const movements: StatementMovement[] = [
      { kind: "rent", amount: 5000, date: d("2026-09-04") },
      { kind: "booking", amount: 2400, date: d("2026-09-20") },
      { kind: "repair", amount: 850, date: d("2026-09-10") },
      { kind: "service", amount: 700, period: "2026-09" },
      { kind: "payout", amount: 3000, date: d("2026-09-30") },
    ];
    const s = buildOwnerStatement({ since: "2026-09", until: "2026-09", movements });
    expect(s.months).toEqual([
      {
        period: "2026-09",
        rent: 5000,
        bookings: 2400,
        income: 7400,
        repairs: 850,
        services: 700,
        expenses: 1550,
        net: 5850,
        payouts: 3000,
      },
    ]);
    expect(s.totals).toEqual({ income: 7400, expenses: 1550, net: 5850, payouts: 3000 });
    expect(s.pending).toBe(2850);
  });

  it("la renta cuenta en el mes en que se pagó, no en el del cargo", () => {
    const s = buildOwnerStatement({
      since: "2026-09",
      until: "2026-10",
      movements: [{ kind: "rent", amount: 5000, date: d("2026-10-02") }],
    });
    expect(s.months.map((m) => [m.period, m.rent])).toEqual([
      ["2026-10", 5000],
      ["2026-09", 0],
    ]);
  });

  it("lo anterior al inicio de cuentas o posterior al corte no cuenta", () => {
    const s = buildOwnerStatement({
      since: "2026-09",
      until: "2026-10",
      movements: [
        { kind: "rent", amount: 5000, date: d("2026-08-31") },
        { kind: "service", amount: 700, period: "2026-08" },
        { kind: "service", amount: 700, period: "2026-11" },
        { kind: "rent", amount: 1000, date: d("2026-09-01") },
      ],
    });
    expect(s.totals.income).toBe(1000);
    expect(s.totals.expenses).toBe(0);
    expect(s.pending).toBe(1000);
  });

  it("incluye los meses sin movimientos, del más reciente al más antiguo", () => {
    const s = buildOwnerStatement({ since: "2026-11", until: "2027-01", movements: [] });
    expect(s.months.map((m) => m.period)).toEqual(["2027-01", "2026-12", "2026-11"]);
    expect(s.pending).toBe(0);
  });

  it("puede quedar negativo si se entregó de más o los gastos superan lo cobrado", () => {
    const s = buildOwnerStatement({
      since: "2026-09",
      until: "2026-09",
      movements: [
        { kind: "rent", amount: 1000, date: d("2026-09-04") },
        { kind: "repair", amount: 1500, date: d("2026-09-05") },
      ],
    });
    expect(s.pending).toBe(-500);
  });

  it("suma en centavos sin residuos", () => {
    const s = buildOwnerStatement({
      since: "2026-09",
      until: "2026-09",
      movements: [
        { kind: "rent", amount: 0.1, date: d("2026-09-01") },
        { kind: "rent", amount: 0.2, date: d("2026-09-02") },
      ],
    });
    expect(s.totals.income).toBe(0.3);
  });

  it("inicio posterior al corte: sin meses", () => {
    const s = buildOwnerStatement({ since: "2026-12", until: "2026-10", movements: [] });
    expect(s.months).toEqual([]);
    expect(s.pending).toBe(0);
  });
});
