import type { OrgDb } from "@/lib/db/scoped";
import { periodKey, toNumber, daysBetween } from "@/lib/format";
import { ACCOUNT_CURRENCY, accountCurrency, totalByCurrency } from "@/lib/currency";

/**
 * Consultas del resumen. Todo el cálculo vive aquí para que la página solo se
 * ocupe de presentar; así los mismos números se pueden reutilizar en reportes.
 */

const DAYS_BEFORE_EXPIRY_WARNING = 60;

export async function getDashboardData(db: OrgDb) {
  const now = new Date();
  const period = periodKey(now);

  const [units, rentCharges, serviceCharges, leases, upcomingBookings, serviceAccounts] =
    await Promise.all([
      db.unit.findMany({
        select: {
          id: true,
          code: true,
          status: true,
          baseRent: true,
          building: { select: { id: true, name: true } },
        },
      }),
      db.rentCharge.findMany({
        where: { period },
        select: {
          amount: true,
          paidAmount: true,
          status: true,
          lease: { select: { unit: { select: { building: { select: { currency: true } } } } } },
        },
      }),
      db.serviceCharge.findMany({
        where: { period },
        select: { amount: true, serviceAccount: { select: ACCOUNT_CURRENCY } },
      }),
      db.lease.findMany({
        where: { status: "ACTIVE" },
        select: {
          id: true,
          endDate: true,
          tenant: { select: { id: true, name: true } },
          unit: {
            select: { id: true, code: true, building: { select: { name: true } } },
          },
        },
        orderBy: { endDate: "asc" },
      }),
      db.booking.findMany({
        where: { checkIn: { gte: now }, status: "CONFIRMED" },
        select: {
          id: true,
          guestName: true,
          checkIn: true,
          checkOut: true,
          source: true,
          totalAmount: true,
          unit: {
            select: { id: true, code: true, building: { select: { name: true, currency: true } } },
          },
        },
        orderBy: { checkIn: "asc" },
        take: 6,
      }),
      db.serviceAccount.count({ where: { active: true } }),
    ]);

  const totalUnits = units.length;
  const occupied = units.filter(
    (u) => u.status === "OCCUPIED" || u.status === "SHORT_TERM",
  ).length;

  // Totales por moneda: nunca se suman pesos con dólares.
  const rentCurrency = (c: (typeof rentCharges)[number]) => c.lease.unit.building.currency;
  const expectedIncome = totalByCurrency(rentCharges, rentCurrency, (c) => toNumber(c.amount));
  const collected = totalByCurrency(rentCharges, rentCurrency, (c) => toNumber(c.paidAmount));
  const overdue = rentCharges.filter((c) => c.status === "OVERDUE");
  const overdueAmount = totalByCurrency(
    overdue,
    rentCurrency,
    (c) => toNumber(c.amount) - toNumber(c.paidAmount),
  );
  const pendingCount = rentCharges.filter(
    (c) => c.status === "PENDING" || c.status === "PARTIAL",
  ).length;

  const servicesTotal = totalByCurrency(
    serviceCharges,
    (c) => accountCurrency(c.serviceAccount),
    (c) => toNumber(c.amount),
  );

  // Cuántas cuentas de servicio siguen sin monto capturado este mes.
  const servicesMissing = serviceAccounts - serviceCharges.length;

  const expiringSoon = leases.filter((lease) => {
    const days = daysBetween(now, lease.endDate);
    return days >= 0 && days <= DAYS_BEFORE_EXPIRY_WARNING;
  });

  // Ocupación desglosada por edificio.
  const byBuilding = new Map<
    string,
    { name: string; total: number; occupied: number }
  >();
  for (const unit of units) {
    const entry = byBuilding.get(unit.building.id) ?? {
      name: unit.building.name,
      total: 0,
      occupied: 0,
    };
    entry.total += 1;
    if (unit.status === "OCCUPIED" || unit.status === "SHORT_TERM") {
      entry.occupied += 1;
    }
    byBuilding.set(unit.building.id, entry);
  }

  return {
    period,
    totalUnits,
    occupied,
    occupancyRate: totalUnits === 0 ? 0 : Math.round((occupied / totalUnits) * 100),
    availableUnits: units.filter((u) => u.status === "AVAILABLE").length,
    maintenanceUnits: units.filter((u) => u.status === "MAINTENANCE").length,
    expectedIncome,
    collected,
    overdueCount: overdue.length,
    overdueAmount,
    pendingCount,
    servicesTotal,
    servicesMissing: Math.max(0, servicesMissing),
    serviceAccounts,
    expiringSoon: expiringSoon.map((lease) => ({
      id: lease.id,
      tenantName: lease.tenant.name,
      tenantId: lease.tenant.id,
      unitCode: lease.unit.code,
      buildingName: lease.unit.building.name,
      endDate: lease.endDate,
      daysLeft: daysBetween(now, lease.endDate),
    })),
    upcomingBookings: upcomingBookings.map((b) => ({
      id: b.id,
      guestName: b.guestName,
      checkIn: b.checkIn,
      checkOut: b.checkOut,
      source: b.source,
      totalAmount: toNumber(b.totalAmount),
      currency: b.unit.building.currency,
      unitCode: b.unit.code,
      buildingName: b.unit.building.name,
    })),
    buildings: [...byBuilding.entries()].map(([id, value]) => ({
      id,
      ...value,
      rate: value.total === 0 ? 0 : Math.round((value.occupied / value.total) * 100),
    })),
  };
}
