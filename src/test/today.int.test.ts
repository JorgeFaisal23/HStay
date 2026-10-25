import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createOrgDb } from "@/lib/db/scoped";
import { getTodayData } from "@/lib/queries/today";
import { createOrgFixture, deleteOrgFixtures, type OrgFixture } from "@/test/fixtures";

/** "Hoy" sale de los datos de la arrendadora y se actualiza solo al resolver. */

const now = new Date(2026, 9, 15, 10); // 15 oct 2026

let a: OrgFixture;
let b: OrgFixture;

beforeAll(async () => {
  a = await createOrgFixture("hoy-a");
  b = await createOrgFixture("hoy-b");
  for (const fixture of [a, b]) {
    await prisma.booking.create({
      data: {
        organizationId: fixture.organizationId,
        unitId: fixture.freeUnit.id,
        guestName: "Rita Huésped",
        checkIn: new Date(2026, 9, 16, 12),
        checkOut: new Date(2026, 9, 18, 12),
        totalAmount: 3000,
      },
    });
  }
});

afterAll(async () => {
  await deleteOrgFixtures(a, b);
});

describe("Hoy", () => {
  it("arma los asuntos de la arrendadora y solo los suyos", async () => {
    const { items } = await getTodayData(createOrgDb(a.organizationId), now);
    const keys = items.map((item) => item.key);

    expect(keys).toContain(`charge:${a.charge.id}`);
    expect(keys).toContain("generate:2026-10");
    expect(keys).toContain(`services:${a.building.id}:2026-10`);
    expect(keys.filter((key) => key.startsWith("arrival:") || key.startsWith("cleaning:"))).toHaveLength(2);
    // El cargo pagado de agosto no es asunto.
    expect(keys).not.toContain(`charge:${a.paidCharge.id}`);

    // Nada de la otra arrendadora.
    expect(keys).not.toContain(`charge:${b.charge.id}`);
    expect(keys).not.toContain(`services:${b.building.id}:2026-10`);
    expect(items.every((item) => !item.place.includes("Edificio hoy-b"))).toBe(true);

    const overdue = items.find((item) => item.key === `charge:${a.charge.id}`);
    expect(overdue).toMatchObject({
      place: "Edificio hoy-a · Unidad 101",
      person: { role: "Inquilino", name: "Inquilino hoy-a" },
      amount: 5000,
    });
  });

  it("al resolver el dato de origen, el asunto desaparece", async () => {
    const db = createOrgDb(a.organizationId);
    await prisma.rentCharge.update({
      where: { id: a.charge.id },
      data: { paidAmount: 5000, status: "PAID" },
    });
    await prisma.rentCharge.create({
      data: {
        organizationId: a.organizationId,
        leaseId: a.lease.id,
        period: "2026-10",
        dueDate: new Date(2026, 9, 20, 12),
        amount: 5000,
      },
    });
    await prisma.booking.updateMany({
      where: { organizationId: a.organizationId, guestName: "Rita Huésped" },
      data: { status: "CANCELLED" },
    });

    const keys = (await getTodayData(db, now)).items.map((item) => item.key);
    expect(keys).not.toContain(`charge:${a.charge.id}`);
    expect(keys).not.toContain("generate:2026-10");
    expect(keys.some((key) => key.startsWith("arrival:") || key.startsWith("cleaning:"))).toBe(false);
  });
});
