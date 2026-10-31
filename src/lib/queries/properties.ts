import type { OrgDb } from "@/lib/db/scoped";
import type { StayRates } from "@/lib/rates";
import { toNumber, periodKey } from "@/lib/format";

/**
 * Consultas de propiedades. Devuelven objetos planos (Decimal ya convertido a
 * number) para poder pasarlos a componentes de cliente sin problemas de
 * serialización.
 */

export async function getBuildingsOverview(db: OrgDb) {
  const now = new Date();
  const period = periodKey(now);

  const buildings = await db.building.findMany({
    orderBy: { name: "asc" },
    include: {
      units: {
        select: { id: true, status: true, baseRent: true },
      },
      serviceAccounts: {
        select: {
          id: true,
          type: true,
          charges: { where: { period }, select: { amount: true } },
        },
      },
    },
  });

  // El gasto en servicios de un edificio incluye lo facturado a nivel edificio
  // más lo de cada una de sus unidades.
  const unitCharges = await db.serviceCharge.findMany({
    where: { period, serviceAccount: { scope: "UNIT" } },
    select: {
      amount: true,
      serviceAccount: {
        select: { unit: { select: { buildingId: true } } },
      },
    },
  });

  const unitServiceTotals = new Map<string, number>();
  for (const charge of unitCharges) {
    const buildingId = charge.serviceAccount.unit?.buildingId;
    if (!buildingId) continue;
    unitServiceTotals.set(
      buildingId,
      (unitServiceTotals.get(buildingId) ?? 0) + toNumber(charge.amount),
    );
  }

  return buildings.map((building) => {
    const total = building.units.length;
    const occupied = building.units.filter(
      (u) => u.status === "OCCUPIED" || u.status === "SHORT_TERM",
    ).length;

    const buildingServices = building.serviceAccounts.reduce(
      (sum, account) =>
        sum + account.charges.reduce((s, c) => s + toNumber(c.amount), 0),
      0,
    );

    return {
      id: building.id,
      name: building.name,
      address: building.address,
      city: building.city,
      notes: building.notes,
      totalUnits: total,
      occupiedUnits: occupied,
      availableUnits: building.units.filter((u) => u.status === "AVAILABLE").length,
      occupancyRate: total === 0 ? 0 : Math.round((occupied / total) * 100),
      monthlyRent: building.units
        .filter((u) => u.status === "OCCUPIED")
        .reduce((sum, u) => sum + toNumber(u.baseRent), 0),
      servicesThisMonth:
        buildingServices + (unitServiceTotals.get(building.id) ?? 0),
    };
  });
}

export async function getBuildingDetail(db: OrgDb, buildingId: string) {
  const now = new Date();

  const building = await db.building.findUnique({
    where: { id: buildingId },
    include: {
      owner: { select: { id: true, name: true, active: true } },
      serviceAccounts: {
        where: { scope: "BUILDING" },
        orderBy: { type: "asc" },
      },
      units: {
        orderBy: { code: "asc" },
        include: {
          leases: {
            where: { status: "ACTIVE" },
            include: { tenant: { select: { id: true, name: true } } },
            take: 1,
          },
          bookings: {
            where: { checkOut: { gte: now }, status: "CONFIRMED" },
            orderBy: { checkIn: "asc" },
            take: 1,
          },
        },
      },
    },
  });

  if (!building) return null;

  return {
    id: building.id,
    name: building.name,
    address: building.address,
    city: building.city,
    notes: building.notes,
    owner: building.owner,
    ownerSince: building.ownerSince,
    serviceAccounts: building.serviceAccounts.map((a) => ({
      id: a.id,
      type: a.type,
      providerName: a.providerName,
      contractNumber: a.contractNumber,
      includedInRent: a.includedInRent,
      splitMode: a.splitMode,
    })),
    units: building.units.map((unit) => {
      const lease = unit.leases[0];
      const booking = unit.bookings[0];
      return {
        id: unit.id,
        code: unit.code,
        name: unit.name,
        type: unit.type,
        status: unit.status,
        floor: unit.floor,
        sizeM2: unit.sizeM2,
        baseRent: toNumber(unit.baseRent),
        tenantName: lease?.tenant.name ?? null,
        tenantId: lease?.tenant.id ?? null,
        leaseEndDate: lease?.endDate ?? null,
        nextGuest: booking
          ? { name: booking.guestName, checkIn: booking.checkIn }
          : null,
      };
    }),
  };
}

