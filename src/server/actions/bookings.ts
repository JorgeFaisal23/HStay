"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrgUserAction } from "@/lib/auth/session";
import { logAction } from "@/server/actions/audit";
import { parseDateInput } from "@/server/actions/lease-rules";
import type { ActionResult } from "@/lib/action-result";
import type { OrgDb } from "@/lib/db/scoped";
import { shortDate } from "@/lib/format";

const dateInput = (message: string) =>
  z.string({ error: message }).regex(/^\d{4}-\d{2}-\d{2}$/, message);

const bookingSchema = z
  .object({
    unitId: z.string().min(1, "Elige la unidad."),
    guestName: z.string().trim().min(2, "Escribe el nombre del huésped.").max(120),
    guestEmail: z.email("El correo no es válido.").optional(),
    guestPhone: z.string().trim().max(40).optional(),
    checkIn: dateInput("Indica la fecha de llegada."),
    checkOut: dateInput("Indica la fecha de salida."),
    guests: z.coerce.number().int().min(1, "Debe haber al menos un huésped.").max(50),
    totalAmount: z.coerce.number().min(0, "El total no puede ser negativo.").max(99_999_999),
    source: z.enum(["MANUAL", "DIRECT"]),
    notes: z.string().trim().max(500).optional(),
  })
  .refine((b) => parseDateInput(b.checkOut) > parseDateInput(b.checkIn), {
    message: "La salida debe ser posterior a la llegada.",
  });

/**
 * Por qué la unidad no puede recibir esa estancia, o null si puede: debe
 * existir en la arrendadora, no estar en mantenimiento y no cruzarse con otra
 * reserva confirmada ni con un contrato vigente o en borrador.
 */
type Reader = Pick<OrgDb, "unit" | "booking" | "lease">;

async function bookingConflictError(db: Reader, unitId: string, checkIn: Date, checkOut: Date) {
  const unit = await db.unit.findUnique({ where: { id: unitId }, select: { status: true } });
  if (!unit) return "No se encontró la unidad.";
  if (unit.status === "MAINTENANCE") return "La unidad está en mantenimiento.";

  const overlaps = { lt: checkOut };
  const [booking, lease] = await Promise.all([
    db.booking.findFirst({
      where: { unitId, status: "CONFIRMED", checkIn: overlaps, checkOut: { gt: checkIn } },
      orderBy: { checkIn: "asc" },
      select: { guestName: true, checkIn: true, checkOut: true },
    }),
    db.lease.findFirst({
      where: {
        unitId,
        status: { in: ["ACTIVE", "DRAFT"] },
        startDate: overlaps,
        endDate: { gt: checkIn },
      },
      select: { tenant: { select: { name: true } }, endDate: true },
    }),
  ]);

  if (booking) {
    return `Se cruza con la reserva de ${booking.guestName} (${shortDate(booking.checkIn)} → ${shortDate(booking.checkOut)}).`;
  }
  if (lease) {
    return `La unidad está rentada a ${lease.tenant.name} hasta el ${shortDate(lease.endDate)}.`;
  }
  return null;
}

export async function createBooking(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { session, orgId, db } = await requireOrgUserAction(["OWNER", "ADMIN"]);

  const parsed = bookingSchema.safeParse({
    unitId: formData.get("unitId"),
    guestName: formData.get("guestName"),
    guestEmail: formData.get("guestEmail") || undefined,
    guestPhone: formData.get("guestPhone") || undefined,
    checkIn: formData.get("checkIn"),
    checkOut: formData.get("checkOut"),
    guests: formData.get("guests") || 1,
    totalAmount: formData.get("totalAmount"),
    source: formData.get("source") || "MANUAL",
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisa los datos." };
  }

  const data = parsed.data;
  const checkIn = parseDateInput(data.checkIn);
  const checkOut = parseDateInput(data.checkOut);

  // Validar y crear bajo un candado de la unidad: dos capturas simultáneas de
  // las mismas fechas no deben pasar ambas la comprobación.
  const result = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${data.unitId}))`;
    const conflict = await bookingConflictError(tx, data.unitId, checkIn, checkOut);
    if (conflict) return { error: conflict };

    const booking = await tx.booking.create({
      data: {
        organizationId: orgId,
        unitId: data.unitId,
        source: data.source,
        guestName: data.guestName,
        guestEmail: data.guestEmail ?? null,
        guestPhone: data.guestPhone ?? null,
        checkIn,
        checkOut,
        guests: data.guests,
        totalAmount: data.totalAmount,
        notes: data.notes ?? null,
      },
      select: { id: true },
    });
    return { id: booking.id };
  });

  if ("error" in result) return { error: result.error };

  await logAction(
    db,
    session.sub,
    "Alta de reserva",
    "Booking",
    result.id,
    `${data.guestName}: ${data.checkIn} → ${data.checkOut}`,
  );

  revalidatePath("/calendario");
  revalidatePath(`/unidades/${data.unitId}`);
  revalidatePath("/dashboard");
  revalidatePath("/hoy");
  return { ok: true };
}

/** Cancela una reserva capturada aquí. Las de Airbnb se cancelan en Airbnb. */
export async function cancelBooking(bookingId: string): Promise<ActionResult> {
  const { session, db } = await requireOrgUserAction(["OWNER", "ADMIN"]);

  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    select: { status: true, source: true, unitId: true, guestName: true },
  });
  if (!booking) return { error: "No se encontró la reserva." };
  if (booking.source === "AIRBNB") {
    return { error: "Las reservas de Airbnb se cancelan desde Airbnb." };
  }
  if (booking.status !== "CONFIRMED") {
    return { error: "Esta reserva ya no está confirmada." };
  }

  // La limpieza de esa salida ya no hace falta: se cancela con la reserva.
  await db.$transaction(async (tx) => {
    await tx.booking.update({ where: { id: bookingId }, data: { status: "CANCELLED" } });
    await tx.task.updateMany({
      where: { bookingId, status: "OPEN" },
      data: { status: "CANCELLED", cancelReason: "Se canceló la reserva" },
    });
  });
  await logAction(db, session.sub, "Cancelación de reserva", "Booking", bookingId, booking.guestName);

  revalidatePath("/calendario");
  revalidatePath(`/unidades/${booking.unitId}`);
  revalidatePath("/dashboard");
  revalidatePath("/hoy");
  revalidatePath("/tareas");
  revalidatePath("/operacion");
  return { ok: true };
}
