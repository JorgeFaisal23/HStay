import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";

/**
 * Una arrendadora con una fila de cada tipo, para probar el aislamiento: las
 * pruebas crean dos y atacan una desde la otra.
 */
export async function createOrgFixture(label: string) {
  const tag = `${label}-${randomUUID().slice(0, 8)}`;

  const org = await prisma.organization.create({
    // Usuarios contratados de sobra: las pruebas que miden el cupo lo bajan.
    data: { slug: tag, name: `Arrendadora ${label}`, brandName: `Marca ${label}`, maxUsers: 100 },
  });
  const organizationId = org.id;

  const owner = await prisma.user.create({
    data: {
      organizationId,
      email: `owner-${tag}@test.mx`,
      name: `Dueño ${label}`,
      role: "OWNER",
      passwordHash: "x",
    },
  });
  const tenant = await prisma.user.create({
    data: {
      organizationId,
      email: `tenant-${tag}@test.mx`,
      name: `Inquilino ${label}`,
      role: "TENANT",
      passwordHash: "x",
    },
  });
  const building = await prisma.building.create({
    data: { organizationId, name: `Edificio ${label}`, address: "Calle 1" },
  });
  const unit = await prisma.unit.create({
    data: { organizationId, buildingId: building.id, code: "101", baseRent: 5000 },
  });
  const freeUnit = await prisma.unit.create({
    data: { organizationId, buildingId: building.id, code: "102", baseRent: 5000 },
  });
  const lease = await prisma.lease.create({
    data: {
      organizationId,
      unitId: unit.id,
      tenantId: tenant.id,
      startDate: new Date("2026-01-01"),
      endDate: new Date("2027-01-01"),
      rentAmount: 5000,
    },
  });
  const charge = await prisma.rentCharge.create({
    data: {
      organizationId,
      leaseId: lease.id,
      period: "2026-09",
      dueDate: new Date("2026-09-05"),
      amount: 5000,
    },
  });
  const paidCharge = await prisma.rentCharge.create({
    data: {
      organizationId,
      leaseId: lease.id,
      period: "2026-08",
      dueDate: new Date("2026-08-05"),
      amount: 5000,
      paidAmount: 5000,
      status: "PAID",
    },
  });
  const payment = await prisma.rentPayment.create({
    data: {
      organizationId,
      rentChargeId: paidCharge.id,
      amount: 5000,
      paidAt: new Date("2026-08-04"),
      method: "Transferencia",
    },
  });
  const account = await prisma.serviceAccount.create({
    data: { organizationId, type: "ELECTRICITY", scope: "UNIT", unitId: unit.id },
  });
  const serviceCharge = await prisma.serviceCharge.create({
    data: { organizationId, serviceAccountId: account.id, period: "2026-08", amount: 700 },
  });
  const connection = await prisma.airbnbConnection.create({
    data: { organizationId, unitId: freeUnit.id, listingName: `Anuncio ${label}` },
  });
  const booking = await prisma.booking.create({
    data: {
      organizationId,
      unitId: freeUnit.id,
      guestName: "Huésped",
      checkIn: new Date("2030-10-10"),
      checkOut: new Date("2030-10-12"),
      totalAmount: 2000,
    },
  });

  return {
    org,
    organizationId,
    owner,
    tenant,
    building,
    unit,
    freeUnit,
    lease,
    charge,
    paidCharge,
    payment,
    account,
    serviceCharge,
    connection,
    booking,
  };
}

export type OrgFixture = Awaited<ReturnType<typeof createOrgFixture>>;

/** Borra solo las filas de las arrendadoras que creó la prueba. */
export async function deleteOrgFixtures(...fixtures: (OrgFixture | undefined)[]) {
  const ids = fixtures.filter((f): f is OrgFixture => f !== undefined).map((f) => f.organizationId);
  if (ids.length === 0) return;
  const where = { organizationId: { in: ids } };
  await prisma.auditLog.deleteMany({ where });
  await prisma.rentPayment.deleteMany({ where });
  await prisma.rentCharge.deleteMany({ where });
  await prisma.serviceCharge.deleteMany({ where });
  await prisma.booking.deleteMany({ where });
  await prisma.airbnbConnection.deleteMany({ where });
  await prisma.lease.deleteMany({ where });
  await prisma.serviceAccount.deleteMany({ where });
  await prisma.unit.deleteMany({ where });
  await prisma.building.deleteMany({ where });
  await prisma.user.deleteMany({ where });
  await prisma.organization.deleteMany({ where: { id: { in: ids } } });
}