export async function getUnitDetail(db: OrgDb, unitId: string) {
  const now = new Date();

  const unit = await db.unit.findUnique({
    where: { id: unitId },
    include: {
      building: {
        include: {
          serviceAccounts: { where: { scope: "BUILDING" }, orderBy: { type: "asc" } },
        },
      },
      serviceAccounts: { orderBy: { type: "asc" } },
      airbnbConnection: true,
      leases: {
        orderBy: { startDate: "desc" },
        include: {
          tenant: {
            select: { id: true, name: true, email: true, phone: true },
          },
          rentCharges: { orderBy: { period: "desc" }, take: 6 },
        },
      },
      bookings: {
        where: { checkOut: { gte: now }, status: "CONFIRMED" },
        orderBy: { checkIn: "asc" },
        take: 10,
      },
    },
  });

  if (!unit) return null;

  const activeLease = unit.leases.find((l) => l.status === "ACTIVE") ?? null;

  return {
    id: unit.id,
    code: unit.code,
    name: unit.name,
    type: unit.type,
    status: unit.status,
    floor: unit.floor,
    bedrooms: unit.bedrooms,
    bathrooms: unit.bathrooms,
    sizeM2: unit.sizeM2,
    baseRent: toNumber(unit.baseRent),
    rates: stayRatesOf(unit),
    description: unit.description,
    building: {
      id: unit.building.id,
      name: unit.building.name,
      address: unit.building.address,
      serviceAccounts: unit.building.serviceAccounts.map((a) => ({
        id: a.id,
        type: a.type,
        providerName: a.providerName,
        contractNumber: a.contractNumber,
        includedInRent: a.includedInRent,
        splitMode: a.splitMode,
      })),
    },
    serviceAccounts: unit.serviceAccounts.map((a) => ({
      id: a.id,
      type: a.type,
      providerName: a.providerName,
      contractNumber: a.contractNumber,
      includedInRent: a.includedInRent,
    })),
    airbnb: unit.airbnbConnection
      ? {
          id: unit.airbnbConnection.id,
          listingName: unit.airbnbConnection.listingName,
          listingUrl: unit.airbnbConnection.listingUrl,
          status: unit.airbnbConnection.status,
          lastSyncedAt: unit.airbnbConnection.lastSyncedAt,
        }
      : null,
    activeLease: activeLease
      ? {
          id: activeLease.id,
          startDate: activeLease.startDate,
          endDate: activeLease.endDate,
          rentAmount: toNumber(activeLease.rentAmount),
          depositAmount: toNumber(activeLease.depositAmount),
          paymentDay: activeLease.paymentDay,
          tenant: activeLease.tenant,
          charges: activeLease.rentCharges.map((c) => ({
            id: c.id,
            period: c.period,
            amount: toNumber(c.amount),
            paidAmount: toNumber(c.paidAmount),
            status: c.status,
            dueDate: c.dueDate,
          })),
        }
      : null,
    pastLeases: unit.leases
      .filter((l) => l.status !== "ACTIVE")
      .map((l) => ({
        id: l.id,
        tenantName: l.tenant.name,
        startDate: l.startDate,
        endDate: l.endDate,
        status: l.status,
      })),
    bookings: unit.bookings.map((b) => ({
      id: b.id,
      guestName: b.guestName,
      guestEmail: b.guestEmail,
      guestPhone: b.guestPhone,
      notes: b.notes,
      source: b.source,
      checkIn: b.checkIn,
      checkOut: b.checkOut,
      guests: b.guests,
      totalAmount: toNumber(b.totalAmount),
      status: b.status,
    })),
  };
}

export async function getBuildingsForSelect(db: OrgDb) {
  return db.building.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

/** Unidades que pueden recibir una reserva corta (todas menos las de mantenimiento). */
export async function getBookableUnits(db: OrgDb) {
  const units = await db.unit.findMany({
    where: { status: { not: "MAINTENANCE" } },
    orderBy: [{ building: { name: "asc" } }, { code: "asc" }],
    select: {
      id: true,
      code: true,
      nightlyRate: true,
      weeklyRate: true,
      monthlyRate: true,
      building: { select: { name: true } },
    },
  });

  return units.map((unit) => ({
    id: unit.id,
    label: `${unit.building.name} · ${unit.code}`,
    rates: stayRatesOf(unit),
  }));
}

type Decimalish = { toString(): string } | null;

/** Tarifas de estancia de una unidad como números (nulas si no hay). */
export function stayRatesOf(unit: { nightlyRate: Decimalish; weeklyRate: Decimalish; monthlyRate: Decimalish }): StayRates {
  const value = (rate: Decimalish) => (rate === null ? null : toNumber(rate));
  return { nightly: value(unit.nightlyRate), weekly: value(unit.weeklyRate), monthly: value(unit.monthlyRate) };
}
