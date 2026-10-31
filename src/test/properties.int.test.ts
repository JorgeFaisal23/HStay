import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createOrgFixture, deleteOrgFixtures, type OrgFixture } from "@/test/fixtures";

/** Edición y baja de propiedades, servicios de edificio y reservas manuales. */

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

const {
  updateBuilding,
  deleteBuilding,
  deleteUnit,
  createBuildingServiceAccount,
  updateServiceAccount,
} = await import("@/server/actions/properties");
const { createBooking, cancelBooking } = await import("@/server/actions/bookings");

let a: OrgFixture;
let b: OrgFixture;

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

async function outcome(promise: Promise<unknown>) {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof Redirect) return { redirect: error.path };
    throw error;
  }
}

beforeAll(async () => {
  a = await createOrgFixture("props-a");
  b = await createOrgFixture("props-b");
  actor.orgId = a.organizationId;
  actor.userId = a.owner.id;
});

afterAll(async () => {
  await deleteOrgFixtures(a, b);
});

describe("editar y eliminar propiedades", () => {
  it("edita una propiedad propia, no la de otra arrendadora", async () => {
    const fields = { name: "Torre Nueva", address: "Av. Siempre Viva 742", city: "Monterrey" };
    expect(await updateBuilding({}, form({ buildingId: a.building.id, ...fields }))).toEqual({ ok: true });
    expect((await prisma.building.findUniqueOrThrow({ where: { id: a.building.id } })).city).toBe("Monterrey");

    expect(await updateBuilding({}, form({ buildingId: b.building.id, ...fields }))).toHaveProperty("error");
    expect((await prisma.building.findUniqueOrThrow({ where: { id: b.building.id } })).name).not.toBe("Torre Nueva");
  });

  it("no elimina una propiedad con contratos vigentes ni la de otra arrendadora", async () => {
    expect(await deleteBuilding(a.building.id)).toEqual({ error: expect.stringMatching(/contratos vigentes/) });
    expect(await deleteBuilding(b.building.id)).toHaveProperty("error");
    expect(await prisma.building.count({ where: { id: { in: [a.building.id, b.building.id] } } })).toBe(2);
  });

  it("elimina una propiedad sin historial junto con sus unidades y servicios", async () => {
    const building = await prisma.building.create({
      data: { organizationId: a.organizationId, name: "Vacía", address: "Calle 2" },
    });
    const unit = await prisma.unit.create({
      data: { organizationId: a.organizationId, buildingId: building.id, code: "V-1", baseRent: 100 },
    });
    await prisma.serviceAccount.create({
      data: { organizationId: a.organizationId, type: "WATER", scope: "BUILDING", buildingId: building.id },
    });

    expect(await outcome(deleteBuilding(building.id))).toEqual({ redirect: "/edificios" });
    expect(await prisma.building.findUnique({ where: { id: building.id } })).toBeNull();
    expect(await prisma.unit.findUnique({ where: { id: unit.id } })).toBeNull();
  });

  it("no elimina una propiedad con historial", async () => {
    const building = await prisma.building.create({
      data: { organizationId: a.organizationId, name: "Con historia", address: "Calle 3" },
    });
    const unit = await prisma.unit.create({
      data: { organizationId: a.organizationId, buildingId: building.id, code: "H-1", baseRent: 100 },
    });
    await prisma.lease.create({
      data: {
        organizationId: a.organizationId,
        unitId: unit.id,
        tenantId: a.tenant.id,
        startDate: new Date("2024-01-01"),
        endDate: new Date("2025-01-01"),
        rentAmount: 100,
        status: "ENDED",
      },
    });
    expect(await deleteBuilding(building.id)).toEqual({ error: expect.stringMatching(/historial/) });
  });
});

describe("eliminar unidades", () => {
  it("bloquea con reservas próximas o servicios capturados", async () => {
    expect(await deleteUnit(a.freeUnit.id)).toEqual({ error: expect.stringMatching(/reservas próximas/) });
    // a.unit tiene contrato vigente.
    expect(await deleteUnit(a.unit.id)).toEqual({ error: expect.stringMatching(/contratos vigentes/) });
    expect(await deleteUnit(b.freeUnit.id)).toHaveProperty("error");
  });

  it("elimina una unidad sin historial", async () => {
    const unit = await prisma.unit.create({
      data: { organizationId: a.organizationId, buildingId: a.building.id, code: "BORRAR", baseRent: 100 },
    });
    expect(await outcome(deleteUnit(unit.id))).toEqual({ redirect: `/edificios/${a.building.id}` });
    expect(await prisma.unit.findUnique({ where: { id: unit.id } })).toBeNull();
  });
});

