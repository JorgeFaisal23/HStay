import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createOrgDb } from "@/lib/db/scoped";
import { getMyOwnerAccount, getOwnerDetail, getOwnersBoard, statementForBuilding } from "@/lib/queries/owners";
import { buildExport } from "@/lib/queries/exports";
import { createOrgFixture, deleteOrgFixtures, type OrgFixture } from "@/test/fixtures";

/** Propietarios (B-05): cuentas, asignación, estado de cuenta y entregas. */

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

// Sin SMTP: el acceso se entrega como contraseña temporal.
delete process.env.SMTP_HOST;

const owners = await import("@/server/actions/owners");
const { deleteBuilding } = await import("@/server/actions/properties");

let a: OrgFixture;
let b: OrgFixture;
let ownerA: { id: string };
let otherOwnerA: { id: string };
let ownerB: { id: string };

const as = (fixture: OrgFixture, userId: string, role: string) =>
  Object.assign(actor, { orgId: fixture.organizationId, userId, role });
const asOwner = (fixture: OrgFixture) => as(fixture, fixture.owner.id, "OWNER");

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

async function propertyOwner(fixture: OrgFixture) {
  return prisma.user.create({
    data: {
      organizationId: fixture.organizationId,
      email: `prop-${randomUUID().slice(0, 8)}@test.mx`,
      name: `Propietario ${fixture.org.slug}`,
      role: "PROPERTY_OWNER",
      passwordHash: "x",
    },
  });
}

/**
 * Movimientos de la propiedad de `a` desde agosto de 2026:
 * - renta pagada el 4 de agosto: 5,000 (de la fixture)
 * - reserva terminada el 15 de septiembre: 2,400
 * - reparación aprobada en septiembre: 850 (y una por aprobar de 300, que no cuenta)
 * - servicio de la propiedad incluido en la renta, septiembre: 400
 * - luz de la unidad "aparte" (de la fixture), agosto: 700, que no cuenta
 * Pendiente: 5,000 + 2,400 − 850 − 400 = 6,150.
 */
const EXPECTED_PENDING = 6150;

beforeAll(async () => {
  a = await createOrgFixture("propietarios-a");
  b = await createOrgFixture("propietarios-b");
  ownerA = await propertyOwner(a);
  otherOwnerA = await propertyOwner(a);
  ownerB = await propertyOwner(b);

  const organizationId = a.organizationId;
  await prisma.booking.create({
    data: {
      organizationId,
      unitId: a.freeUnit.id,
      guestName: "Huésped pasado",
      checkIn: new Date(2026, 8, 10),
      checkOut: new Date(2026, 8, 15),
      totalAmount: 2400,
      status: "COMPLETED",
    },
  });
  await prisma.booking.create({
    data: {
      organizationId,
      unitId: a.freeUnit.id,
      guestName: "Cancelado",
      checkIn: new Date(2026, 8, 20),
      checkOut: new Date(2026, 8, 22),
      totalAmount: 9999,
      status: "CANCELLED",
    },
  });
  await prisma.expense.create({
    data: { organizationId, unitId: a.unit.id, concept: "Fuga", amount: 850, spentOn: new Date(2026, 8, 10), status: "APPROVED" },
  });
  await prisma.expense.create({
    data: { organizationId, unitId: a.unit.id, concept: "Foco", amount: 300, spentOn: new Date(2026, 8, 11) },
  });
  const water = await prisma.serviceAccount.create({
    data: { organizationId, type: "WATER", scope: "BUILDING", buildingId: a.building.id, includedInRent: true },
  });
  await prisma.serviceCharge.create({
    data: { organizationId, serviceAccountId: water.id, period: "2026-09", amount: 400 },
  });
});

afterAll(async () => {
  await deleteOrgFixtures(a, b);
});

