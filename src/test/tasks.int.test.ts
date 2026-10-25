import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createOrgDb } from "@/lib/db/scoped";
import { getTodayData } from "@/lib/queries/today";
import { getPaymentsBoard } from "@/lib/queries/payments";
import { getMyTasks } from "@/lib/queries/tasks";
import { periodKey } from "@/lib/format";
import { createOrgFixture, deleteOrgFixtures, type OrgFixture } from "@/test/fixtures";

/** Tareas de operación: reportar, asignar, cerrar con foto y costo, y aprobar el gasto. */

const actor = vi.hoisted(() => ({ orgId: "", userId: "", role: "OWNER" }));

vi.mock("@/lib/auth/session", async () => {
  const { createOrgDb } = await import("@/lib/db/scoped");
  return {
    requireOrgUserAction: async (roles?: string[]) => {
      if (roles && !roles.includes(actor.role)) throw new Error("No tienes permiso para realizar esta acción.");
      return {
        session: { sub: actor.userId, role: actor.role, orgId: actor.orgId },
        orgId: actor.orgId,
        db: createOrgDb(actor.orgId),
      };
    },
  };
});
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const tasks = await import("@/server/actions/tasks");
const expenses = await import("@/server/actions/expenses");
const { cancelBooking } = await import("@/server/actions/bookings");

const PHOTO = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";

let a: OrgFixture;
let b: OrgFixture;
let ops: { id: string };
let otherOps: { id: string };

const as = (fixture: OrgFixture, userId: string, role: string) =>
  Object.assign(actor, { orgId: fixture.organizationId, userId, role });
const asOwner = (fixture: OrgFixture) => as(fixture, fixture.owner.id, "OWNER");

async function user(fixture: OrgFixture, role: "OPERATIONS" | "TENANT", active = true) {
  return prisma.user.create({
    data: {
      organizationId: fixture.organizationId,
      email: `${role.toLowerCase()}-${randomUUID().slice(0, 8)}@test.mx`,
      name: `${role} ${fixture.org.slug}`,
      role,
      active,
      passwordHash: "x",
    },
  });
}

beforeAll(async () => {
  a = await createOrgFixture("tareas-a");
  b = await createOrgFixture("tareas-b");
  ops = await user(a, "OPERATIONS");
  otherOps = await user(a, "OPERATIONS");
});

afterAll(async () => {
  await deleteOrgFixtures(a, b);
});

describe("reportar", () => {
  it("el equipo reporta en una unidad; el inquilino, en la suya", async () => {
    asOwner(a);
    expect(await tasks.reportRepair({ unitId: a.freeUnit.id, title: "Foco fundido", assigneeId: ops.id })).toEqual({ ok: true });

    as(a, a.tenant.id, "TENANT");
    expect(await tasks.reportRepairFromPortal({ title: "Gotea la regadera", photoUrl: PHOTO })).toEqual({ ok: true });
    const fromTenant = await prisma.task.findFirstOrThrow({ where: { title: "Gotea la regadera" } });
    // La unidad sale de su contrato, no la elige el inquilino.
    expect(fromTenant).toMatchObject({ kind: "REPAIR", status: "OPEN", unitId: a.unit.id, reportedById: a.tenant.id, assigneeId: null });

    const homeless = await user(a, "TENANT");
    as(a, homeless.id, "TENANT");
    expect(await tasks.reportRepairFromPortal({ title: "Algo" })).toEqual({ error: expect.stringMatching(/unidad activa/) });
  });

  it("no reporta en unidades de otra arrendadora ni con foto inválida", async () => {
    asOwner(a);
    expect(await tasks.reportRepair({ unitId: b.unit.id, title: "Ajeno" })).toEqual({ error: "No se encontró la unidad." });
    expect(await tasks.reportRepair({ unitId: a.unit.id, title: "Con archivo", photoUrl: "data:text/html;base64,AA==" })).toEqual({
      error: "La foto debe ser una imagen.",
    });
  });
});

describe("asignar", () => {
  it("solo a Operación o al equipo, con acceso activo y de la misma arrendadora", async () => {
    asOwner(a);
    const task = await prisma.task.findFirstOrThrow({ where: { title: "Gotea la regadera" } });
    const inactive = await user(a, "OPERATIONS", false);
    const foreign = await user(b, "OPERATIONS");

    expect(await tasks.assignTask(task.id, a.tenant.id)).toHaveProperty("error");
    expect(await tasks.assignTask(task.id, inactive.id)).toHaveProperty("error");
    expect(await tasks.assignTask(task.id, foreign.id)).toHaveProperty("error");
    expect(await tasks.assignTask(task.id, ops.id)).toEqual({ ok: true });
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).assigneeId).toBe(ops.id);
  });

  it("Operación no asigna ni reporta desde el panel", async () => {
    as(a, ops.id, "OPERATIONS");
    await expect(tasks.reportRepair({ unitId: a.unit.id, title: "x" })).rejects.toThrow(/permiso/);
    const task = await prisma.task.findFirstOrThrow({ where: { title: "Gotea la regadera" } });
    await expect(tasks.assignTask(task.id, null)).rejects.toThrow(/permiso/);
  });
});

