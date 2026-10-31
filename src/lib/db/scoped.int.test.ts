import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createOrgDb } from "@/lib/db/scoped";
import { ScopeError } from "@/lib/db/scope";
import { createOrgFixture, deleteOrgFixtures, type OrgFixture } from "@/test/fixtures";

let a: OrgFixture;
let b: OrgFixture;

beforeAll(async () => {
  a = await createOrgFixture("a");
  b = await createOrgFixture("b");
});

afterAll(async () => {
  await deleteOrgFixtures(a, b);
});

describe("cliente con alcance", () => {
  it("no encuentra filas de otra arrendadora por id", async () => {
    const db = createOrgDb(a.organizationId);
    expect(await db.building.findUnique({ where: { id: b.building.id } })).toBeNull();
    expect(await db.unit.findUnique({ where: { id: b.unit.id } })).toBeNull();
    expect(await db.rentCharge.findFirst({ where: { id: b.charge.id } })).toBeNull();
    expect(await db.user.findUnique({ where: { email: b.owner.email } })).toBeNull();
    // La propia sí la encuentra.
    expect(await db.building.findUnique({ where: { id: a.building.id } })).not.toBeNull();
  });

  it("las listas y los conteos solo incluyen lo propio", async () => {
    const db = createOrgDb(a.organizationId);
    const buildings = await db.building.findMany({ select: { organizationId: true } });
    expect(buildings.length).toBeGreaterThan(0);
    expect(buildings.every((row) => row.organizationId === a.organizationId)).toBe(true);
    expect(await db.lease.count()).toBe(1);
  });

  it("no actualiza ni borra filas de otra arrendadora", async () => {
    const db = createOrgDb(a.organizationId);
    await expect(
      db.unit.update({ where: { id: b.unit.id }, data: { code: "HACK" } }),
    ).rejects.toMatchObject({ code: "P2025" });

    const many = await db.unit.updateMany({
      where: { id: b.unit.id },
      data: { code: "HACK" },
    });
    expect(many.count).toBe(0);

    const deleted = await db.booking.deleteMany({ where: { id: b.booking.id } });
    expect(deleted.count).toBe(0);

    const intact = await prisma.unit.findUniqueOrThrow({ where: { id: b.unit.id } });
    expect(intact.code).toBe("101");
  });

  it("las altas quedan en la arrendadora del cliente aunque pidan otra", async () => {
    const db = createOrgDb(a.organizationId);
    const created = await db.building.create({
      data: { organizationId: b.organizationId, name: "Intruso", address: "X" },
    });
    expect(created.organizationId).toBe(a.organizationId);
  });

  it("las transacciones interactivas conservan el alcance", async () => {
    const db = createOrgDb(a.organizationId);
    const found = await db.$transaction(async (tx) =>
      tx.unit.findUnique({ where: { id: b.unit.id } }),
    );
    expect(found).toBeNull();

    const created = await db.$transaction(async (tx) =>
      tx.building.create({
        data: { organizationId: a.organizationId, name: "En transacción", address: "Y" },
      }),
    );
    expect(created.organizationId).toBe(a.organizationId);
  });

  it("solo ve y actualiza su propia arrendadora", async () => {
    const db = createOrgDb(a.organizationId);
    const org = await db.organization.findUnique({ where: { id: b.organizationId } });
    expect(org?.id).toBe(a.organizationId);

    await db.organization.update({ where: { id: b.organizationId }, data: { brandName: "Cambio" } });
    const other = await prisma.organization.findUniqueOrThrow({ where: { id: b.organizationId } });
    expect(other.brandName).toBe("Marca b");

    await expect(
      db.organization.update({ where: { id: a.organizationId }, data: { plan: "PREMIUM" } }),
    ).rejects.toBeInstanceOf(ScopeError);
  });
});
