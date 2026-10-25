import type { OrgDb } from "@/lib/db/scoped";
import { toNumber, periodKey, periodToDate, shiftPeriod, periodShortLabel } from "@/lib/format";

/**
 * Datos de la sección Premium de reportes.
 *
 * Se calculan de verdad aunque la pantalla esté bloqueada: la vista previa
 * difuminada tiene que mostrar los números del negocio, no un relleno.
 */
export async function getReportsData(db: OrgDb, months = 6) {
  const current = periodKey(new Date());
  const periods = Array.from({ length: months }, (_, i) =>
    shiftPeriod(current, -(months - 1 - i)),
  );

  const first = periodToDate(periods[0]);
  const last = periodToDate(shiftPeriod(current, 1));

  const [rentCharges, serviceCharges, buildings, bookings, repairExpenses] = await Promise.all([
    db.rentCharge.findMany({
      where: { period: { in: periods } },
      select: {
        period: true,
        amount: true,
        paidAmount: true,
        status: true,
        lease: {
          select: {
            unit: {
              select: { building: { select: { id: true, name: true } } },
            },
          },
        },
      },
    }),
    db.serviceCharge.findMany({
      where: { period: { in: periods } },
      select: {
        period: true,
        amount: true,
        serviceAccount: {
          select: {
            type: true,
            buildingId: true,
            unit: { select: { buildingId: true } },
          },
        },
      },
    }),
    db.building.findMany({
      select: {
        id: true,
        name: true,
        units: { select: { id: true, status: true } },
      },
      orderBy: { name: "asc" },
    }),
    db.booking.findMany({
      where: { status: { in: ["CONFIRMED", "COMPLETED"] } },
      select: { totalAmount: true, checkIn: true, source: true },
    }),
    // Gastos de unidad (reparaciones): solo los aprobados cuentan.
    db.expense.findMany({
      where: { status: "APPROVED", spentOn: { gte: first, lt: last } },
      select: { amount: true, spentOn: true, unit: { select: { buildingId: true } } },
    }),
  ]);
  const repairs = repairExpenses.map((e) => ({
    period: periodKey(e.spentOn),
    amount: toNumber(e.amount),
    buildingId: e.unit.buildingId,
  }));

  // ------------------------------------------------ serie mensual
  const monthly = periods.map((period) => {
    const rent = rentCharges.filter((c) => c.period === period);
    const services = serviceCharges.filter((c) => c.period === period);

    const income = rent.reduce((sum, c) => sum + toNumber(c.amount), 0);
    const collected = rent.reduce((sum, c) => sum + toNumber(c.paidAmount), 0);
    const expenses =
      services.reduce((sum, c) => sum + toNumber(c.amount), 0) +
      repairs.filter((r) => r.period === period).reduce((sum, r) => sum + r.amount, 0);

    return {
      period,
      label: periodShortLabel(period),
      income,
      collected,
      expenses,
      net: income - expenses,
    };
  });

  // ------------------------------------------ rentabilidad por propiedad
  const byBuilding = buildings.map((building) => {
    const income = rentCharges
      .filter((c) => c.lease.unit.building.id === building.id)
      .reduce((sum, c) => sum + toNumber(c.amount), 0);

    const expenses = serviceCharges
      .filter((c) => {
        const id = c.serviceAccount.buildingId ?? c.serviceAccount.unit?.buildingId;
        return id === building.id;
      })
      .reduce((sum, c) => sum + toNumber(c.amount), 0) +
      repairs.filter((r) => r.buildingId === building.id).reduce((sum, r) => sum + r.amount, 0);

    const total = building.units.length;
    const occupied = building.units.filter(
      (u) => u.status === "OCCUPIED" || u.status === "SHORT_TERM",
    ).length;

    return {
      id: building.id,
      name: building.name,
      income,
      expenses,
      net: income - expenses,
      margin: income === 0 ? 0 : Math.round(((income - expenses) / income) * 100),
      occupancy: total === 0 ? 0 : Math.round((occupied / total) * 100),
    };
  });

  // --------------------------------------------- gasto por tipo de servicio
  const serviceTotals = new Map<string, number>();
  for (const charge of serviceCharges) {
    const type = charge.serviceAccount.type;
    serviceTotals.set(type, (serviceTotals.get(type) ?? 0) + toNumber(charge.amount));
  }
  const repairsTotal = repairs.reduce((sum, r) => sum + r.amount, 0);
  if (repairsTotal > 0) serviceTotals.set("Reparaciones", repairsTotal);

  const shortTermIncome = bookings.reduce(
    (sum, b) => sum + toNumber(b.totalAmount),
    0,
  );

  return {
    periods,
    monthly,
    byBuilding,
    serviceBreakdown: [...serviceTotals.entries()]
      .map(([type, amount]) => ({ type, amount }))
      .sort((a, b) => b.amount - a.amount),
    totals: {
      income: monthly.reduce((sum, m) => sum + m.income, 0),
      collected: monthly.reduce((sum, m) => sum + m.collected, 0),
      expenses: monthly.reduce((sum, m) => sum + m.expenses, 0),
      shortTermIncome,
    },
  };
}
