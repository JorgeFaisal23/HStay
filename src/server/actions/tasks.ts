"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrgUserAction } from "@/lib/auth/session";
import { money } from "@/lib/format";
import { startOfToday } from "@/lib/payments";
import type { OrgDb } from "@/lib/db/scoped";
import type { ActionResult } from "@/lib/action-result";
import { unitExists } from "@/lib/db/guards";
import { logAction } from "@/server/actions/audit";
import { imageError } from "@/server/payments-core";

/**
 * Tareas de operación: limpiezas (ligadas a la salida de una reserva) y
 * reparaciones (las reporta el equipo o el inquilino).
 *
 * - Las asigna el equipo (OWNER/ADMIN) a una cuenta de Operación, o a alguien
 *   del propio equipo.
 * - Las cierra quien la tiene asignada o el equipo. Una reparación se cierra
 *   con foto y costo; si costó algo, con el comprobante, y ese costo nace
 *   como gasto de la unidad **por aprobar** (src/server/actions/expenses.ts).
 * - Operación nunca ve cobros ni datos de inquilinos.
 */

/** Quién puede tener una tarea asignada. */
const ASSIGNABLE_ROLES = ["OPERATIONS", "ADMIN", "OWNER"] as const;

function refreshTasks(unitId?: string) {
  revalidatePath("/hoy");
  revalidatePath("/tareas");
  revalidatePath("/operacion");
  revalidatePath("/portal/reportes");
  revalidatePath("/pagos");
  revalidatePath("/reportes");
  if (unitId) revalidatePath(`/unidades/${unitId}`);
}

const optionalPhoto = z.string().trim().optional();

function photoProblem(photo: string | undefined, what = "La foto") {
  return photo ? imageError(photo, what) : null;
}

/** El responsable debe ser una cuenta activa de la arrendadora que pueda tener tareas. */
async function assigneeError(db: OrgDb, assigneeId: string | null) {
  if (!assigneeId) return null;
  const user = await db.user.findFirst({
    where: { id: assigneeId, active: true, role: { in: [...ASSIGNABLE_ROLES] } },
    select: { id: true },
  });
  return user ? null : "Elige a alguien del equipo o de Operación con acceso activo.";
}

// ------------------------------------------------------------------ reportar

const reportSchema = z.object({
  title: z.string().trim().min(3, "Describe el problema en pocas palabras.").max(120),
  description: z.string().trim().max(1000).optional(),
  photoUrl: optionalPhoto,
});

/** El equipo reporta una reparación de una unidad. */
export async function reportRepair(input: {
  unitId: string;
  title: string;
  description?: string;
  photoUrl?: string;
  assigneeId?: string | null;
}): Promise<ActionResult> {
  const { session, orgId, db } = await requireOrgUserAction(["OWNER", "ADMIN"]);

  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Revisa el reporte." };
  const photo = photoProblem(parsed.data.photoUrl);
  if (photo) return { error: photo };
  if (!(await unitExists(db, input.unitId))) return { error: "No se encontró la unidad." };
  const assignee = await assigneeError(db, input.assigneeId ?? null);
  if (assignee) return { error: assignee };

  const task = await db.task.create({
    data: {
      organizationId: orgId,
      kind: "REPAIR",
      unitId: input.unitId,
      title: parsed.data.title,
      description: parsed.data.description || null,
      reportPhotoUrl: parsed.data.photoUrl || null,
      reportedById: session.sub,
      assigneeId: input.assigneeId || null,
    },
    select: { id: true },
  });
  await logAction(db, session.sub, "Reporte de reparación", "Task", task.id, parsed.data.title);
  refreshTasks(input.unitId);
  return { ok: true };
}

/**
 * El inquilino (o huésped) reporta un problema de la unidad que ocupa. La
 * unidad sale de su contrato vigente o de su estancia: no la elige él.
 */
