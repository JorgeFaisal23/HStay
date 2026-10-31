"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserAction } from "@/lib/auth/session";
import { logAction } from "@/server/actions/audit";
import type { ActionResult } from "@/server/actions/properties";
import { shortDate } from "@/lib/format";
import { dayToDate, utcDay } from "@/lib/services/lease-renewal";
import { isIsoDay, nightsBetween, staysOverlap } from "@/lib/services/booking-dates";

/**
 * Reservas de corta estancia capturadas a mano (directas, por teléfono o de
 * un canal sin sincronizar). Viven en `Booking`, no en `Lease`: no generan
 * cargos mensuales y una unidad puede tener muchas, siempre que no se empalmen.
 */

// ---------------------------------------------------------------- esquema

const isoDay = z.string().refine(isIsoDay, "Escribe una fecha válida.");

const bookingSchema = z
  .object({
    unitId: z.string().min(1, "Elige la unidad."),
    source: z.enum(["MANUAL", "DIRECT", "AIRBNB"]),
    guestName: z.string().trim().min(2, "Escribe el nombre del huésped.").max(120),
    // Opcional: muchas reservas llegan sin correo.
    guestEmail: z
      .string()
      .trim()
      .toLowerCase()
      .email("El correo no es válido. Corrígelo o déjalo vacío.")
      .optional(),
    guestPhone: z.string().trim().max(40, "El teléfono es demasiado largo.").optional(),
    checkIn: isoDay,
    checkOut: isoDay,
    guests: z.coerce
      .number()
      .int("El número de huéspedes debe ser entero.")
      .min(1, "Debe haber al menos un huésped.")
      .max(50, "Revisa el número de huéspedes."),
    totalAmount: z.coerce.number().min(0, "El monto no puede ser negativo."),
    notes: z.string().trim().max(1000, "Las notas son demasiado largas.").optional(),
  })
  .refine((d) => nightsBetween(d.checkIn, d.checkOut) >= 1, {
    message: "La salida debe ser al menos un día después de la entrada.",
    path: ["checkOut"],
  });

type BookingInput = z.infer<typeof bookingSchema>;

function readBooking(formData: FormData) {
  const text = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" && value.trim() !== "" ? value : undefined;
  };
  return bookingSchema.safeParse({
    unitId: text("unitId") ?? "",
    source: text("source") ?? "MANUAL",
    guestName: text("guestName") ?? "",
    guestEmail: text("guestEmail"),
    guestPhone: text("guestPhone"),
    checkIn: text("checkIn") ?? "",
    checkOut: text("checkOut") ?? "",
    guests: text("guests") ?? 1,
    totalAmount: text("totalAmount") ?? 0,
    notes: text("notes"),
  });
}

// ---------------------------------------------------------------- helpers

async function findUnit(unitId: string, organizationId: string | null | undefined) {
  return prisma.unit.findFirst({
    where: {
      id: unitId,
      ...(organizationId ? { building: { organizationId } } : {}),
    },
    select: { id: true, code: true, building: { select: { id: true, name: true } } },
  });
}

async function findBooking(bookingId: string, organizationId: string | null | undefined) {
  if (!bookingId) return null;
  return prisma.booking.findFirst({
    where: {
      id: bookingId,
      ...(organizationId ? { unit: { building: { organizationId } } } : {}),
    },
    select: {
      id: true,
      unitId: true,
      status: true,
      guestName: true,
      checkIn: true,
      unit: { select: { code: true, building: { select: { name: true } } } },
    },
  });
}

/**
 * Busca otra reserva o un contrato vigente que comparta noches con la nueva
 * estancia. La consulta trae candidatos con un día de margen y la regla exacta
 * (el día de salida queda libre) se aplica con `staysOverlap`, para que no
 * dependa de la hora con que se guardó cada fecha.
 */
async function findConflict(
  unitId: string,
  checkIn: string,
  checkOut: string,
  excludeBookingId?: string,
): Promise<string | null> {
  const windowStart = new Date(dayToDate(checkIn).getTime() - 86_400_000 * 2);
  const windowEnd = new Date(dayToDate(checkOut).getTime() + 86_400_000 * 2);
  const stay = { start: checkIn, end: checkOut };

  const [bookings, leases] = await Promise.all([
    prisma.booking.findMany({
      where: {
        unitId,
        status: { not: "CANCELLED" },
        checkIn: { lt: windowEnd },
        checkOut: { gt: windowStart },
        ...(excludeBookingId ? { NOT: { id: excludeBookingId } } : {}),
      },
      select: { guestName: true, checkIn: true, checkOut: true },
    }),
    prisma.lease.findMany({
      where: {
        unitId,
        status: "ACTIVE",
        startDate: { lt: windowEnd },
        endDate: { gt: windowStart },
      },
      select: { startDate: true, endDate: true, tenant: { select: { name: true } } },
    }),
  ]);

  const booking = bookings.find((b) =>
    staysOverlap(stay, { start: utcDay(b.checkIn), end: utcDay(b.checkOut) }),
  );
  if (booking) {
    return `Esas fechas se empalman con la reserva de ${booking.guestName} (${shortDate(booking.checkIn)} → ${shortDate(booking.checkOut)}).`;
  }

  const lease = leases.find((l) =>
    staysOverlap(stay, { start: utcDay(l.startDate), end: utcDay(l.endDate) }),
  );
  if (lease) {
    return `Esas fechas se empalman con el contrato vigente de ${lease.tenant.name} (${shortDate(lease.startDate)} → ${shortDate(lease.endDate)}).`;
  }

  return null;
}

