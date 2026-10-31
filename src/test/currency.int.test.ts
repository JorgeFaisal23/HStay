import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createOrgDb } from "@/lib/db/scoped";
import { createOrgFixture, deleteOrgFixtures, type OrgFixture } from "@/test/fixtures";

/** Moneda por propiedad: alta, bloqueo del cambio y totales que no mezclan monedas. */

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

const { createBuilding, updateBuilding } = await import("@/server/actions/properties");
const { getPaymentsBoard } = await import("@/lib/queries/payments");
const { getDashboardData } = await import("@/lib/queries/dashboard");

let a: OrgFixture;

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const building = (name: string, extra: Record<string, string> = {}) =>
  form({ name, address: "Calle Luna 7", currency: "USD", ...extra });

beforeAll(async () => {
  a = await createOrgFixture("moneda");
  // Premium: la prueba crea más propiedades de las que permite el plan gratuito.
  await prisma.organization.update({ where: { id: a.organizationId }, data: { plan: "PREMIUM" } });
  actor.orgId = a.organizationId;
  actor.userId = a.owner.id;
});

afterAll(async () => {
  await deleteOrgFixtures(a);
});

describe("moneda por propiedad", () => {
  it("una propiedad nueva se crea en la moneda elegida y por defecto en pesos", async () => {
    expect(await createBuilding({}, building("Moonlight"))).toEqual({ ok: true });
    expect(await createBuilding({}, form({ name: "Sin moneda", address: "Calle 2" }))).toEqual({ ok: true });
    const [usd, mxn] = await Promise.all([
      prisma.building.findFirstOrThrow({ where: { organizationId: a.organizationId, name: "Moonlight" } }),
      prisma.building.findFirstOrThrow({ where: { organizationId: a.organizationId, name: "Sin moneda" } }),
    ]);
    expect(usd.currency).toBe("USD");
    expect(mxn.currency).toBe("MXN");
    // La del fixture ya existía: queda en pesos.
    expect((await prisma.building.findUniqueOrThrow({ where: { id: a.building.id } })).currency).toBe("MXN");
  });

  it("rechaza una moneda que no existe", async () => {
    expect(await createBuilding({}, building("Euros", { currency: "EUR" }))).toHaveProperty("error");
  });

  it("la moneda se cambia mientras no haya montos y se bloquea en cuanto los hay", async () => {
    const moon = await prisma.building.findFirstOrThrow({
      where: { organizationId: a.organizationId, name: "Moonlight" },
    });
    const edit = (currency: string) =>
      updateBuilding({}, form({ buildingId: moon.id, name: "Moonlight", address: "Calle Luna 7", currency }));

    expect(await edit("MXN")).toEqual({ ok: true });
    expect(await edit("USD")).toEqual({ ok: true });

    const unit = await prisma.unit.create({
      data: { organizationId: a.organizationId, buildingId: moon.id, code: "M-1", baseRent: 2000 },
    });
    await prisma.booking.create({
      data: {
        organizationId: a.organizationId,
        unitId: unit.id,
        guestName: "Huésped en dólares",
        checkIn: new Date("2031-02-01T12:00:00"),
        checkOut: new Date("2031-02-10T12:00:00"),
        totalAmount: 1500,
      },
    });

    expect(await edit("MXN")).toEqual({ error: expect.stringMatching(/No se puede cambiar la moneda/) });
    expect((await prisma.building.findUniqueOrThrow({ where: { id: moon.id } })).currency).toBe("USD");
    // Editar lo demás sin tocar la moneda sigue funcionando.
    expect(
      await updateBuilding({}, form({ buildingId: moon.id, name: "Moonlight Tulum", address: "Calle Luna 7", currency: "USD" })),
    ).toEqual({ ok: true });
  });

  it("los totales de cobros y del resumen se llevan por moneda", async () => {
    const moon = await prisma.building.findFirstOrThrow({
      where: { organizationId: a.organizationId, currency: "USD" },
      include: { units: true },
    });
    const lease = await prisma.lease.create({
      data: {
        organizationId: a.organizationId,
        unitId: moon.units[0].id,
        tenantId: a.tenant.id,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2027-01-01"),
        rentAmount: 2000,
      },
    });
    await prisma.rentCharge.create({
      data: {
        organizationId: a.organizationId,
        leaseId: lease.id,
        period: "2026-09",
        dueDate: new Date("2026-09-05"),
        amount: 2000,
        paidAmount: 500,
        status: "PARTIAL",
      },
    });

    const db = createOrgDb(a.organizationId);
    const board = await getPaymentsBoard(db, "2026-09");
    // Pesos: el cargo del fixture (5,000). Dólares: el de Moonlight (2,000).
    expect(board.expected).toEqual({ MXN: 5000, USD: 2000 });
    expect(board.collected).toEqual({ MXN: 0, USD: 500 });
    expect(board.pending).toEqual({ MXN: 5000, USD: 1500 });
    expect(board.buildings.find((b) => b.id === moon.id)).toMatchObject({ currency: "USD", total: 2000 });

    const dashboard = await getDashboardData(db);
    for (const value of Object.values(dashboard.expectedIncome)) expect(typeof value).toBe("number");
    expect(Object.keys(dashboard.expectedIncome).every((c) => c === "MXN" || c === "USD")).toBe(true);
  });
});
