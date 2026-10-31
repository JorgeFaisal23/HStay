import type { OrgDb } from "@/lib/db/scoped";
import { moneyCompact, periodToDate } from "@/lib/format";
import { stayDaysInMonth } from "@/lib/stay-range";

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
  db: OrgDb,
  period: string,
  buildingId?: string,
  search?: string,
) {
  const monthStart = periodToDate(period);
  const year = monthStart.getFullYear();
  const month = monthStart.getMonth();
  const totalDays = daysInMonth(year, month);
  const monthEnd = new Date(year, month, totalDays, 23, 59, 59);

  const [buildings, units, leases, bookings] = await Promise.all([
    db.building.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.unit.findMany({
      where: buildingId ? { buildingId } : undefined,
      orderBy: [{ building: { name: "asc" } }, { code: "asc" }],
      select: {
        id: true,
        code: true,
        status: true,
        building: { select: { id: true, name: true, currency: true } },
      },
    }),
    db.lease.findMany({
      where: {
        status: "ACTIVE",
        startDate: { lte: monthEnd },
        endDate: { gte: monthStart },
        ...(buildingId ? { unit: { buildingId } } : {}),
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
    db.booking.findMany({
      where: {
        status: { not: "CANCELLED" },
        checkIn: { lte: monthEnd },
        checkOut: { gte: monthStart },
        ...(buildingId ? { unit: { buildingId } } : {}),
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

  // Moneda de cada unidad (la de su propiedad), para los montos de las barras.
  const unitCurrency = new Map(units.map((u) => [u.id, u.building.currency]));

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
      detail: `Contrato de arrendamiento · ${moneyCompact(lease.rentAmount, unitCurrency.get(lease.unitId))} al mes`,
      href: `/inquilinos/${lease.tenant.id}`,
    });
  }

  // La salida libera la unidad ese mismo día: una estancia que sale el día 1
  // no ocupa ninguna noche de este mes y no se dibuja (ver stayDaysInMonth).
  let bookingsInMonth = 0;
  for (const booking of bookings) {
    const range = stayDaysInMonth(booking.checkIn, booking.checkOut, year, month);
    if (!range) continue;
    bookingsInMonth++;
    push(booking.unitId, {
      id: booking.id,
      kind: booking.source,
      label: booking.guestName,
      ...range,
      detail: `${booking.guests} ${booking.guests === 1 ? "huésped" : "huéspedes"} · ${moneyCompact(booking.totalAmount, unitCurrency.get(booking.unitId))}`,
      href: `/reservas?reserva=${booking.id}`,
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
  // estancia de esa persona.
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
      href: `/reservas?reserva=${b.id}`,
    })),
    ...bookings.map((b) => ({
      id: `out-${b.id}`,
      type: "checkout" as const,
      date: b.checkOut,
      label: b.guestName,
      unitId: b.unitId,
      source: b.source,
      href: `/reservas?reserva=${b.id}`,
    })),
  ]
    .filter((e) => e.date >= monthStart && e.date <= monthEnd)
    .map((e) => ({ ...e, unitCode: unitCodes.get(e.unitId) ?? "" }))
    .filter(
      (e) =>
        !needle || normalize(e.unitCode).includes(needle) || normalize(e.label).includes(needle),
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
      bookings: bookingsInMonth,
      units: units.length,
      shown: rows.length,
    },
  };
}
