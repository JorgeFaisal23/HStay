import type { OrgDb } from "@/lib/db/scoped";
import { inputDate, toNumber } from "@/lib/format";

/** Cuántas reservas muestra la lista como máximo; arriba de eso, afinar filtros. */
export const BOOKINGS_LIMIT = 300;

export type BookingFilters = {
  /** Texto libre: nombre, correo o teléfono del huésped, o código de la unidad. */
  q?: string;
  buildingId?: string;
  /** AAAA-MM-DD. Estancias que siguen ocupando la unidad desde este día. */
  from?: string;
  /** AAAA-MM-DD. Estancias que llegan a más tardar este día. */
  to?: string;
  /** Sin valor: solo confirmadas. */
  status?: "CANCELLED" | "ALL";
  /** Una sola reserva (al llegar desde el calendario). */
  id?: string;
};

/** Mediodía local de un "AAAA-MM-DD", como guardan las fechas las acciones. */
function day(value: string) {
  return new Date(`${value}T12:00:00`);
}

/**
 * Reservas de la arrendadora con filtros. Una reserva entra si su estancia
 * toca el rango [from, to]; sin `from` se muestran las actuales y futuras.
 */
export async function getBookings(db: OrgDb, filters: BookingFilters) {
  const q = filters.q?.trim();
  const from = filters.from ?? inputDate(new Date());

  const bookings = await db.booking.findMany({
    where: filters.id
      ? { id: filters.id }
      : {
          ...(filters.status === "ALL"
            ? {}
            : { status: filters.status === "CANCELLED" ? "CANCELLED" : "CONFIRMED" }),
          // La salida libera la unidad: una estancia que sale el día `from` ya no cuenta.
          checkOut: { gt: day(from) },
          ...(filters.to ? { checkIn: { lte: day(filters.to) } } : {}),
          ...(filters.buildingId ? { unit: { buildingId: filters.buildingId } } : {}),
          ...(q
            ? {
                OR: [
                  { guestName: { contains: q, mode: "insensitive" as const } },
                  { guestEmail: { contains: q, mode: "insensitive" as const } },
                  { guestPhone: { contains: q } },
                  { unit: { code: { contains: q, mode: "insensitive" as const } } },
                ],
              }
            : {}),
        },
    orderBy: { checkIn: "asc" },
    take: BOOKINGS_LIMIT,
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
      notes: true,
      unit: {
        select: { id: true, code: true, building: { select: { id: true, name: true, currency: true } } },
      },
    },
  });

  return bookings.map((b) => ({
    id: b.id,
    source: b.source,
    status: b.status,
    guestName: b.guestName,
    guestEmail: b.guestEmail,
    guestPhone: b.guestPhone,
    checkIn: b.checkIn,
    checkOut: b.checkOut,
    nights: Math.max(0, Math.round((b.checkOut.getTime() - b.checkIn.getTime()) / 86_400_000)),
    guests: b.guests,
    totalAmount: toNumber(b.totalAmount),
    notes: b.notes,
    unitId: b.unit.id,
    unitCode: b.unit.code,
    buildingId: b.unit.building.id,
    buildingName: b.unit.building.name,
    currency: b.unit.building.currency,
  }));
}

export type BookingRow = Awaited<ReturnType<typeof getBookings>>[number];
