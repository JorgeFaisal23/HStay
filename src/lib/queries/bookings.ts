import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/format";
import { dayToDate, utcDay } from "@/lib/services/lease-renewal";
import { nightsBetween } from "@/lib/services/booking-dates";
import type { BookingStatus } from "@/generated/prisma/enums";

/** Unidades donde se puede capturar una reserva, con sus tarifas de referencia. */
export async function getBookableUnits(organizationId?: string | null) {
  const units = await prisma.unit.findMany({
    where: organizationId ? { building: { organizationId } } : undefined,
    orderBy: [{ building: { name: "asc" } }, { code: "asc" }],
    select: {
      id: true,
      code: true,
      status: true,
      currency: true,
      nightlyPrice: true,
      weeklyPrice: true,
      baseRent: true,
      building: { select: { id: true, name: true } },
    },
  });

  return units.map((unit) => ({
    id: unit.id,
    code: unit.code,
    status: unit.status,
    currency: unit.currency,
    buildingId: unit.building.id,
    buildingName: unit.building.name,
    nightlyPrice: unit.nightlyPrice === null ? null : toNumber(unit.nightlyPrice),
    weeklyPrice: unit.weeklyPrice === null ? null : toNumber(unit.weeklyPrice),
    monthlyPrice: toNumber(unit.baseRent) > 0 ? toNumber(unit.baseRent) : null,
  }));
}

/** Propiedades de la organización, para los filtros. */
export async function getBuildingOptions(organizationId?: string | null) {
  return prisma.building.findMany({
    where: organizationId ? { organizationId } : undefined,
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export type BookableUnit =Awaited<ReturnType<typeof getBookableUnits>>[number];

export type BookingFilters = {
  /** Texto libre: nombre, correo o teléfono del huésped, o código de unidad. */
  q?: string;
  buildingId?: string;
  /** AAAA-MM-DD. Estancias que siguen ocupando la unidad desde este día. */
  from?: string;
  /** AAAA-MM-DD. Estancias que llegan antes o en este día. */
  to?: string;
  status?: BookingStatus | "ALL";
};

/**
 * Listado de reservas con filtros. Una reserva entra si su estancia toca el
 * rango [from, to]; sin `from` se muestran las actuales y las futuras.
 */
export async function getBookings(
  filters: BookingFilters,
  organizationId?: string | null,
) {
  const q = filters.q?.trim();
  const from = filters.from ?? utcDay(new Date());

  const bookings = await prisma.booking.findMany({
    where: {
      ...(filters.status && filters.status !== "ALL"
        ? { status: filters.status }
        : filters.status === "ALL"
          ? {}
          : { status: { not: "CANCELLED" } }),
      checkOut: { gt: dayToDate(from) },
      ...(filters.to ? { checkIn: { lte: dayToDate(filters.to) } } : {}),
      unit: {
        ...(organizationId ? { building: { organizationId } } : {}),
        ...(filters.buildingId ? { buildingId: filters.buildingId } : {}),
      },
      ...(q
        ? {
            OR: [
              { guestName: { contains: q, mode: "insensitive" } },
              { guestEmail: { contains: q, mode: "insensitive" } },
              { guestPhone: { contains: q } },
              { unit: { code: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    orderBy: { checkIn: "asc" },
    take: 300,
    select: {
      id: true,
      source: true,
      status: true,
      guestName: true,
      guestEmail: true,
      guestPhone: true,
      checkIn: true,
      checkOut: true,
      guests: true,
      totalAmount: true,
      unit: {
        select: {
          id: true,
          code: true,
          currency: true,
          building: { select: { id: true, name: true } },
        },
      },
    },
  });

  return bookings.map((b) => {
    const checkIn = utcDay(b.checkIn);
    const checkOut = utcDay(b.checkOut);
    return {
      id: b.id,
      source: b.source,
      status: b.status,
      guestName: b.guestName,
      guestEmail: b.guestEmail,
      guestPhone: b.guestPhone,
      checkIn,
      checkOut,
      nights: nightsBetween(checkIn, checkOut),
      guests: b.guests,
      totalAmount: toNumber(b.totalAmount),
      currency: b.unit.currency,
      unitId: b.unit.id,
      unitCode: b.unit.code,
      buildingId: b.unit.building.id,
      buildingName: b.unit.building.name,
    };
  });
}

export async function getBooking(bookingId: string, organizationId?: string | null) {
  const booking = await prisma.booking.findFirst({
    where: {
      id: bookingId,
      ...(organizationId ? { unit: { building: { organizationId } } } : {}),
    },
    select: {
      id: true,
      unitId: true,
      source: true,
      status: true,
      guestName: true,
      guestEmail: true,
      guestPhone: true,
      checkIn: true,
      checkOut: true,
      guests: true,
      totalAmount: true,
      notes: true,
      createdAt: true,
      unit: {
        select: {
          code: true,
          currency: true,
          building: { select: { id: true, name: true } },
        },
      },
    },
  });
  if (!booking) return null;

  return {
    id: booking.id,
    unitId: booking.unitId,
    source: booking.source,
    status: booking.status,
    guestName: booking.guestName,
    guestEmail: booking.guestEmail,
    guestPhone: booking.guestPhone,
    checkIn: utcDay(booking.checkIn),
    checkOut: utcDay(booking.checkOut),
    guests: booking.guests,
    totalAmount: toNumber(booking.totalAmount),
    notes: booking.notes,
    createdAt: booking.createdAt,
    unitCode: booking.unit.code,
    currency: booking.unit.currency,
    buildingId: booking.unit.building.id,
    buildingName: booking.unit.building.name,
  };
}

export type BookingDetail = NonNullable<Awaited<ReturnType<typeof getBooking>>>;
