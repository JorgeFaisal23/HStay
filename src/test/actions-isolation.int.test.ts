import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createOrgFixture, deleteOrgFixtures, type OrgFixture } from "@/test/fixtures";

/**
 * Cada server action invocada por un usuario de la arrendadora A con ids de la
 * arrendadora B debe responder con error y dejar B intacta. Es la prueba de
 * que nadie puede leer ni modificar datos ajenos llamando a las acciones
 * directamente (las server actions son endpoints públicos).
 */

const actor = vi.hoisted(() => ({ orgId: "", userId: "" }));

vi.mock("@/lib/auth/session", async () => {
  const { createOrgDb } = await import("@/lib/db/scoped");
  const context = () => ({
    session: {
      sub: actor.userId,
      email: "owner@test.mx",
      name: "Dueño A",
      role: "OWNER" as const,
      sessionId: "s",
      orgId: actor.orgId,
      orgSlug: "a",
    },
    orgId: actor.orgId,
    db: createOrgDb(actor.orgId),
  });
  return {
    requireOrgUserAction: async () => context(),
    requireOrgUser: async () => context(),
  };
});
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT ${path}`);
  },
}));

const { registerPayment, markChargeUnpaid, deletePayment } = await import("@/server/actions/payments");
const { createUnit, updateUnit, updateServiceAccount, createUnitServiceAccount } =
  await import("@/server/actions/properties");
const { setServiceAmount } = await import("@/server/actions/services");
const { createTenant, updateTenant, setTenantActive, resetTenantAccess } = await import(
  "@/server/actions/tenants",
);
const { changeStaffRole, setStaffActive, resetStaffAccess } = await import("@/server/actions/team");
const { syncAirbnbConnection, syncAllConnections } = await import("@/server/actions/integrations");
const { updateBrand } = await import("@/server/actions/brand");

let a: OrgFixture;
let b: OrgFixture;

/** Foto de las filas de B que las acciones podrían tocar. */
async function snapshotB() {
  const [charge, unit, account, serviceCharges, tenant, owner, connection, org, buildings, units, users] =
    await Promise.all([
      prisma.rentCharge.findUniqueOrThrow({ where: { id: b.charge.id }, include: { payments: true } }),
      prisma.unit.findUniqueOrThrow({ where: { id: b.unit.id } }),
      prisma.serviceAccount.findUniqueOrThrow({ where: { id: b.account.id } }),
      prisma.serviceCharge.findMany({ where: { serviceAccountId: b.account.id } }),
      prisma.user.findUniqueOrThrow({ where: { id: b.tenant.id } }),
      prisma.user.findUniqueOrThrow({ where: { id: b.owner.id } }),
      prisma.airbnbConnection.findUniqueOrThrow({ where: { id: b.connection.id } }),
      prisma.organization.findUniqueOrThrow({ where: { id: b.organizationId } }),
      prisma.building.count({ where: { organizationId: b.organizationId } }),
      prisma.unit.count({ where: { organizationId: b.organizationId } }),
      prisma.user.count({ where: { organizationId: b.organizationId } }),
    ]);
  return { charge, unit, account, serviceCharges, tenant, owner, connection, org, buildings, units, users };
}

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const unitFields = (overrides: Record<string, string>) =>
  form({
    code: "999",
    type: "ROOM",
    status: "AVAILABLE",
    bedrooms: "1",
    bathrooms: "1",
    baseRent: "1000",
    ...overrides,
  });

let before: Awaited<ReturnType<typeof snapshotB>>;

beforeAll(async () => {
  a = await createOrgFixture("a");
  b = await createOrgFixture("b");
  actor.orgId = a.organizationId;
  actor.userId = a.owner.id;
  before = await snapshotB();
});

afterAll(async () => {
  await deleteOrgFixtures(a, b);
});

describe("server actions con ids de otra arrendadora", () => {
  it("cobros", async () => {
    expect(await registerPayment({ chargeId: b.charge.id, amount: 100, method: "Efectivo" })).toHaveProperty("error");
    expect(await deletePayment(b.payment.id)).toHaveProperty("error");
    expect(await markChargeUnpaid(b.charge.id)).toHaveProperty("error");
  });

  it("unidades y servicios", async () => {
    expect(await createUnit({}, unitFields({ buildingId: b.building.id }))).toHaveProperty("error");
    expect(
      await updateUnit({}, unitFields({ unitId: b.unit.id, buildingId: a.building.id })),
    ).toHaveProperty("error");
    // Mover una unidad propia a un edificio ajeno tampoco.
    expect(
      await updateUnit({}, unitFields({ unitId: a.unit.id, buildingId: b.building.id })),
    ).toHaveProperty("error");
    expect(
      await updateServiceAccount({}, form({ accountId: b.account.id, providerName: "X" })),
    ).toHaveProperty("error");
    expect(
      await createUnitServiceAccount({}, form({ unitId: b.unit.id, type: "INTERNET" })),
    ).toHaveProperty("error");
  });

  it("captura de servicios", async () => {
    expect(
      await setServiceAmount({ accountId: b.account.id, period: "2026-09", amount: 1 }),
    ).toHaveProperty("error");
    expect(
      await setServiceAmount({ accountId: b.account.id, period: "2026-08", amount: null }),
    ).toHaveProperty("error");
  });

  it("inquilinos", async () => {
    expect(
      await updateTenant({}, form({ tenantId: b.tenant.id, name: "Hackeado", email: "hack@test.mx" })),
    ).toHaveProperty("error");
    expect(
      await createTenant(
        {},
        form({
          name: "Nuevo Inquilino",
          email: `nuevo-${Date.now()}@test.mx`,
          password: "contrasena-segura",
          unitId: b.freeUnit.id,
          startDate: "2026-11-01",
          endDate: "2027-11-01",
          rentAmount: "1000",
          paymentDay: "1",
        }),
      ),
    ).toHaveProperty("error");
    // Un correo de otra arrendadora no se puede reutilizar (es único global).
    expect(
      await createTenant({}, form({ name: "Duplicado", email: b.tenant.email, password: "contrasena-segura" })),
    ).toHaveProperty("error");
  });

  it("acceso de inquilinos y equipo", async () => {
    expect(await setTenantActive(b.tenant.id, false)).toHaveProperty("error");
    expect(await resetTenantAccess(b.tenant.id)).toHaveProperty("error");
    expect(await changeStaffRole(b.owner.id, "VIEWER")).toHaveProperty("error");
    expect(await setStaffActive(b.owner.id, false)).toHaveProperty("error");
    expect(await resetStaffAccess(b.owner.id)).toHaveProperty("error");
  });

  it("integraciones", async () => {
    expect(await syncAirbnbConnection(b.connection.id)).toHaveProperty("error");
    await syncAllConnections();
  });

  it("marca", async () => {
    const result = await updateBrand(
      {},
      form({ brandName: "Marca A nueva", primaryColor: "#123456", radius: "SOFT", fontFamily: "Inter" }),
    );
    expect(result).toEqual({ ok: true });
    const own = await prisma.organization.findUniqueOrThrow({ where: { id: a.organizationId } });
    expect(own.brandName).toBe("Marca A nueva");
  });

  it("la arrendadora B quedó intacta", async () => {
    expect(await snapshotB()).toEqual(before);
  });
});
