import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createOrgDb } from "@/lib/db/scoped";
import { createOrgFixture, deleteOrgFixtures, type OrgFixture } from "@/test/fixtures";

/**
 * Rol Captura: solo ve y modifica reservas de las propiedades que se le
 * asignaron. Cada prueba intenta salirse de ese límite por otro camino.
 */

const actor = vi.hoisted(() => ({ orgId: "", userId: "", role: "OWNER" as string }));

vi.mock("@/lib/auth/session", async () => {
  const { createOrgDb } = await import("@/lib/db/scoped");
  const context = () => ({
    session: { sub: actor.userId, role: actor.role, orgId: actor.orgId },
    orgId: actor.orgId,
    db: createOrgDb(actor.orgId),
  });
  return {
    // Igual que la real: rechaza a quien no tenga uno de los roles pedidos.
    requireOrgUserAction: async (roles?: string[]) => {
      if (roles && !roles.includes(actor.role)) throw new Error("No tienes permiso para realizar esta acción.");
      return context();
    },
  };
});
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
  headers: async () => new Headers({ host: "localhost:3000" }),
}));

// Sin SMTP: el acceso de una invitación se entrega como contraseña temporal.
delete process.env.SMTP_HOST;

const { createBooking, updateBooking, cancelBooking } = await import("@/server/actions/bookings");
const { inviteStaff, setCaptureBuildings, changeStaffRole } = await import("@/server/actions/team");
const { getBookings } = await import("@/lib/queries/bookings");
const { getCalendarData } = await import("@/lib/queries/calendar");
const { getBookableUnits } = await import("@/lib/queries/properties");
const { captureBuildingIds } = await import("@/lib/capture");

let a: OrgFixture;
let b: OrgFixture;
let other: { buildingId: string; unitId: string; bookingId: string };
let captureId: string;

function form(fields: Record<string, string | string[]>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    for (const v of Array.isArray(value) ? value : [value]) data.append(key, v);
  }
  return data;
}

const stay = (unitId: string, guestName: string, checkIn: string, checkOut: string) =>
  form({ unitId, guestName, checkIn, checkOut, guests: "2", totalAmount: "1000", source: "MANUAL" });

const asCapture = () => {
  actor.userId = captureId;
  actor.role = "CAPTURE";
};
const asOwner = () => {
  actor.userId = a.owner.id;
  actor.role = "OWNER";
};

beforeAll(async () => {
  a = await createOrgFixture("captura-a");
  b = await createOrgFixture("captura-b");
  actor.orgId = a.organizationId;
  await prisma.organization.update({ where: { id: a.organizationId }, data: { plan: "PREMIUM" } });

  // Otra propiedad de la MISMA arrendadora, fuera del alcance del capturista.
  const building = await prisma.building.create({
    data: { organizationId: a.organizationId, name: "Fuera de alcance", address: "Calle 9" },
  });
  const unit = await prisma.unit.create({
    data: { organizationId: a.organizationId, buildingId: building.id, code: "F-1", baseRent: 3000 },
  });
  const booking = await prisma.booking.create({
    data: {
      organizationId: a.organizationId,
      unitId: unit.id,
      guestName: "Huésped Ajeno",
      checkIn: new Date("2031-05-01T12:00:00"),
      checkOut: new Date("2031-05-05T12:00:00"),
      totalAmount: 500,
    },
  });
  other = { buildingId: building.id, unitId: unit.id, bookingId: booking.id };

  // El capturista se da de alta como lo haría el dueño desde Equipo.
  asOwner();
  const email = `captura-${randomUUID().slice(0, 8)}@test.mx`;
  const invited = await inviteStaff(
    {},
    form({ name: "Natalia Captura", email, role: "CAPTURE", buildingIds: [a.building.id] }),
  );
  expect(invited.ok).toBe(true);
  captureId = (await prisma.user.findUniqueOrThrow({ where: { email } })).id;
});

afterAll(async () => {
  await deleteOrgFixtures(a, b);
});

describe("alta y propiedades de Captura", () => {
  it("queda con la propiedad elegida", async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: captureId } });
    expect(user.role).toBe("CAPTURE");
    expect(await captureBuildingIds(createOrgDb(a.organizationId), captureId)).toEqual([a.building.id]);
  });

  it("exige al menos una propiedad y rechaza las de otra arrendadora", async () => {
    asOwner();
    const email = () => `c-${randomUUID().slice(0, 8)}@test.mx`;
    expect(await inviteStaff({}, form({ name: "Sin Propiedad", email: email(), role: "CAPTURE" }))).toEqual({
      error: "Elige al menos una propiedad para Captura.",
    });
    expect(
      await inviteStaff({}, form({ name: "Ajena", email: email(), role: "CAPTURE", buildingIds: [b.building.id] })),
    ).toEqual({ error: "Alguna de las propiedades no existe." });
    expect(await setCaptureBuildings(captureId, form({ buildingIds: [b.building.id] }))).toHaveProperty("error");
    expect(await captureBuildingIds(createOrgDb(a.organizationId), captureId)).toEqual([a.building.id]);
  });

  it("Captura no puede asignarse propiedades a sí misma", async () => {
    asCapture();
    await expect(setCaptureBuildings(captureId, form({ buildingIds: [other.buildingId] }))).rejects.toThrow(
      /permiso/,
    );
    expect(await captureBuildingIds(createOrgDb(a.organizationId), captureId)).toEqual([a.building.id]);
  });
});

