import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { periodKey } from "@/lib/format";
import { createOrgFixture, deleteOrgFixtures, type OrgFixture } from "@/test/fixtures";

/** Ciclo del contrato, barrido de vencimientos, pagos parciales y límites del plan. */

class Redirect extends Error {
  constructor(public path: string) {
    super(`REDIRECT ${path}`);
  }
}

const actor = vi.hoisted(() => ({ orgId: "", userId: "" }));

vi.mock("@/lib/auth/session", async () => {
  const { createOrgDb } = await import("@/lib/db/scoped");
  return {
    requireOrgUserAction: async () => ({
      session: { sub: actor.userId, role: "OWNER", orgId: actor.orgId },
      orgId: actor.orgId,
      db: createOrgDb(actor.orgId),
    }),
  };
});
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Redirect(path);
  },
}));

const { createLease, endLease, renewLease, cancelLease } = await import("@/server/actions/leases");
const { registerPayment, deletePayment, markChargeUnpaid } = await import("@/server/actions/payments");
const { createBuilding } = await import("@/server/actions/properties");
const { sweepOrg } = await import("@/lib/db/sweep");

let a: OrgFixture;
let b: OrgFixture;

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

async function newTenant(fixture: OrgFixture) {
  return prisma.user.create({
    data: {
      organizationId: fixture.organizationId,
      email: `t-${randomUUID().slice(0, 8)}@test.mx`,
      name: "Inquilina Nueva",
      role: "TENANT",
      passwordHash: "x",
    },
  });
}

async function redirectOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof Redirect) return error.path;
    throw error;
  }
  return null;
}

const terms = (start: string, end: string) => ({
  startDate: start,
  endDate: end,
  rentAmount: "4800",
  depositAmount: "4800",
  paymentDay: "5",
});

beforeAll(async () => {
  a = await createOrgFixture("contratos-a");
  b = await createOrgFixture("contratos-b");
  actor.orgId = a.organizationId;
  actor.userId = a.owner.id;
});

afterAll(async () => {
  await deleteOrgFixtures(a, b);
});

