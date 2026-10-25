import type { OrgDb } from "@/lib/db/scoped";
import { periodKey, periodLabel, toNumber } from "@/lib/format";
import { chargeDueDate, chargeableLeasesWhere, startOfToday } from "@/lib/payments";
import { buildTodayItems, LEASE_WARNING_DAYS, LOOKAHEAD_DAYS } from "@/lib/today";

/**
 * Datos de "Hoy" y de la guía de primeros pasos. Todo pasa por el cliente con
 * alcance de la arrendadora; los pendientes se arman en src/lib/today.ts.
 */

const unitSelect = { id: true, code: true, building: { select: { name: true } } } as const;

function place(unit: { id: string; code: string; building: { name: string } }) {
  return { unitId: unit.id, unitCode: unit.code, buildingName: unit.building.name };
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export async function getTodayData(db: OrgDb, now = new Date()) {
  const today = startOfToday(now);
  const windowEnd = addDays(today, LOOKAHEAD_DAYS);
  const period = periodKey(now);

  const [overdue, missing, bookings, moveIns, expiring, serviceAccounts, counts] = await Promise.all([
    // Por fecha y no por estado: un cargo atrasado aparece aunque el barrido
    // de vencimientos todavía no lo haya marcado.
    db.rentCharge.findMany({
      where: { status: { not: "PAID" }, dueDate: { lt: today } },
      orderBy: { dueDate: "asc" },
      select: {
        id: true,
        period: true,
        dueDate: true,
        amount: true,
        paidAmount: true,
        lease: { select: { tenant: { select: { id: true, name: true } }, unit: { select: unitSelect } } },
      },
    }),
    db.lease.findMany({
      where: chargeableLeasesWhere(period),
      select: { paymentDay: true, tenant: { select: { name: true } }, unit: { select: unitSelect } },
    }),
    db.booking.findMany({
      where: {
        status: "CONFIRMED",
        OR: [
          { checkIn: { gte: today, lt: windowEnd } },
          { checkOut: { gte: today, lt: windowEnd } },
        ],
      },
      orderBy: { checkIn: "asc" },
      select: { id: true, guestName: true, guests: true, checkIn: true, checkOut: true, unit: { select: unitSelect } },
    }),
    db.lease.findMany({
      where: { status: "ACTIVE", startDate: { gte: today, lt: windowEnd } },
      select: { id: true, startDate: true, tenant: { select: { id: true, name: true } }, unit: { select: unitSelect } },
    }),
    db.lease.findMany({
      where: { status: "ACTIVE", endDate: { gte: today, lte: addDays(today, LEASE_WARNING_DAYS) } },
      select: { id: true, endDate: true, tenant: { select: { id: true, name: true } }, unit: { select: unitSelect } },
    }),
    db.serviceAccount.findMany({
      where: { active: true, charges: { none: { period } } },
      select: {
        building: { select: { id: true, name: true } },
        unit: { select: { building: { select: { id: true, name: true } } } },
      },
    }),
    Promise.all([
      db.building.count(),
      db.unit.count(),
      db.lease.count(),
      db.booking.count(),
      db.rentCharge.count(),
    ]),
  ]);

  const servicesByBuilding = new Map<string, { buildingId: string; buildingName: string; count: number }>();
  for (const account of serviceAccounts) {
    const building = account.building ?? account.unit?.building;
    if (!building) continue;
    const entry = servicesByBuilding.get(building.id) ?? { buildingId: building.id, buildingName: building.name, count: 0 };
    entry.count += 1;
    servicesByBuilding.set(building.id, entry);
  }

  const items = buildTodayItems(
    {
      period,
      periodName: periodLabel(period),
      overdueCharges: overdue.map((c) => ({
        ...place(c.lease.unit),
        id: c.id,
        periodName: periodLabel(c.period),
        dueDate: c.dueDate,
        amount: toNumber(c.amount),
        paidAmount: toNumber(c.paidAmount),
        tenantId: c.lease.tenant.id,
        tenantName: c.lease.tenant.name,
      })),
      missingCharges: missing.map((l) => ({
        ...place(l.unit),
        tenantName: l.tenant.name,
        dueDate: chargeDueDate(period, l.paymentDay),
      })),
      bookings: bookings.map((b) => ({
        ...place(b.unit),
        id: b.id,
        guestName: b.guestName,
        guests: b.guests,
        checkIn: b.checkIn,
        checkOut: b.checkOut,
      })),
      moveIns: moveIns.map((l) => ({
        ...place(l.unit),
        id: l.id,
        tenantId: l.tenant.id,
        tenantName: l.tenant.name,
        startDate: l.startDate,
      })),
      expiringLeases: expiring.map((l) => ({
        ...place(l.unit),
        id: l.id,
        tenantId: l.tenant.id,
        tenantName: l.tenant.name,
        endDate: l.endDate,
      })),
      servicesMissing: [...servicesByBuilding.values()],
    },
    now,
  );

  const [buildings, units, leases, bookingsTotal, charges] = counts;

  return {
    period,
    items,
    /**
     * Primeros pasos: se derivan de lo que ya existe. El de los cargos solo
     * aplica si hay contratos (quien solo renta por noche no los necesita).
     */
    setup: [
      { id: "property", done: buildings > 0 },
      { id: "unit", done: units > 0 },
      { id: "rent", done: leases > 0 || bookingsTotal > 0 },
      { id: "charges", done: leases === 0 ? bookingsTotal > 0 : charges > 0 },
    ] as const,
  };
}