describe("cuentas de propietarios", () => {
  it("el equipo da de alta un propietario que ocupa un usuario", async () => {
    asOwner(a);
    const email = `nuevo-${randomUUID().slice(0, 8)}@test.mx`;
    const result = await owners.createOwner({}, form({ name: "Ernesto Salgado", email }));
    expect(result.ok).toBe(true);
    expect(result.delivery?.method).toBe("password");
    const created = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(created).toMatchObject({ role: "PROPERTY_OWNER", organizationId: a.organizationId, active: true });

    // Cupo lleno: no entra otro.
    const active = await prisma.user.count({ where: { organizationId: a.organizationId, active: true } });
    await prisma.organization.update({ where: { id: a.organizationId }, data: { maxUsers: active } });
    const full = await owners.createOwner({}, form({ name: "Otro Propietario", email: `x-${randomUUID()}@test.mx` }));
    expect(full.error).toMatch(/contratados/);
    await prisma.organization.update({ where: { id: a.organizationId }, data: { maxUsers: 100 } });

    expect(await owners.setOwnerActive(created.id, false)).toEqual({ ok: true });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: created.id } })).active).toBe(false);
  });

  it("consulta, operación e inquilinos no administran propietarios", async () => {
    for (const role of ["VIEWER", "OPERATIONS", "TENANT", "PROPERTY_OWNER"]) {
      as(a, a.owner.id, role);
      await expect(owners.createOwner({}, form({ name: "Intruso X", email: `i-${randomUUID()}@test.mx` }))).rejects.toThrow(/permiso/);
      await expect(owners.recordOwnerPayout({ buildingId: a.building.id, amount: 1, paidOn: "2026-09-01", method: "Efectivo" })).rejects.toThrow(/permiso/);
    }
  });

  it("solo administra propietarios de su arrendadora (no al equipo ni a inquilinos)", async () => {
    asOwner(a);
    expect(await owners.setOwnerActive(ownerB.id, false)).toEqual({ error: "No se encontró al propietario." });
    expect(await owners.setOwnerActive(a.tenant.id, false)).toEqual({ error: "No se encontró al propietario." });
    expect(await owners.resetOwnerAccess(a.owner.id)).toEqual({ error: "No se encontró al propietario." });
  });
});

describe("asignar propietario", () => {
  it("rechaza propietarios u otras propiedades de otra arrendadora y meses futuros", async () => {
    asOwner(a);
    expect(await owners.assignBuildingOwner({ buildingId: a.building.id, ownerId: ownerB.id, since: "2026-08" })).toEqual({
      error: "No se encontró al propietario.",
    });
    expect(await owners.assignBuildingOwner({ buildingId: b.building.id, ownerId: ownerA.id, since: "2026-08" })).toEqual({
      error: "No se encontró la propiedad.",
    });
    expect(await owners.assignBuildingOwner({ buildingId: a.building.id, ownerId: a.tenant.id, since: "2026-08" })).toEqual({
      error: "No se encontró al propietario.",
    });
    expect(
      (await owners.assignBuildingOwner({ buildingId: a.building.id, ownerId: ownerA.id, since: "2999-01" })).error,
    ).toMatch(/futuro/);
  });

  it("asigna con mes de inicio", async () => {
    asOwner(a);
    expect(await owners.assignBuildingOwner({ buildingId: a.building.id, ownerId: ownerA.id, since: "2026-08" })).toEqual({ ok: true });
    const building = await prisma.building.findUniqueOrThrow({ where: { id: a.building.id } });
    expect(building.ownerId).toBe(ownerA.id);
    expect(building.ownerSince).toEqual(new Date(2026, 7, 1));
  });
});

describe("estado de cuenta", () => {
  it("cobrado − reparaciones aprobadas − servicios incluidos; sin reservas canceladas ni servicios aparte", async () => {
    const db = createOrgDb(a.organizationId);
    const statement = await statementForBuilding(db, { id: a.building.id, ownerId: ownerA.id, ownerSince: new Date(2026, 7, 1) });
    expect(statement.totals).toEqual({ income: 7400, expenses: 1250, net: EXPECTED_PENDING, payouts: 0 });
    expect(statement.pending).toBe(EXPECTED_PENDING);
    const august = statement.months.find((m) => m.period === "2026-08")!;
    const september = statement.months.find((m) => m.period === "2026-09")!;
    expect(august).toMatchObject({ rent: 5000, services: 0 });
    expect(september).toMatchObject({ bookings: 2400, repairs: 850, services: 400 });
  });

  it("el inicio de cuentas deja fuera lo anterior", async () => {
    const db = createOrgDb(a.organizationId);
    const statement = await statementForBuilding(db, { id: a.building.id, ownerId: ownerA.id, ownerSince: new Date(2026, 8, 1) });
    expect(statement.pending).toBe(EXPECTED_PENDING - 5000);
  });

  it("el propietario solo ve sus propiedades; otro propietario o arrendadora, nada", async () => {
    const mine = await getMyOwnerAccount(createOrgDb(a.organizationId), ownerA.id);
    expect(mine.map((x) => x.id)).toEqual([a.building.id]);
    expect(mine[0].statement?.pending).toBe(EXPECTED_PENDING);
    // Lo que recibe la vista del propietario no trae nombres de personas.
    expect(JSON.stringify(mine)).not.toMatch(/Inquilino|Huésped|Cancelado/);

    expect(await getMyOwnerAccount(createOrgDb(a.organizationId), otherOwnerA.id)).toEqual([]);
    expect(await getMyOwnerAccount(createOrgDb(b.organizationId), ownerA.id)).toEqual([]);
    expect(await getOwnerDetail(createOrgDb(b.organizationId), ownerA.id)).toBeNull();
  });

  it("el tablero del equipo suma lo pendiente por propietario", async () => {
    const board = await getOwnersBoard(createOrgDb(a.organizationId));
    const row = board.find((o) => o.id === ownerA.id)!;
    // Lo pendiente se lleva por moneda; sus propiedades están en pesos.
    expect(row.pending).toEqual({ MXN: EXPECTED_PENDING });
    expect(board.every((o) => o.id !== ownerB.id)).toBe(true);
  });

  it("el CSV de cuentas de propietarios lleva el pendiente al cierre de cada mes, solo de su arrendadora", async () => {
    const csv = await buildExport(createOrgDb(a.organizationId), "propietarios", "2026-10");
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toContain("Pendiente al cierre");
    const october = lines.find((l) => l.includes("Octubre 2026"))!;
    expect(october.endsWith(`,${EXPECTED_PENDING},MXN`)).toBe(true);
    expect(csv).not.toContain(`Propietario ${b.org.slug}`);
  });
});