export async function reportRepairFromPortal(input: {
  title: string;
  description?: string;
  photoUrl?: string;
}): Promise<ActionResult> {
  const { session, orgId, db } = await requireOrgUserAction(["TENANT"]);

  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Revisa el reporte." };
  const photo = photoProblem(parsed.data.photoUrl);
  if (photo) return { error: photo };

  const [lease, booking] = await Promise.all([
    db.lease.findFirst({ where: { tenantId: session.sub, status: "ACTIVE" }, select: { unitId: true } }),
    db.booking.findFirst({
      where: { guestUserId: session.sub, status: "CONFIRMED", checkOut: { gte: startOfToday() } },
      orderBy: { checkIn: "asc" },
      select: { unitId: true },
    }),
  ]);
  const unitId = lease?.unitId ?? booking?.unitId;
  if (!unitId) return { error: "No tienes una unidad activa para reportar. Escríbele al administrador." };

  const task = await db.task.create({
    data: {
      organizationId: orgId,
      kind: "REPAIR",
      unitId,
      title: parsed.data.title,
      description: parsed.data.description || null,
      reportPhotoUrl: parsed.data.photoUrl || null,
      reportedById: session.sub,
    },
    select: { id: true },
  });
  await logAction(db, session.sub, "Reporte de reparación del inquilino", "Task", task.id, parsed.data.title);
  refreshTasks(unitId);
  return { ok: true };
}

// ------------------------------------------------------------------ limpieza

/**
 * Programa (o reasigna) la limpieza de la salida de una reserva. Hay una sola
 * por reserva; si se canceló, se vuelve a abrir.
 */
export async function scheduleCleaning(bookingId: string, assigneeId: string | null): Promise<ActionResult> {
  const { session, orgId, db } = await requireOrgUserAction(["OWNER", "ADMIN"]);

  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    select: {
      status: true,
      unitId: true,
      guestName: true,
      checkOut: true,
      cleaningTask: { select: { id: true, status: true } },
    },
  });
  if (!booking || booking.status !== "CONFIRMED") return { error: "No se encontró una reserva confirmada." };
  if (booking.cleaningTask?.status === "DONE") return { error: "Esa limpieza ya está hecha." };
  const assignee = await assigneeError(db, assigneeId);
  if (assignee) return { error: assignee };

  if (booking.cleaningTask) {
    await db.task.update({
      where: { id: booking.cleaningTask.id },
      data: { assigneeId, status: "OPEN", cancelReason: null },
    });
  } else {
    await db.task.create({
      data: {
        organizationId: orgId,
        kind: "CLEANING",
        unitId: booking.unitId,
        bookingId,
        title: `Limpieza tras la salida de ${booking.guestName}`,
        dueDate: booking.checkOut,
        assigneeId,
        reportedById: session.sub,
      },
    });
  }
  await logAction(db, session.sub, "Limpieza programada", "Booking", bookingId, booking.guestName);
  refreshTasks(booking.unitId);
  return { ok: true };
}

// ------------------------------------------------------------------ asignar y cancelar

/** Asigna (o quita) el responsable de una tarea abierta. */
export async function assignTask(taskId: string, assigneeId: string | null): Promise<ActionResult> {
  const { session, db } = await requireOrgUserAction(["OWNER", "ADMIN"]);

  const assignee = await assigneeError(db, assigneeId);
  if (assignee) return { error: assignee };

  const updated = await db.task.updateMany({ where: { id: taskId, status: "OPEN" }, data: { assigneeId } });
  if (updated.count === 0) return { error: "La tarea ya no está abierta." };

  const task = await db.task.findUnique({ where: { id: taskId }, select: { unitId: true, title: true } });
  await logAction(db, session.sub, assigneeId ? "Asignación de tarea" : "Tarea sin responsable", "Task", taskId, task?.title);
  refreshTasks(task?.unitId);
  return { ok: true };
}

const cancelSchema = z.object({
  reason: z.string().trim().min(3, "Escribe por qué se cancela.").max(200),
});

