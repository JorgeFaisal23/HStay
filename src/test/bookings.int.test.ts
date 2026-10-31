import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createOrgFixture, deleteOrgFixtures, type OrgFixture } from "@/test/fixtures";

/** Edición de reservas manuales: traslapes, limpieza que se mueve y aislamiento. */

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

const { createBooking, updateBooking } = await import("@/server/actions/bookings");

let a: OrgFixture;
let b: OrgFixture;

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const stay = (unitId: string, guestName: string, checkIn: string, checkOut: string, extra: Record<string, string> = {}) =>
  form({ unitId, guestName, checkIn, checkOut, guests: "2", totalAmount: "50000", source: "MANUAL", ...extra });

async function bookingOf(guestName: string) {
  return prisma.booking.findFirstOrThrow({ where: { organizationId: a.organizationId, guestName } });
}

beforeAll(async () => {
  a = await createOrgFixture("reservas-a");
  b = await createOrgFixture("reservas-b");
  actor.orgId = a.organizationId;
  actor.userId = a.owner.id;
});

afterAll(async () => {
  await deleteOrgFixtures(a, b);
});

describe("editar reservas", () => {
  it("una estancia larga sin correo se registra y se corrige sin chocar consigo misma", async () => {
    // El caso de Moonlight: dos meses, sin correo.
    expect(await createBooking({}, stay(a.freeUnit.id, "Larga Estancia", "2031-02-01", "2031-03-31"))).toEqual({ ok: true });
    const booking = await bookingOf("Larga Estancia");
    expect(booking.guestEmail).toBeNull();

    // Recorrer un día la salida no debe chocar con la propia reserva.
    expect(
      await updateBooking(
        booking.id,
        stay(a.freeUnit.id, "Larga Estancia", "2031-02-01", "2031-04-01", { guests: "3", guestPhone: "999 111 2222" }),
      ),
    ).toEqual({ ok: true });
    const updated = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(updated).toMatchObject({ guests: 3, guestPhone: "999 111 2222" });
    expect(updated.checkOut.getMonth()).toBe(3); // abril
  });

  it("rechaza mover una reserva encima de otra o de un contrato", async () => {
    expect(await createBooking({}, stay(a.freeUnit.id, "Abril Corta", "2031-04-01", "2031-04-05"))).toEqual({ ok: true });
    const corta = await bookingOf("Abril Corta");

    expect(
      await updateBooking(corta.id, stay(a.freeUnit.id, "Abril Corta", "2031-03-30", "2031-04-05")),
    ).toEqual({ error: expect.stringMatching(/Se cruza con la reserva de Larga Estancia/) });

    // La unidad del fixture está rentada en 2026.
    expect(
      await updateBooking(corta.id, stay(a.unit.id, "Abril Corta", "2026-11-01", "2026-11-03")),
    ).toEqual({ error: expect.stringMatching(/rentada/) });

    // Nada cambió.
    const same = await prisma.booking.findUniqueOrThrow({ where: { id: corta.id } });
    expect(same.unitId).toBe(a.freeUnit.id);
    expect(same.checkIn.getDate()).toBe(1);
  });

  it("mueve la limpieza pendiente con la nueva salida y la nueva unidad", async () => {
    const corta = await bookingOf("Abril Corta");
    const task = await prisma.task.create({
      data: {
        organizationId: a.organizationId,
        kind: "CLEANING",
        unitId: a.freeUnit.id,
        bookingId: corta.id,
        title: "Limpieza tras la salida de Abril Corta",
        dueDate: corta.checkOut,
      },
    });

    // Se cambia a otra unidad libre de la misma arrendadora.
    const other = await prisma.unit.create({
      data: { organizationId: a.organizationId, buildingId: a.building.id, code: "103", baseRent: 5000 },
    });
    expect(
      await updateBooking(corta.id, stay(other.id, "Abril Corregida", "2031-04-01", "2031-04-08")),
    ).toEqual({ ok: true });

    const moved = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(moved.unitId).toBe(other.id);
    expect(moved.dueDate?.getDate()).toBe(8);
    expect(moved.title).toMatch(/Abril Corregida/);
  });

  it("no edita reservas de Airbnb, canceladas ni de otra arrendadora", async () => {
    const airbnb = await prisma.booking.create({
      data: {
        organizationId: a.organizationId,
        unitId: a.freeUnit.id,
        source: "AIRBNB",
        guestName: "Desde Airbnb",
        checkIn: new Date("2032-05-01T12:00:00"),
        checkOut: new Date("2032-05-03T12:00:00"),
        totalAmount: 1,
      },
    });
    expect(
      await updateBooking(airbnb.id, stay(a.freeUnit.id, "Cambio", "2032-05-01", "2032-05-04")),
    ).toEqual({ error: expect.stringMatching(/Airbnb/) });

    const cancelled = await prisma.booking.create({
      data: {
        organizationId: a.organizationId,
        unitId: a.freeUnit.id,
        status: "CANCELLED",
        guestName: "Ya Cancelada",
        checkIn: new Date("2032-06-01T12:00:00"),
        checkOut: new Date("2032-06-03T12:00:00"),
        totalAmount: 1,
      },
    });
    expect(
      await updateBooking(cancelled.id, stay(a.freeUnit.id, "Ya Cancelada", "2032-06-01", "2032-06-04")),
    ).toEqual({ error: expect.stringMatching(/ya no está confirmada/) });

    // La reserva de otra arrendadora no existe para esta.
    expect(
      await updateBooking(b.booking.id, stay(a.freeUnit.id, "Intruso", "2032-07-01", "2032-07-03")),
    ).toEqual({ error: "No se encontró la reserva." });
    // Ni se puede mover una reserva propia a una unidad de otra arrendadora.
    const larga = await bookingOf("Larga Estancia");
    expect(
      await updateBooking(larga.id, stay(b.freeUnit.id, "Larga Estancia", "2033-01-01", "2033-01-05")),
    ).toEqual({ error: "No se encontró la unidad." });
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: b.booking.id } })).guestName).toBe("Huésped");
  });
});