describe("alta de contrato para un inquilino existente", () => {
  it("asigna una unidad libre y la marca ocupada", async () => {
    const tenant = await newTenant(a);
    // La reserva de la unidad libre es en octubre; el contrato empieza en noviembre.
    const path = await redirectOf(
      createLease({}, form({ tenantId: tenant.id, unitId: a.freeUnit.id, ...terms("2026-11-01", "2027-11-01") })),
    );
    expect(path).toBe(`/inquilinos/${tenant.id}`);

    const lease = await prisma.lease.findFirstOrThrow({ where: { tenantId: tenant.id } });
    expect(lease.status).toBe("ACTIVE");
    expect((await prisma.unit.findUniqueOrThrow({ where: { id: a.freeUnit.id } })).status).toBe("OCCUPIED");

    // La misma unidad ya no admite otro contrato.
    const other = await newTenant(a);
    expect(
      await createLease({}, form({ tenantId: other.id, unitId: a.freeUnit.id, ...terms("2027-12-01", "2028-12-01") })),
    ).toHaveProperty("error");
  });

  it("rechaza fechas que chocan con una reserva", async () => {
    const tenant = await newTenant(a);
    await prisma.lease.updateMany({ where: { unitId: a.freeUnit.id }, data: { status: "CANCELLED" } });
    const result = await createLease(
      {},
      form({ tenantId: tenant.id, unitId: a.freeUnit.id, ...terms("2030-10-01", "2031-10-01") }),
    );
    expect(result).toEqual({ error: expect.stringMatching(/reserva/) });
  });

  it("no usa inquilinos ni unidades de otra arrendadora", async () => {
    const tenant = await newTenant(a);
    expect(
      await createLease({}, form({ tenantId: tenant.id, unitId: b.freeUnit.id, ...terms("2027-01-01", "2028-01-01") })),
    ).toHaveProperty("error");
    expect(
      await createLease({}, form({ tenantId: b.tenant.id, unitId: a.unit.id, ...terms("2027-01-01", "2028-01-01") })),
    ).toHaveProperty("error");
    expect(await prisma.lease.count({ where: { unitId: b.freeUnit.id } })).toBe(0);
  });

  it("valida bajo el candado de la unidad: ve la reserva que entró mientras esperaba", async () => {
    const unit = await prisma.unit.create({
      data: { organizationId: a.organizationId, buildingId: a.building.id, code: `C-${randomUUID().slice(0, 4)}`, baseRent: 4000 },
    });
    const tenant = await newTenant(a);

    // Otra alta (la de reservas usa el mismo candado) tiene tomada la unidad y
    // escribe una estancia que se cruza. El contrato debe esperar y verla.
    let pending: Promise<unknown> = Promise.resolve();
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${unit.id}))`;
      pending = createLease(
        {},
        form({ tenantId: tenant.id, unitId: unit.id, ...terms("2031-03-01", "2032-03-01") }),
      ).catch((error) => (error instanceof Redirect ? error.path : Promise.reject(error)));
      await new Promise((resolve) => setTimeout(resolve, 400));
      await tx.booking.create({
        data: {
          organizationId: a.organizationId,
          unitId: unit.id,
          guestName: "Huésped en espera",
          checkIn: new Date("2031-03-10T12:00:00"),
          checkOut: new Date("2031-03-12T12:00:00"),
          totalAmount: 1500,
        },
      });
    });

    expect(await pending).toEqual({ error: expect.stringMatching(/reserva/) });
    expect(await prisma.lease.count({ where: { unitId: unit.id } })).toBe(0);
  });
});

describe("terminar, renovar y cancelar", () => {
  it("renovar extiende la vigencia y cambia la renta", async () => {
    expect(await renewLease(a.lease.id, form({ endDate: "2027-06-01", rentAmount: "5200" }))).toEqual({ ok: true });
    const lease = await prisma.lease.findUniqueOrThrow({ where: { id: a.lease.id } });
    expect(lease.endDate.getFullYear()).toBe(2027);
    expect(Number(lease.rentAmount)).toBe(5200);
    expect(await renewLease(a.lease.id, form({ endDate: "2026-01-01" }))).toHaveProperty("error");
  });

  it("no se cancela un contrato con pagos", async () => {
    expect(await cancelLease(a.lease.id, form({}))).toHaveProperty("error");
  });

  it("terminar hoy libera la unidad y borra cargos futuros sin pagos", async () => {
    const future = await prisma.rentCharge.create({
      data: {
        organizationId: a.organizationId,
        leaseId: a.lease.id,
        period: "2030-01",
        dueDate: new Date("2030-01-05"),
        amount: 5000,
      },
    });
    const today = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const todayInput = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

    expect(await endLease(a.lease.id, form({ endDate: todayInput, reason: "Se mudó" }))).toEqual({ ok: true });

    const lease = await prisma.lease.findUniqueOrThrow({ where: { id: a.lease.id } });
    expect(lease.status).toBe("ENDED");
    expect(lease.endReason).toBe("Se mudó");
    expect((await prisma.unit.findUniqueOrThrow({ where: { id: a.unit.id } })).status).toBe("AVAILABLE");
    expect(await prisma.rentCharge.findUnique({ where: { id: future.id } })).toBeNull();
    // El cargo pagado se conserva.
    expect(await prisma.rentCharge.findUnique({ where: { id: a.paidCharge.id } })).not.toBeNull();
  });

  it("no termina ni renueva contratos de otra arrendadora", async () => {
    expect(await endLease(b.lease.id, form({ endDate: "2026-12-01" }))).toHaveProperty("error");
    expect(await renewLease(b.lease.id, form({ endDate: "2030-01-01" }))).toHaveProperty("error");
    expect(await cancelLease(b.lease.id, form({}))).toHaveProperty("error");
    expect((await prisma.lease.findUniqueOrThrow({ where: { id: b.lease.id } })).status).toBe("ACTIVE");
  });
});

describe("barrido de vencimientos", () => {
  it("termina contratos vencidos y marca cargos atrasados, una vez por hora", async () => {
    const tenant = await newTenant(b);
    const unit = await prisma.unit.create({
      data: { organizationId: b.organizationId, buildingId: b.building.id, code: "B-VENCE", baseRent: 1000, status: "OCCUPIED" },
    });
    const old = await prisma.lease.create({
      data: {
        organizationId: b.organizationId,
        unitId: unit.id,
        tenantId: tenant.id,
        startDate: new Date("2024-01-01"),
        endDate: new Date("2025-01-01"),
        rentAmount: 1000,
      },
    });
    const late = await prisma.rentCharge.create({
      data: {
        organizationId: b.organizationId,
        leaseId: old.id,
        period: "2024-12",
        dueDate: new Date("2024-12-05"),
        amount: 1000,
      },
    });
    await prisma.organization.update({ where: { id: b.organizationId }, data: { lastSweepAt: null } });

    const first = await sweepOrg(b.organizationId);
    expect(first).toMatchObject({ skipped: false });

    expect((await prisma.lease.findUniqueOrThrow({ where: { id: old.id } })).status).toBe("ENDED");
    expect((await prisma.unit.findUniqueOrThrow({ where: { id: unit.id } })).status).toBe("AVAILABLE");
    expect((await prisma.rentCharge.findUniqueOrThrow({ where: { id: late.id } })).status).toBe("OVERDUE");
    // El contrato vigente de B no se toca.
    expect((await prisma.lease.findUniqueOrThrow({ where: { id: b.lease.id } })).status).toBe("ACTIVE");

    expect(await sweepOrg(b.organizationId)).toEqual({ skipped: true });
  });
});

describe("pagos parciales", () => {
  it("abona, liquida y deshace", async () => {
    const charge = await prisma.rentCharge.create({
      data: {
        organizationId: a.organizationId,
        leaseId: a.lease.id,
        period: periodKey(new Date(2031, 0, 1)),
        dueDate: new Date(2031, 0, 5, 12),
        amount: 5000,
      },
    });
    const read = () => prisma.rentCharge.findUniqueOrThrow({ where: { id: charge.id } });

    expect(await registerPayment({ chargeId: charge.id, amount: 2000.1, method: "Efectivo" })).toEqual({ ok: true });
    expect((await read()).status).toBe("PARTIAL");
    expect(Number((await read()).paidAmount)).toBe(2000.1);

    expect(await registerPayment({ chargeId: charge.id, amount: 3000, method: "Efectivo" })).toHaveProperty("error");
    expect(await registerPayment({ chargeId: charge.id, amount: 2999.9, method: "Transferencia", reference: "REF-9" })).toEqual({ ok: true });
    const paid = await read();
    expect(paid.status).toBe("PAID");
    expect(paid.method).toBe("Transferencia");
    expect(await registerPayment({ chargeId: charge.id, amount: 1, method: "Efectivo" })).toHaveProperty("error");

    const last = await prisma.rentPayment.findFirstOrThrow({
      where: { rentChargeId: charge.id, reference: "REF-9" },
    });
    expect(await deletePayment(last.id)).toEqual({ ok: true });
    expect((await read()).status).toBe("PARTIAL");

    expect(await markChargeUnpaid(charge.id)).toEqual({ ok: true });
    const undone = await read();
    expect(undone.status).toBe("PENDING");
    expect(Number(undone.paidAmount)).toBe(0);
    expect(await prisma.rentPayment.count({ where: { rentChargeId: charge.id } })).toBe(0);
  });
});

describe("límites del plan gratuito", () => {
  it("permite 2 propiedades y bloquea la tercera", async () => {
    const add = (name: string) => createBuilding({}, form({ name, address: "Calle Falsa 123" }));
    expect(await add("Segunda propiedad")).toEqual({ ok: true });
    expect(await add("Tercera propiedad")).toEqual({ error: expect.stringMatching(/hasta 2 propiedades/) });

    await prisma.organization.update({ where: { id: a.organizationId }, data: { plan: "PREMIUM" } });
    expect(await add("Tercera propiedad")).toEqual({ ok: true });
  });
});