describe("servicios de la propiedad", () => {
  it("da de alta un recibo de edificio con su reparto", async () => {
    const fields = { buildingId: a.building.id, type: "WATER", splitMode: "BY_SIZE", providerName: "SACMEX" };
    expect(await createBuildingServiceAccount({}, form(fields))).toEqual({ ok: true });
    const account = await prisma.serviceAccount.findFirstOrThrow({
      where: { buildingId: a.building.id, type: "WATER" },
    });
    expect(account).toMatchObject({ scope: "BUILDING", splitMode: "BY_SIZE", organizationId: a.organizationId });

    expect(await createBuildingServiceAccount({}, form(fields))).toEqual({
      error: expect.stringMatching(/ya tiene/),
    });
    expect(
      await createBuildingServiceAccount({}, form({ ...fields, buildingId: b.building.id })),
    ).toHaveProperty("error");
    expect(await prisma.serviceAccount.count({ where: { buildingId: b.building.id } })).toBe(0);
  });

  it("cambia el reparto solo en recibos de edificio", async () => {
    const account = await prisma.serviceAccount.findFirstOrThrow({
      where: { buildingId: a.building.id, type: "WATER" },
    });
    expect(
      await updateServiceAccount({}, form({ accountId: account.id, includedInRent: "off", splitMode: "EQUAL" })),
    ).toEqual({ ok: true });
    expect((await prisma.serviceAccount.findUniqueOrThrow({ where: { id: account.id } })).splitMode).toBe("EQUAL");

    // Un servicio de unidad ignora el reparto.
    await updateServiceAccount({}, form({ accountId: a.account.id, includedInRent: "off", splitMode: "EQUAL" }));
    expect((await prisma.serviceAccount.findUniqueOrThrow({ where: { id: a.account.id } })).splitMode).toBe("NONE");

    expect(
      await updateServiceAccount({}, form({ accountId: b.account.id, includedInRent: "on", splitMode: "EQUAL" })),
    ).toHaveProperty("error");
  });
});

describe("reservas manuales", () => {
  const stay = (unitId: string, checkIn: string, checkOut: string) =>
    form({ unitId, guestName: "Ana Huésped", checkIn, checkOut, guests: "2", totalAmount: "3000", source: "DIRECT" });

  it("rechaza traslapes con reservas y contratos", async () => {
    // La reserva del fixture en freeUnit va del 10 al 12 de octubre de 2030 (futura a propósito: "reservas próximas" se compara contra hoy).
    expect(await createBooking({}, stay(a.freeUnit.id, "2030-10-11", "2030-10-13"))).toEqual({
      error: expect.stringMatching(/Se cruza/),
    });
    expect(await createBooking({}, stay(a.unit.id, "2026-11-01", "2026-11-03"))).toEqual({
      error: expect.stringMatching(/rentada/),
    });
    expect(await createBooking({}, stay(a.freeUnit.id, "2026-11-05", "2026-11-05"))).toEqual({
      error: expect.stringMatching(/posterior/),
    });
  });

  it("registra y cancela una estancia; la salida de una es la llegada de otra", async () => {
    expect(await createBooking({}, stay(a.freeUnit.id, "2030-10-12", "2030-10-14"))).toEqual({ ok: true });
    const booking = await prisma.booking.findFirstOrThrow({
      where: { unitId: a.freeUnit.id, guestName: "Ana Huésped" },
    });
    expect(booking).toMatchObject({ source: "DIRECT", status: "CONFIRMED", guests: 2 });

    expect(await createBooking({}, stay(a.freeUnit.id, "2030-10-13", "2030-10-15"))).toHaveProperty("error");

    expect(await cancelBooking(booking.id)).toEqual({ ok: true });
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe("CANCELLED");
    expect(await cancelBooking(booking.id)).toHaveProperty("error");

    // Cancelada, las fechas vuelven a estar libres.
    expect(await createBooking({}, stay(a.freeUnit.id, "2030-10-13", "2030-10-15"))).toEqual({ ok: true });
  });

  it("no toca reservas ni unidades de otra arrendadora, ni cancela las de Airbnb", async () => {
    const before = await prisma.booking.count({ where: { organizationId: b.organizationId } });
    expect(await createBooking({}, stay(b.freeUnit.id, "2027-03-01", "2027-03-03"))).toHaveProperty("error");
    expect(await cancelBooking(b.booking.id)).toHaveProperty("error");
    expect(await prisma.booking.count({ where: { organizationId: b.organizationId } })).toBe(before);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: b.booking.id } })).status).toBe("CONFIRMED");

    const airbnb = await prisma.booking.create({
      data: {
        organizationId: a.organizationId,
        unitId: a.freeUnit.id,
        source: "AIRBNB",
        guestName: "Desde Airbnb",
        checkIn: new Date("2027-05-01T12:00:00"),
        checkOut: new Date("2027-05-03T12:00:00"),
        totalAmount: 1,
      },
    });
    expect(await cancelBooking(airbnb.id)).toEqual({ error: expect.stringMatching(/Airbnb/) });
  });
});