export async function cancelTask(taskId: string, reason: string): Promise<ActionResult> {
  const { session, db } = await requireOrgUserAction(["OWNER", "ADMIN"]);
  const parsed = cancelSchema.safeParse({ reason });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Escribe el motivo." };

  const updated = await db.task.updateMany({
    where: { id: taskId, status: "OPEN" },
    data: { status: "CANCELLED", cancelReason: parsed.data.reason },
  });
  if (updated.count === 0) return { error: "La tarea ya no está abierta." };

  const task = await db.task.findUnique({ where: { id: taskId }, select: { unitId: true, title: true } });
  await logAction(db, session.sub, "Cancelación de tarea", "Task", taskId, `${task?.title} · ${parsed.data.reason}`);
  refreshTasks(task?.unitId);
  return { ok: true };
}

// ------------------------------------------------------------------ cerrar

const completeSchema = z.object({
  photoUrl: optionalPhoto,
  notes: z.string().trim().max(1000).optional(),
  cost: z.number().min(0, "El costo no puede ser negativo.").max(99_999_999).optional(),
  receiptUrl: optionalPhoto,
});

class CloseError extends Error {}

/**
 * Cierra una tarea. Limpieza: la foto es opcional. Reparación: foto y costo
 * obligatorios; si costó algo, también el comprobante, y el costo queda como
 * gasto de la unidad por aprobar.
 */
export async function completeTask(
  taskId: string,
  input: { photoUrl?: string; notes?: string; cost?: number; receiptUrl?: string },
): Promise<ActionResult> {
  const { session, orgId, db } = await requireOrgUserAction(["OWNER", "ADMIN", "OPERATIONS"]);

  const parsed = completeSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Revisa los datos." };
  const data = parsed.data;

  const task = await db.task.findUnique({
    where: { id: taskId },
    select: {
      kind: true,
      status: true,
      unitId: true,
      title: true,
      assigneeId: true,
      unit: { select: { building: { select: { currency: true } } } },
    },
  });
  // Operación solo ve y cierra lo suyo: una tarea ajena responde como inexistente.
  if (!task || (session.role === "OPERATIONS" && task.assigneeId !== session.sub)) {
    return { error: "No se encontró la tarea." };
  }
  if (task.status !== "OPEN") return { error: "La tarea ya no está abierta." };

  const photo = photoProblem(data.photoUrl);
  if (photo) return { error: photo };
  const receipt = photoProblem(data.receiptUrl, "El comprobante");
  if (receipt) return { error: receipt };

  const cost = data.cost ?? 0;
  if (task.kind === "REPAIR") {
    if (!data.photoUrl) return { error: "Agrega una foto de cómo quedó la reparación." };
    if (data.cost === undefined) return { error: "Indica cuánto costó la reparación (0 si no costó nada)." };
    if (cost > 0 && !data.receiptUrl) return { error: "Agrega la foto del comprobante del gasto." };
  }

  try {
    await db.$transaction(async (tx) => {
      const closed = await tx.task.updateMany({
        where: { id: taskId, status: "OPEN" },
        data: {
          status: "DONE",
          doneAt: new Date(),
          doneById: session.sub,
          donePhotoUrl: data.photoUrl || null,
          doneNotes: data.notes || null,
        },
      });
      if (closed.count === 0) throw new CloseError("La tarea ya no está abierta.");

      if (task.kind === "REPAIR" && cost > 0) {
        await tx.expense.create({
          data: {
            organizationId: orgId,
            unitId: task.unitId,
            taskId,
            concept: `Reparación: ${task.title}`,
            amount: cost,
            spentOn: new Date(),
            receiptUrl: data.receiptUrl || null,
            createdById: session.sub,
          },
        });
      }
    });
  } catch (error) {
    if (error instanceof CloseError) return { error: error.message };
    throw error;
  }

  await logAction(
    db,
    session.sub,
    task.kind === "CLEANING" ? "Limpieza hecha" : "Reparación cerrada",
    "Task",
    taskId,
    `${task.title}${cost > 0 ? ` · gasto por aprobar ${money(cost, task.unit.building.currency)}` : ""}`,
  );
  refreshTasks(task.unitId);
  return { ok: true };
}
