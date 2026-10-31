import "server-only";
import { z } from "zod";
import type { OrgDb } from "@/lib/db/scoped";
import { shortDate } from "@/lib/format";

/**
 * Reglas de un contrato nuevo, compartidas por el alta de inquilino (con
 * contrato en el mismo paso) y por la asignación de unidad a un inquilino que
 * ya existe.
 */

/** "2026-10-04" del <input type="date"> → mediodía local, como los cargos. */
export function parseDateInput(value: string) {
  return new Date(`${value}T12:00:00`);
}

const dateInput = (message: string) =>
  z
    .string({ error: message })
    .regex(/^\d{4}-\d{2}-\d{2}$/, message)
    .refine((value) => !Number.isNaN(parseDateInput(value).getTime()), message);

export const leaseTermsSchema = z
  .object({
    startDate: dateInput("Indica el inicio del contrato."),
    endDate: dateInput("Indica el vencimiento del contrato."),
    rentAmount: z.coerce.number().min(0, "La renta no puede ser negativa.").max(99_999_999),
    depositAmount: z.coerce.number().min(0).max(99_999_999).optional(),
    // 29, 30 y 31 valen: en meses más cortos se cobra el último día (chargeDueDate).
    paymentDay: z.coerce.number().int().min(1, "El día de pago va del 1 al 31.").max(31, "El día de pago va del 1 al 31."),
  })
  .refine((t) => parseDateInput(t.endDate) > parseDateInput(t.startDate), {
    message: "El vencimiento debe ser posterior al inicio del contrato.",
  });

export type LeaseTerms = z.infer<typeof leaseTermsSchema>;

export function readLeaseTerms(formData: FormData) {
  return leaseTermsSchema.safeParse({
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    rentAmount: formData.get("rentAmount"),
    depositAmount: formData.get("depositAmount") || undefined,
    paymentDay: formData.get("paymentDay") || 1,
  });
}

type Tx = Parameters<Parameters<OrgDb["$transaction"]>[0]>[0];

/**
 * Candado de la unidad hasta que termine la transacción. Es el mismo que toma
 * el alta de reservas (bookings.ts): contratos y estancias de una unidad se
 * validan y escriben de uno en uno, así dos altas simultáneas no pueden pasar
 * ambas la comprobación de traslapes.
 */
export async function lockUnit(tx: Tx, unitId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${unitId}))`;
}

/**
 * Por qué la unidad no puede recibir un contrato en esas fechas, o null si
 * puede: debe existir en la arrendadora, no estar en mantenimiento, no tener
 * otro contrato vigente ni reservas de corta estancia que se crucen.
 *
 * Para que valga, se llama dentro de la transacción que escribe y después de
 * `lockUnit`.
 */
export async function unitAvailabilityError(
  db: Pick<OrgDb, "unit" | "lease" | "booking">,
  unitId: string,
  start: Date,
  end: Date,
): Promise<string | null> {
  const unit = await db.unit.findUnique({ where: { id: unitId }, select: { status: true } });
  if (!unit) return "No se encontró la unidad.";
  if (unit.status === "MAINTENANCE") {
    return "La unidad está en mantenimiento. Cambia su estado antes de rentarla.";
  }

  const [lease, booking] = await Promise.all([
    db.lease.findFirst({ where: { unitId, status: "ACTIVE" }, select: { id: true } }),
    db.booking.findFirst({
      where: { unitId, status: "CONFIRMED", checkIn: { lt: end }, checkOut: { gt: start } },
      orderBy: { checkIn: "asc" },
      select: { checkIn: true, checkOut: true, guestName: true },
    }),
  ]);
  if (lease) return "Esa unidad ya tiene un contrato vigente.";
  if (booking) {
    return `Hay una reserva de corta estancia en esas fechas (${booking.guestName}, ${shortDate(booking.checkIn)} → ${shortDate(booking.checkOut)}).`;
  }
  return null;
}

/** Datos del contrato listos para crearlo dentro de una transacción. */
export function leaseData(orgId: string, unitId: string, tenantId: string, terms: LeaseTerms) {
  return {
    organizationId: orgId,
    unitId,
    tenantId,
    startDate: parseDateInput(terms.startDate),
    endDate: parseDateInput(terms.endDate),
    rentAmount: terms.rentAmount,
    depositAmount: terms.depositAmount ?? null,
    paymentDay: terms.paymentDay,
    status: "ACTIVE" as const,
  };
}
