import { prisma } from "@/lib/prisma";
import { money, periodToDate, type Decimalish } from "@/lib/format";

/**
 * Datos del calendario global: contratos de largo plazo y reservas de corta
 * estancia sobre el mismo eje de tiempo.
 *
 * Se consulta por mes y se recortan las barras a los límites del mes, de modo
 * que un contrato de doce meses se dibuje igual de bien que una estancia de
 * tres noches.
 */

export type CalendarBarKind = "LEASE" | "AIRBNB" | "DIRECT" | "MANUAL";

export type CalendarBar = {
  id: string;
  kind: CalendarBarKind;
  label: string;
  /** Día del mes donde empieza la barra (1-based). */
  startDay: number;
  /** Día del mes donde termina, inclusive. */
  endDay: number;
  /** La estancia real empieza antes del mes mostrado. */
  continuesBefore: boolean;
  continuesAfter: boolean;
  detail: string;
  /** A dónde lleva al hacer clic: la reserva o el inquilino. */
  href: string;
};

/** Sin acentos ni mayúsculas, para que "maria" encuentre "María". */
function normalize(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

export async function getCalendarData(
  period: string,
  buildingId?: string,
  organizationId?: string | null,
  search?: string,
) {
  const monthStart = periodToDate(period);
  const year = monthStart.getFullYear();
  const month = monthStart.getMonth();
  const totalDays = daysInMonth(year, month);
  const monthEnd = new Date(year, month, totalDays, 23, 59, 59);

  const orgFilter = organizationId ? { organizationId } : undefined;
  // Un solo filtro de unidad (propiedad + organización) para contratos y
  // reservas; antes uno pisaba al otro y el filtro por propiedad se perdía.
  const unitFilter = {
    ...(buildingId ? { buildingId } : {}),
    ...(organizationId ? { building: orgFilter } : {}),
  };

  const [buildings, units, leases, bookings] = await Promise.all([
    prisma.building.findMany({
      where: orgFilter,
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.unit.findMany({
      where: unitFilter,
      orderBy: [{ building: { name: "asc" } }, { code: "asc" }],
      select: {
        id: true,
        code: true,
        status: true,
        currency: true,
        building: { select: { id: true, name: true } },
      },
    }),
    prisma.lease.findMany({
      where: {
        status: "ACTIVE",
        startDate: { lte: monthEnd },
        endDate: { gte: monthStart },
        unit: unitFilter,
      },
      select: {
        id: true,
        unitId: true,
        startDate: true,
        endDate: true,
        rentAmount: true,
        tenant: { select: { id: true, name: true } },
      },
    }),
    prisma.booking.findMany({
      where: {
        status: { not: "CANCELLED" },
        checkIn: { lte: monthEnd },
        checkOut: { gte: monthStart },
        unit: unitFilter,
      },
      select: {
        id: true,
        unitId: true,
        source: true,
        guestName: true,
        checkIn: true,
        checkOut: true,
        guests: true,
        totalAmount: true,
      },
    }),
  ]);

  const unitCurrency = new Map(units.map((u) => [u.id, u.currency]));
  const amount = (value: Decimalish, unitId: string) =>
    money(value, unitCurrency.get(unitId) ?? "MXN");

  /** Recorta un intervalo al mes visible y lo expresa en días del mes. */
  function clip(start: Date, end: Date) {
    const startsBefore = start < monthStart;
    const endsAfter = end > monthEnd;
    const startDay = startsBefore ? 1 : start.getDate();
    const endDay = endsAfter ? totalDays : end.getDate();
    return { startDay, endDay, startsBefore, endsAfter };
  }

  const barsByUnit = new Map<string, CalendarBar[]>();
  const push = (unitId: string, bar: CalendarBar) => {
    const list = barsByUnit.get(unitId) ?? [];
    list.push(bar);
    barsByUnit.set(unitId, list);
  };

  for (const lease of leases) {
    const { startDay, endDay, startsBefore, endsAfter } = clip(
      lease.startDate,
      lease.endDate,
    );
    push(lease.unitId, {
      id: lease.id,
      kind: "LEASE",
      label: lease.tenant.name,
      startDay,
      endDay,
      continuesBefore: startsBefore,
      continuesAfter: endsAfter,
      detail: `Contrato de arrendamiento · ${amount(lease.rentAmount, lease.unitId)} al mes`,
      href: `/inquilinos/${lease.tenant.id}`,
    });
  }

  for (const booking of bookings) {
    // La salida libera la unidad ese mismo día: la barra termina el día previo.
    const lastNight = new Date(booking.checkOut.getTime() - 86_400_000);
    const effectiveEnd = lastNight < booking.checkIn ? booking.checkIn : lastNight;
    // Una reserva que sale el día 1 no ocupa ninguna noche de este mes.
    if (effectiveEnd < monthStart) continue;
    const { startDay, endDay, startsBefore, endsAfter } = clip(
      booking.checkIn,
      effectiveEnd,
    );
    push(booking.unitId, {
      id: booking.id,
      kind: booking.source,
      label: booking.guestName,
      startDay,
      endDay,
      continuesBefore: startsBefore,
      continuesAfter: endsAfter,
      detail: `${booking.guests} ${booking.guests === 1 ? "huésped" : "huéspedes"} · ${amount(booking.totalAmount, booking.unitId)}`,
      href: `/reservas/${booking.id}`,
    });
  }

  const allRows = units.map((unit) => ({
    unitId: unit.id,
    code: unit.code,
    status: unit.status,
    buildingId: unit.building.id,
    buildingName: unit.building.name,
    bars: (barsByUnit.get(unit.id) ?? []).sort((a, b) => a.startDay - b.startDay),
  }));

  // Búsqueda: unidades cuyo código coincide o que tienen en el mes una
  // estancia de ese huésped.
  const needle = normalize(search ?? "");
  const rows = needle
    ? allRows.filter(
        (row) =>
          normalize(row.code).includes(needle) ||
          row.bars.some((bar) => normalize(bar.label).includes(needle)),
      )
    : allRows;

  const unitCodes = new Map(units.map((u) => [u.id, u.code]));

  // Eventos por día para la vista de mes.
  const events = [
    ...bookings.map((b) => ({
      id: `in-${b.id}`,
      type: "checkin" as const,
      date: b.checkIn,
      label: b.guestName,
      unitId: b.unitId,
      source: b.source,
      href: `/reservas/${b.id}`,
    })),
    ...bookings.map((b) => ({
      id: `out-${b.id}`,
      type: "checkout" as const,
      date: b.checkOut,
      label: b.guestName,
      unitId: b.unitId,
      source: b.source,
      href: `/reservas/${b.id}`,
    })),
  ]
    .filter((e) => e.date >= monthStart && e.date <= monthEnd)
    .map((e) => ({ ...e, unitCode: unitCodes.get(e.unitId) ?? "" }))
    .filter(
      (e) =>
        !needle ||
        normalize(e.unitCode).includes(needle) ||
        normalize(e.label).includes(needle),
    );

  return {
    period,
    year,
    month,
    totalDays,
    buildings,
    rows,
    events,
    counts: {
      leases: leases.length,
      bookings: bookings.length,
      units: units.length,
      shown: rows.length,
    },
  };
}
