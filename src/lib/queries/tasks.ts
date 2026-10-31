import type { OrgDb } from "@/lib/db/scoped";
import { toNumber } from "@/lib/format";
import { startOfToday } from "@/lib/payments";

/**
 * Consultas de tareas de operación y gastos. Ninguna trae las fotos: se piden
 * aparte a /operacion/archivos/{tipo}/{id} (ver su route.ts), así las listas
 * no cargan imágenes.
 */

const unitSelect = {
  id: true,
  code: true,
  building: { select: { name: true, address: true, currency: true } },
} as const;

/** Quién puede tener tareas asignadas: Operación y el equipo, con acceso activo. */
export async function getAssignableStaff(db: OrgDb) {
  const users = await db.user.findMany({
    where: { active: true, role: { in: ["OPERATIONS", "ADMIN", "OWNER"] } },
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: { id: true, name: true, role: true },
  });
  // Operación primero: es quien normalmente hace las tareas.
  return [...users.filter((u) => u.role === "OPERATIONS"), ...users.filter((u) => u.role !== "OPERATIONS")];
}

export type AssignableStaff = Awaited<ReturnType<typeof getAssignableStaff>>;

/** Tablero del equipo: tareas abiertas, gastos por aprobar y lo último cerrado. */
export async function getTeamTasks(db: OrgDb) {
  const [open, pendingExpenses, recent] = await Promise.all([
    db.task.findMany({
      where: { status: "OPEN" },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
      select: {
        id: true,
        kind: true,
        title: true,
        description: true,
        dueDate: true,
        createdAt: true,
        reportPhotoUrl: true,
        assignee: { select: { id: true, name: true } },
        reportedBy: { select: { name: true, role: true } },
        unit: { select: unitSelect },
      },
    }),
    db.expense.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        concept: true,
        amount: true,
        spentOn: true,
        receiptUrl: true,
        createdBy: { select: { name: true } },
        unit: { select: unitSelect },
        task: { select: { id: true, doneNotes: true, donePhotoUrl: true } },
      },
    }),
    db.task.findMany({
      where: { status: { in: ["DONE", "CANCELLED"] } },
      orderBy: { updatedAt: "desc" },
      take: 15,
      select: {
        id: true,
        kind: true,
        status: true,
        title: true,
        doneAt: true,
        updatedAt: true,
        cancelReason: true,
        donePhotoUrl: true,
        doneBy: { select: { name: true } },
        unit: { select: unitSelect },
        expense: { select: { amount: true, status: true } },
      },
    }),
  ]);

  return {
    open: open.map(({ reportPhotoUrl, ...task }) => ({ ...task, hasReportPhoto: reportPhotoUrl !== null })),
    pendingExpenses: pendingExpenses.map(({ receiptUrl, amount, task, ...expense }) => ({
      ...expense,
      amount: toNumber(amount),
      hasReceipt: receiptUrl !== null,
      taskId: task?.id ?? null,
      notes: task?.doneNotes ?? null,
      hasDonePhoto: Boolean(task?.donePhotoUrl),
    })),
    recent: recent.map(({ donePhotoUrl, expense, ...task }) => ({
      ...task,
      hasDonePhoto: donePhotoUrl !== null,
      expense: expense ? { amount: toNumber(expense.amount), status: expense.status } : null,
    })),
  };
}

/**
 * "Mis tareas" de una cuenta de Operación: solo lo suyo y solo lo necesario
 * para hacerlo (unidad, dirección, fecha). Nada de cobros ni de inquilinos.
 */
export async function getMyTasks(db: OrgDb, userId: string) {
  const [open, done] = await Promise.all([
    db.task.findMany({
      where: { assigneeId: userId, status: "OPEN" },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
      select: {
        id: true,
        kind: true,
        title: true,
        description: true,
        dueDate: true,
        createdAt: true,
        reportPhotoUrl: true,
        unitId: true,
        unit: { select: unitSelect },
      },
    }),
    db.task.findMany({
      where: { assigneeId: userId, status: "DONE" },
      orderBy: { doneAt: "desc" },
      take: 10,
      select: { id: true, kind: true, title: true, doneAt: true, unit: { select: unitSelect } },
    }),
  ]);

  // Para una limpieza importa si entra otro huésped el mismo día.
  const cleaningUnits = open.filter((t) => t.kind === "CLEANING" && t.dueDate).map((t) => t.unitId);
  const arrivals = cleaningUnits.length
    ? await db.booking.findMany({
        where: { unitId: { in: cleaningUnits }, status: "CONFIRMED", checkIn: { gte: startOfToday() } },
        select: { unitId: true, checkIn: true },
      })
    : [];
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

  return {
    open: open.map(({ reportPhotoUrl, unitId, ...task }) => ({
      ...task,
      hasReportPhoto: reportPhotoUrl !== null,
      turnover:
        task.kind === "CLEANING" && task.dueDate !== null
          ? arrivals.some((a) => a.unitId === unitId && sameDay(a.checkIn, task.dueDate!))
          : false,
    })),
    done,
  };
}

/** Reportes de reparación que hizo el inquilino, con su estado. */
export async function getPortalReports(db: OrgDb, userId: string) {
  return db.task.findMany({
    where: { kind: "REPAIR", reportedById: userId },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      createdAt: true,
      doneAt: true,
      cancelReason: true,
      assigneeId: true,
    },
  });
}

/** Todas las unidades, para elegir dónde se reporta una reparación. */
export async function getUnitOptions(db: OrgDb) {
  const units = await db.unit.findMany({
    orderBy: [{ building: { name: "asc" } }, { code: "asc" }],
    select: { id: true, code: true, building: { select: { name: true } } },
  });
  return units.map((u) => ({ id: u.id, label: `${u.building.name} · ${u.code}` }));
}