describe("entregas", () => {
  it("no entrega más de lo pendiente, ni antes del inicio, ni a futuro", async () => {
    asOwner(a);
    const base = { buildingId: a.building.id, method: "Transferencia" };
    expect((await owners.recordOwnerPayout({ ...base, amount: EXPECTED_PENDING + 1, paidOn: "2026-10-01" })).error).toMatch(/excede/);
    expect((await owners.recordOwnerPayout({ ...base, amount: 100, paidOn: "2026-07-31" })).error).toMatch(/anterior al inicio/);
    expect((await owners.recordOwnerPayout({ ...base, amount: 100, paidOn: "2999-01-01" })).error).toMatch(/futura/);
    expect((await owners.recordOwnerPayout({ ...base, amount: 100, paidOn: "2026-10-01", receiptUrl: "data:text/html;base64,AA==" })).error).toMatch(/imagen/);
    expect((await owners.recordOwnerPayout({ ...base, buildingId: b.building.id, amount: 100, paidOn: "2026-10-01" })).error).toBe(
      "No se encontró la propiedad.",
    );
  });

  it("registra, resta de lo pendiente y se puede deshacer", async () => {
    asOwner(a);
    expect(
      await owners.recordOwnerPayout({ buildingId: a.building.id, amount: 4000, paidOn: "2026-10-01", method: "Transferencia", reference: "SPEI 1" }),
    ).toEqual({ ok: true });
    const payout = await prisma.ownerPayout.findFirstOrThrow({ where: { buildingId: a.building.id } });
    expect(payout).toMatchObject({ ownerId: ownerA.id, recordedById: a.owner.id, organizationId: a.organizationId });

    const db = createOrgDb(a.organizationId);
    const [after] = await getMyOwnerAccount(db, ownerA.id);
    expect(after.statement?.pending).toBe(EXPECTED_PENDING - 4000);
    expect(after.statement?.payouts).toHaveLength(1);

    // Otra arrendadora no la ve ni la borra.
    asOwner(b);
    expect(await owners.deleteOwnerPayout(payout.id)).toEqual({ error: "No se encontró la entrega." });

    asOwner(a);
    expect(await owners.deleteOwnerPayout(payout.id)).toEqual({ ok: true });
    const [undone] = await getMyOwnerAccount(db, ownerA.id);
    expect(undone.statement?.pending).toBe(EXPECTED_PENDING);
  });

  it("dos entregas simultáneas no rebasan lo pendiente", async () => {
    asOwner(a);
    const results = await Promise.all(
      [1, 2, 3].map(() =>
        owners.recordOwnerPayout({ buildingId: a.building.id, amount: 3000, paidOn: "2026-10-02", method: "Efectivo" }),
      ),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(2);
    const [after] = await getMyOwnerAccount(createOrgDb(a.organizationId), ownerA.id);
    expect(after.statement?.pending).toBe(EXPECTED_PENDING - 6000);
  });

  it("una propiedad con entregas no se puede eliminar", async () => {
    asOwner(a);
    expect((await deleteBuilding(a.building.id))?.error).toBeTruthy();
  });

  it("al cambiar de propietario, el nuevo no ve las entregas del anterior", async () => {
    asOwner(a);
    expect(await owners.assignBuildingOwner({ buildingId: a.building.id, ownerId: otherOwnerA.id, since: "2026-08" })).toEqual({ ok: true });
    const [next] = await getMyOwnerAccount(createOrgDb(a.organizationId), otherOwnerA.id);
    expect(next.statement?.payouts).toEqual([]);
    expect(next.statement?.pending).toBe(EXPECTED_PENDING);
    expect(await getMyOwnerAccount(createOrgDb(a.organizationId), ownerA.id)).toEqual([]);

    expect(await owners.assignBuildingOwner({ buildingId: a.building.id, ownerId: null })).toEqual({ ok: true });
    const building = await prisma.building.findUniqueOrThrow({ where: { id: a.building.id } });
    expect(building).toMatchObject({ ownerId: null, ownerSince: null });
  });
});