function bookingData(input: BookingInput) {
  return {
    unitId: input.unitId,
    source: input.source,
    guestName: input.guestName,
    guestEmail: input.guestEmail ?? null,
    guestPhone: input.guestPhone ?? null,
    checkIn: dayToDate(input.checkIn),
    checkOut: dayToDate(input.checkOut),
    guests: input.guests,
    totalAmount: input.totalAmount,
    notes: input.notes ?? null,
  };
}

function refresh(unitId: string, bookingId?: string) {
  revalidatePath("/calendario");
  revalidatePath("/reservas");
  revalidatePath(`/unidades/${unitId}`);
  revalidatePath("/dashboard");
  if (bookingId) revalidatePath(`/reservas/${bookingId}`);
}

/** Calendario en el mes de llegada y en la propiedad de la reserva. */
function calendarUrl(checkIn: string, buildingId: string) {
  return `/calendario?mes=${checkIn.slice(0, 7)}&edificio=${buildingId}`;
}

// ---------------------------------------------------------------- crear

export async function createBooking(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireUserAction(["OWNER", "ADMIN"]);

  const parsed = readBooking(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisa los datos de la reserva." };
  }
  const input = parsed.data;

  const unit = await findUnit(input.unitId, session.organizationId);
  if (!unit) return { error: "La unidad seleccionada no pertenece a tu organización." };

  const conflict = await findConflict(unit.id, input.checkIn, input.checkOut);
  if (conflict) return { error: conflict };

  const booking = await prisma.booking.create({
    data: { ...bookingData(input), status: "CONFIRMED" },
    select: { id: true },
  });

  await logAction(
    session.sub,
    "Alta de reserva",
    "Booking",
    booking.id,
    `${unit.building.name} ${unit.code} · ${input.guestName} · ${input.checkIn} → ${input.checkOut}`,
    session.organizationId,
  );

  refresh(unit.id, booking.id);
  redirect(calendarUrl(input.checkIn, unit.building.id));
}

// ---------------------------------------------------------------- editar

export async function updateBooking(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireUserAction(["OWNER", "ADMIN"]);

  const existing = await findBooking(String(formData.get("bookingId") ?? ""), session.organizationId);
  if (!existing) return { error: "Reserva no encontrada o sin permisos." };
  if (existing.status === "CANCELLED") {
    return { error: "Esta reserva está cancelada. Captura una nueva si el huésped vuelve." };
  }

  const parsed = readBooking(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisa los datos de la reserva." };
  }
  const input = parsed.data;

  const unit = await findUnit(input.unitId, session.organizationId);
  if (!unit) return { error: "La unidad seleccionada no pertenece a tu organización." };

  const conflict = await findConflict(unit.id, input.checkIn, input.checkOut, existing.id);
  if (conflict) return { error: conflict };

  await prisma.booking.update({
    where: { id: existing.id },
    data: bookingData(input),
  });

  await logAction(
    session.sub,
    "Edición de reserva",
    "Booking",
    existing.id,
    `${unit.building.name} ${unit.code} · ${input.guestName} · ${input.checkIn} → ${input.checkOut}`,
    session.organizationId,
  );

  refresh(existing.unitId, existing.id);
  if (existing.unitId !== unit.id) refresh(unit.id);
  return { ok: true };
}

// ---------------------------------------------------------------- cancelar

/** La reserva no se borra: queda cancelada para conservar el historial. */
export async function cancelBooking(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireUserAction(["OWNER", "ADMIN"]);

  const booking = await findBooking(String(formData.get("bookingId") ?? ""), session.organizationId);
  if (!booking) return { error: "Reserva no encontrada o sin permisos." };
  if (booking.status === "CANCELLED") return { error: "Esta reserva ya estaba cancelada." };

  await prisma.booking.update({
    where: { id: booking.id },
    data: { status: "CANCELLED" },
  });

  await logAction(
    session.sub,
    "Cancelación de reserva",
    "Booking",
    booking.id,
    `${booking.unit.building.name} ${booking.unit.code} · ${booking.guestName} · llegada ${utcDay(booking.checkIn)}`,
    session.organizationId,
  );

  refresh(booking.unitId, booking.id);
  return { ok: true };
}