describe("reservas de Captura", () => {
  it("registra en su propiedad", async () => {
    asCapture();
    expect(await createBooking({}, stay(a.freeUnit.id, "Huésped Propio", "2031-03-01", "2031-03-05"))).toEqual({
      ok: true,
    });
  });

  it("no registra en otra propiedad ni en otra arrendadora", async () => {
    asCapture();
    expect(await createBooking({}, stay(other.unitId, "Intruso", "2031-06-01", "2031-06-03"))).toEqual({
      error: "No se encontró la unidad.",
    });
    expect(await createBooking({}, stay(b.freeUnit.id, "Intruso", "2031-06-01", "2031-06-03"))).toEqual({
      error: "No se encontró la unidad.",
    });
    expect(await prisma.booking.count({ where: { guestName: "Intruso" } })).toBe(0);
  });

  it("no edita, mueve ni cancela reservas ajenas", async () => {
    asCapture();
    expect(await updateBooking(other.bookingId, stay(other.unitId, "Cambio", "2031-05-01", "2031-05-06"))).toEqual({
      error: "No se encontró la reserva.",
    });
    // Ni moviéndola a su propia propiedad.
    expect(await updateBooking(other.bookingId, stay(a.freeUnit.id, "Cambio", "2031-05-01", "2031-05-06"))).toEqual({
      error: "No se encontró la reserva.",
    });
    expect(await cancelBooking(other.bookingId)).toEqual({ error: "No se encontró la reserva." });

    // Ni sacar una suya hacia otra propiedad.
    const own = await prisma.booking.findFirstOrThrow({ where: { guestName: "Huésped Propio" } });
    expect(await updateBooking(own.id, stay(other.unitId, "Huésped Propio", "2031-03-01", "2031-03-05"))).toEqual({
      error: "No se encontró la unidad.",
    });

    const untouched = await prisma.booking.findUniqueOrThrow({ where: { id: other.bookingId } });
    expect(untouched).toMatchObject({ guestName: "Huésped Ajeno", status: "CONFIRMED", unitId: other.unitId });
  });

  it("corrige y cancela las suyas", async () => {
    asCapture();
    const own = await prisma.booking.findFirstOrThrow({ where: { guestName: "Huésped Propio" } });
    expect(await updateBooking(own.id, stay(a.freeUnit.id, "Huésped Propio", "2031-03-01", "2031-03-07"))).toEqual({
      ok: true,
    });
    expect(await cancelBooking(own.id)).toEqual({ ok: true });
  });

  it("al cambiar sus propiedades, pierde las anteriores", async () => {
    asOwner();
    expect(await setCaptureBuildings(captureId, form({ buildingIds: [other.buildingId] }))).toEqual({ ok: true });
    asCapture();
    expect(await createBooking({}, stay(a.freeUnit.id, "Ya No", "2031-07-01", "2031-07-03"))).toEqual({
      error: "No se encontró la unidad.",
    });
    asOwner();
    expect(await setCaptureBuildings(captureId, form({ buildingIds: [a.building.id] }))).toEqual({ ok: true });
  });
});

describe("lo que ve Captura", () => {
  const db = () => createOrgDb(a.organizationId);

  it("la lista, las unidades y el calendario solo traen sus propiedades", async () => {
    const allowed = [a.building.id];

    const list = await getBookings(db(), { buildingIds: allowed, from: "2000-01-01", status: "ALL" });
    expect(list.every((r) => r.buildingId === a.building.id)).toBe(true);
    // Ni pidiendo la ajena por id.
    expect(await getBookings(db(), { buildingIds: allowed, id: other.bookingId })).toEqual([]);
    // Ni combinando con el filtro de otra propiedad.
    expect(await getBookings(db(), { buildingIds: allowed, buildingId: other.buildingId, from: "2000-01-01" })).toEqual([]);

    const units = await getBookableUnits(db(), allowed);
    expect(units.map((u) => u.id).sort()).toEqual([a.unit.id, a.freeUnit.id].sort());

    const calendar = await getCalendarData(db(), "2026-09", undefined, undefined, {
      buildingIds: allowed,
      privateLeases: true,
    });
    expect(calendar.buildings.map((x) => x.id)).toEqual([a.building.id]);
    expect(calendar.rows.every((r) => r.buildingId === a.building.id)).toBe(true);
    // Con otra propiedad elegida no aparece nada de ella.
    const forced = await getCalendarData(db(), "2026-09", other.buildingId, undefined, { buildingIds: allowed });
    expect(forced.rows).toEqual([]);
  });

  it("los contratos se ven como ocupación, sin nombre ni renta del inquilino", async () => {
    const calendar = await getCalendarData(db(), "2026-09", undefined, undefined, {
      buildingIds: [a.building.id],
      privateLeases: true,
    });
    const leaseBars = calendar.rows.flatMap((r) => r.bars).filter((bar) => bar.kind === "LEASE");
    expect(leaseBars.length).toBeGreaterThan(0);
    for (const bar of leaseBars) {
      expect(bar.label).toBe("Contrato de largo plazo");
      expect(bar.detail).not.toMatch(/\$|Inquilino/);
      expect(bar.href).toBe("");
    }
    expect(JSON.stringify(calendar)).not.toContain(a.tenant.name);
  });
});

describe("cambio de rol", () => {
  it("al dejar de ser Captura se borran sus propiedades y se cierra su sesión", async () => {
    asOwner();
    await prisma.user.update({ where: { id: captureId }, data: { currentSessionId: "sesion-abierta" } });
    expect(await changeStaffRole(captureId, "VIEWER")).toEqual({ ok: true });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: captureId } });
    expect(user).toMatchObject({ role: "VIEWER", currentSessionId: null });
    expect(await prisma.buildingAccess.count({ where: { userId: captureId } })).toBe(0);
  });
});