describe("cerrar una reparación", () => {
  it("pide foto, costo y comprobante; el costo nace como gasto por aprobar", async () => {
    const task = await prisma.task.findFirstOrThrow({ where: { title: "Gotea la regadera" } });

    // Otra persona de Operación no la ve.
    as(a, otherOps.id, "OPERATIONS");
    expect(await tasks.completeTask(task.id, { photoUrl: PHOTO, cost: 0 })).toEqual({ error: "No se encontró la tarea." });
    expect((await getMyTasks(createOrgDb(a.organizationId), otherOps.id)).open).toHaveLength(0);

    as(a, ops.id, "OPERATIONS");
    const mine = await getMyTasks(createOrgDb(a.organizationId), ops.id);
    expect(mine.open.map((t) => t.title).sort()).toEqual(["Foco fundido", "Gotea la regadera"]);

    expect(await tasks.completeTask(task.id, { cost: 0 })).toEqual({ error: expect.stringMatching(/foto/) });
    expect(await tasks.completeTask(task.id, { photoUrl: PHOTO })).toEqual({ error: expect.stringMatching(/cuánto costó/) });
    expect(await tasks.completeTask(task.id, { photoUrl: PHOTO, cost: 850 })).toEqual({ error: expect.stringMatching(/comprobante/) });
    expect(await tasks.completeTask(task.id, { photoUrl: PHOTO, cost: 850, receiptUrl: PHOTO, notes: "Empaque nuevo" })).toEqual({ ok: true });
    expect(await tasks.completeTask(task.id, { photoUrl: PHOTO, cost: 850, receiptUrl: PHOTO })).toEqual({ error: "La tarea ya no está abierta." });

    const done = await prisma.task.findUniqueOrThrow({ where: { id: task.id }, include: { expense: true } });
    expect(done).toMatchObject({ status: "DONE", doneById: ops.id, doneNotes: "Empaque nuevo" });
    expect(done.expense).toMatchObject({ status: "PENDING", unitId: a.unit.id, createdById: ops.id });
    expect(Number(done.expense?.amount)).toBe(850);
  });

  it("sin costo no genera gasto", async () => {
    as(a, ops.id, "OPERATIONS");
    const task = await prisma.task.findFirstOrThrow({ where: { title: "Foco fundido" } });
    expect(await tasks.completeTask(task.id, { photoUrl: PHOTO, cost: 0 })).toEqual({ ok: true });
    expect(await prisma.expense.count({ where: { taskId: task.id } })).toBe(0);
  });
});

describe("gastos", () => {
  it("el gasto pendiente no cuenta; aprobado con monto ajustado, sí", async () => {
    const db = createOrgDb(a.organizationId);
    const period = periodKey(new Date());
    const expense = await prisma.expense.findFirstOrThrow({ where: { organizationId: a.organizationId } });

    expect((await getPaymentsBoard(db, period)).repairsExpense).toBe(0);
    expect((await getTodayData(db)).items.map((i) => i.key)).toContain(`expense:${expense.id}`);

    as(a, ops.id, "OPERATIONS");
    await expect(expenses.approveExpense(expense.id)).rejects.toThrow(/permiso/);

    asOwner(a);
    expect(await expenses.approveExpense(expense.id, { amount: 800 })).toEqual({ ok: true });
    expect(await expenses.approveExpense(expense.id)).toEqual({ error: "Este gasto ya se revisó." });
    expect((await getPaymentsBoard(db, period)).repairsExpense).toBe(800);
    expect((await getTodayData(db)).items.map((i) => i.key)).not.toContain(`expense:${expense.id}`);
  });

  it("rechazar pide motivo; nada de otra arrendadora", async () => {
    asOwner(b);
    const task = await prisma.task.create({
      data: { organizationId: b.organizationId, kind: "REPAIR", unitId: b.unit.id, title: "Puerta" },
    });
    const foreign = await prisma.expense.create({
      data: { organizationId: b.organizationId, unitId: b.unit.id, taskId: task.id, concept: "Reparación: Puerta", amount: 300, spentOn: new Date() },
    });

    asOwner(a);
    expect(await expenses.approveExpense(foreign.id)).toEqual({ error: "No se encontró el gasto." });
    expect(await tasks.completeTask(task.id, { photoUrl: PHOTO, cost: 0 })).toEqual({ error: "No se encontró la tarea." });

    asOwner(b);
    expect(await expenses.rejectExpense(foreign.id, "")).toHaveProperty("error");
    expect(await expenses.rejectExpense(foreign.id, "Ticket ilegible")).toEqual({ ok: true });
    expect((await prisma.expense.findUniqueOrThrow({ where: { id: foreign.id } })).status).toBe("REJECTED");
  });
});

describe("limpiezas", () => {
  it("una por reserva; reasignar no duplica; cancelar la reserva la cancela", async () => {
    asOwner(a);
    expect(await tasks.scheduleCleaning(a.booking.id, null)).toEqual({ ok: true });
    expect(await tasks.scheduleCleaning(a.booking.id, ops.id)).toEqual({ ok: true });

    const cleanings = await prisma.task.findMany({ where: { bookingId: a.booking.id } });
    expect(cleanings).toHaveLength(1);
    expect(cleanings[0]).toMatchObject({ kind: "CLEANING", status: "OPEN", assigneeId: ops.id, unitId: a.freeUnit.id });
    expect(cleanings[0].dueDate?.getTime()).toBe(a.booking.checkOut.getTime());

    expect(await tasks.scheduleCleaning(b.booking.id, null)).toEqual({ error: expect.stringMatching(/reserva confirmada/) });

    expect(await cancelBooking(a.booking.id)).toEqual({ ok: true });
    expect(await prisma.task.findUniqueOrThrow({ where: { id: cleanings[0].id } })).toMatchObject({
      status: "CANCELLED",
      cancelReason: "Se canceló la reserva",
    });
  });
});
