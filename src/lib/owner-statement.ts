import { periodKey, shiftPeriod } from "@/lib/format";
import { toCents } from "@/lib/payments";

/**
 * Estado de cuenta del propietario de una propiedad (B-05), sin base de datos
 * para poder probarlo solo.
 *
 * Pendiente de entregar = cobrado − gastos − entregas, desde el mes de inicio
 * de cuentas (`Building.ownerSince`):
 * - Rentas: pagos recibidos, en el mes en que se pagaron.
 * - Reservas: total de la estancia, en el mes de salida (no hay estado de
 *   pago de reservas, ver B-12).
 * - Reparaciones: gastos aprobados, en el mes del gasto.
 * - Servicios: recibos de cuentas incluidas en la renta, en su mes; los que
 *   se cobran aparte los paga el inquilino.
 * - Entregas: lo que la arrendadora ya le dio, en el mes en que se entregó.
 *
 * No hay comisión de administración (decisión del 2026-10-27).
 */

export type StatementMovement =
  | { kind: "rent" | "booking" | "repair" | "payout"; amount: number; date: Date }
  | { kind: "service"; amount: number; period: string };

export type StatementMonth = {
  period: string;
  rent: number;
  bookings: number;
  income: number;
  repairs: number;
  services: number;
  expenses: number;
  /** Lo que produjo el mes para el propietario: ingresos − gastos. */
  net: number;
  payouts: number;
};

export type OwnerStatement = {
  /** Del mes más reciente al más antiguo. */
  months: StatementMonth[];
  totals: { income: number; expenses: number; net: number; payouts: number };
  /** Lo que falta entregarle. Negativo: se le entregó de más (o los gastos superan lo cobrado). */
  pending: number;
};

type Cents = Omit<StatementMonth, "period" | "income" | "expenses" | "net">;

const EMPTY: Cents = { rent: 0, bookings: 0, repairs: 0, services: 0, payouts: 0 };

const FIELD: Record<StatementMovement["kind"], keyof Cents> = {
  rent: "rent",
  booking: "bookings",
  repair: "repairs",
  service: "services",
  payout: "payouts",
};

/**
 * Arma el estado de cuenta de `since` a `until` (periodos "YYYY-MM",
 * inclusivos). Lo que cae fuera de ese rango no cuenta. Las sumas se hacen en
 * centavos.
 */
export function buildOwnerStatement(input: {
  since: string;
  until: string;
  movements: StatementMovement[];
}): OwnerStatement {
  const { since, until } = input;
  const byPeriod = new Map<string, Cents>();

  if (since <= until) {
    for (let period = since; period <= until; period = shiftPeriod(period, 1)) {
      byPeriod.set(period, { ...EMPTY });
    }
  }

  for (const movement of input.movements) {
    const period = movement.kind === "service" ? movement.period : periodKey(movement.date);
    const month = byPeriod.get(period);
    if (!month) continue;
    month[FIELD[movement.kind]] += toCents(movement.amount);
  }

  const months: StatementMonth[] = [];
  const totals = { income: 0, expenses: 0, net: 0, payouts: 0 };

  for (const [period, c] of byPeriod) {
    const income = c.rent + c.bookings;
    const expenses = c.repairs + c.services;
    totals.income += income;
    totals.expenses += expenses;
    totals.net += income - expenses;
    totals.payouts += c.payouts;
    months.push({
      period,
      rent: c.rent / 100,
      bookings: c.bookings / 100,
      income: income / 100,
      repairs: c.repairs / 100,
      services: c.services / 100,
      expenses: expenses / 100,
      net: (income - expenses) / 100,
      payouts: c.payouts / 100,
    });
  }

  months.reverse();

  return {
    months,
    totals: {
      income: totals.income / 100,
      expenses: totals.expenses / 100,
      net: totals.net / 100,
      payouts: totals.payouts / 100,
    },
    pending: (totals.net - totals.payouts) / 100,
  };
}
