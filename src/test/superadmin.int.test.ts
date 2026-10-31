import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE, signSession, type SessionPayload } from "@/lib/auth/jwt";
import { createOrgFixture, deleteOrgFixtures, type OrgFixture } from "@/test/fixtures";

/**
 * Acciones de plataforma con la sesión real (JWT firmado + validación en la
 * base). Solo cambia de dónde salen las cookies: aquí no hay petición HTTP.
 */

const jar = vi.hoisted(() => ({ token: "" }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "rentas_session" && jar.token ? { value: jar.token } : undefined),
    set: () => {},
    delete: () => {},
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const {
  createOrganization,
  setOrganizationPlan,
  setOrganizationStatus,
  updateOrganization,
  setUserQuota,
  supportResetAccess,
  supportSetUserActive,
  supportForceLogout,
  supportUnlockLogin,
} = await import("@/server/superadmin/actions");
const { searchUsers } = await import("@/server/superadmin/queries");

let fixture: OrgFixture;
let superId: string;
const createdOrgIds: string[] = [];

async function actAs(user: { id: string; email: string; role: SessionPayload["role"]; organizationId: string | null; slug: string | null }) {
  const sessionId = randomUUID();
  await prisma.user.update({ where: { id: user.id }, data: { currentSessionId: sessionId } });
  jar.token = await signSession({
    sub: user.id,
    email: user.email,
    name: "Prueba",
    role: user.role,
    sessionId,
    orgId: user.organizationId,
    orgSlug: user.slug,
  });
}

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

beforeAll(async () => {
  fixture = await createOrgFixture("plataforma");
  const superadmin = await prisma.user.create({
    data: {
      email: `super-${randomUUID().slice(0, 8)}@test.mx`,
      name: "Super",
      role: "SUPERADMIN",
      passwordHash: "x",
    },
  });
  superId = superadmin.id;
});

afterAll(async () => {
  const created = await prisma.organization.findMany({
    where: { id: { in: createdOrgIds } },
    select: { id: true },
  });
  await deleteOrgFixtures(
    fixture,
    ...created.map((org) => ({ organizationId: org.id }) as OrgFixture),
  );
  await prisma.user.delete({ where: { id: superId } });
});

describe("acciones de plataforma", () => {
  it("rechazan a un dueño de arrendadora", async () => {
    await actAs({
      id: fixture.owner.id,
      email: fixture.owner.email,
      role: "OWNER",
      organizationId: fixture.organizationId,
      slug: fixture.org.slug,
    });
    await expect(setOrganizationPlan(fixture.organizationId, "PREMIUM")).rejects.toThrow(/permiso/);
    await expect(setOrganizationStatus(fixture.organizationId, "SUSPENDED")).rejects.toThrow(/permiso/);
    await expect(setUserQuota(fixture.organizationId, 500)).rejects.toThrow(/permiso/);
    await expect(supportResetAccess(fixture.tenant.id)).rejects.toThrow(/permiso/);
    await expect(supportSetUserActive(fixture.tenant.id, false)).rejects.toThrow(/permiso/);
    await expect(supportForceLogout(fixture.tenant.id)).rejects.toThrow(/permiso/);
    await expect(supportUnlockLogin(fixture.tenant.id)).rejects.toThrow(/permiso/);

    const org = await prisma.organization.findUniqueOrThrow({ where: { id: fixture.organizationId } });
    expect(org.plan).toBe("FREE");
    expect(org.status).toBe("ACTIVE");
    expect(org.maxUsers).toBe(100);
  });

  it("el superadministrador crea una arrendadora con su dueño", async () => {
    await actAs({ id: superId, email: "super@test.mx", role: "SUPERADMIN", organizationId: null, slug: null });
    const slug = `nueva-${randomUUID().slice(0, 6)}`;
    const email = `dueno-${slug}@test.mx`;

    const result = await createOrganization(
      {},
      form({ name: "Nueva Arrendadora", slug, plan: "PREMIUM", maxUsers: "4", ownerName: "Dueña Nueva", ownerEmail: email }),
    );
    expect(result.ok).toBe(true);
    createdOrgIds.push(result.orgId!);
    const created = await prisma.organization.findUniqueOrThrow({ where: { id: result.orgId } });
    expect(created.maxUsers).toBe(4);

    const owner = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(owner.role).toBe("OWNER");
    expect(owner.organizationId).toBe(result.orgId);
    // Sin SMTP en pruebas: el acceso llega como contraseña temporal.
    expect(result.delivery?.method).toBe("password");
    const temp = result.delivery?.method === "password" ? result.delivery.tempPassword : "";
    expect(await bcrypt.compare(temp, owner.passwordHash)).toBe(true);
    expect(owner.mustChangePassword).toBe(true);

    // Sin usuarios contratados (el dueño necesita uno), slug o correo ya usados.
    expect(
      await createOrganization({}, form({ name: "Otra", slug: `${slug}-c`, plan: "FREE", maxUsers: "0", ownerName: "Otra Persona", ownerEmail: `z-${email}` })),
    ).toHaveProperty("error");
    expect(
      await createOrganization({}, form({ name: "Otra", slug, plan: "FREE", maxUsers: "1", ownerName: "Otra Persona", ownerEmail: `x-${email}` })),
    ).toHaveProperty("error");
    expect(
      await createOrganization({}, form({ name: "Otra", slug: `${slug}-b`, plan: "FREE", maxUsers: "1", ownerName: "Otra Persona", ownerEmail: email })),
    ).toHaveProperty("error");
    expect(
      await createOrganization({}, form({ name: "Otra", slug: "superadmin", plan: "FREE", maxUsers: "1", ownerName: "Otra Persona", ownerEmail: `y-${email}` })),
    ).toHaveProperty("error");
  });

  it("cambia el plan y el slug", async () => {
    await actAs({ id: superId, email: "super@test.mx", role: "SUPERADMIN", organizationId: null, slug: null });
    expect(await setOrganizationPlan(fixture.organizationId, "PREMIUM")).toEqual({ ok: true });

    const newSlug = `renombrada-${randomUUID().slice(0, 6)}`;
    expect(
      await updateOrganization({}, form({ orgId: fixture.organizationId, name: "Renombrada", slug: newSlug })),
    ).toEqual({ ok: true });

    const org = await prisma.organization.findUniqueOrThrow({ where: { id: fixture.organizationId } });
    expect(org.plan).toBe("PREMIUM");
    expect(org.slug).toBe(newSlug);
  });

  it("suspender cierra las sesiones de la arrendadora", async () => {
    await prisma.user.update({ where: { id: fixture.tenant.id }, data: { currentSessionId: "viva" } });
    await actAs({ id: superId, email: "super@test.mx", role: "SUPERADMIN", organizationId: null, slug: null });

    expect(await setOrganizationStatus(fixture.organizationId, "SUSPENDED")).toEqual({ ok: true });
    const tenant = await prisma.user.findUniqueOrThrow({ where: { id: fixture.tenant.id } });
    expect(tenant.currentSessionId).toBeNull();

    expect(await setOrganizationStatus(fixture.organizationId, "ACTIVE")).toEqual({ ok: true });
  });

  it("restablece el acceso de cualquier cuenta de arrendadora", async () => {
    await actAs({ id: superId, email: "super@test.mx", role: "SUPERADMIN", organizationId: null, slug: null });
    expect(await supportResetAccess(superId)).toHaveProperty("error");

    for (const user of [fixture.owner, fixture.tenant]) {
      const result = await supportResetAccess(user.id);
      expect(result.ok).toBe(true);
      const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      const temp = result.delivery?.method === "password" ? result.delivery.tempPassword : "";
      expect(await bcrypt.compare(temp, updated.passwordHash)).toBe(true);
      expect(updated.mustChangePassword).toBe(true);
      expect(updated.currentSessionId).toBeNull();
    }
  });
});

describe("cupo de equipo y soporte de cuentas", () => {
  let adminId: string;

  beforeAll(async () => {
    const admin = await prisma.user.create({
      data: {
        organizationId: fixture.organizationId,
        email: `admin-${randomUUID().slice(0, 8)}@test.mx`,
        name: "Administrativa Prueba",
        role: "ADMIN",
        passwordHash: "x",
      },
    });
    adminId = admin.id;
  });

  async function lastLog() {
    return prisma.auditLog.findFirstOrThrow({
      where: { organizationId: fixture.organizationId },
      orderBy: { createdAt: "desc" },
    });
  }

  it("cambia los usuarios contratados, con rango válido y bitácora", async () => {
    await actAs({ id: superId, email: "super@test.mx", role: "SUPERADMIN", organizationId: null, slug: null });
    expect(await setUserQuota(fixture.organizationId, 0)).toHaveProperty("error");
    expect(await setUserQuota(fixture.organizationId, 1.5)).toHaveProperty("error");
    expect(await setUserQuota(fixture.organizationId, 10_001)).toHaveProperty("error");
    expect(await setUserQuota("no-existe", 3)).toHaveProperty("error");

    expect(await setUserQuota(fixture.organizationId, 7)).toEqual({ ok: true });
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: fixture.organizationId } });
    expect(org.maxUsers).toBe(7);
    const log = await lastLog();
    expect(log.userId).toBe(superId);
    expect(log.detail).toBe("100 → 7");

    await setUserQuota(fixture.organizationId, 100);
  });

  it("desactiva y reactiva respetando el cupo, también al dueño", async () => {
    await actAs({ id: superId, email: "super@test.mx", role: "SUPERADMIN", organizationId: null, slug: null });
    await prisma.user.update({ where: { id: adminId }, data: { currentSessionId: "viva" } });

    expect(await supportSetUserActive(adminId, false)).toEqual({ ok: true });
    let admin = await prisma.user.findUniqueOrThrow({ where: { id: adminId } });
    expect(admin.active).toBe(false);
    expect(admin.currentSessionId).toBeNull();
    const log = await lastLog();
    expect(log).toMatchObject({ userId: superId, entity: "User", entityId: adminId });

    // Con todo ocupado (dueño e inquilino) no se puede reactivar.
    await setUserQuota(fixture.organizationId, 2);
    expect(await supportSetUserActive(adminId, true)).toHaveProperty("error");
    await setUserQuota(fixture.organizationId, 3);
    expect(await supportSetUserActive(adminId, true)).toEqual({ ok: true });
    admin = await prisma.user.findUniqueOrThrow({ where: { id: adminId } });
    expect(admin.active).toBe(true);

    // El dueño también se desactiva, y también ocupa lugar al reactivarlo.
    expect(await supportSetUserActive(fixture.owner.id, false)).toEqual({ ok: true });
    await setUserQuota(fixture.organizationId, 2);
    expect(await supportSetUserActive(fixture.owner.id, true)).toHaveProperty("error");
    await setUserQuota(fixture.organizationId, 3);
    expect(await supportSetUserActive(fixture.owner.id, true)).toEqual({ ok: true });
    await setUserQuota(fixture.organizationId, 100);
  });

  it("nunca actúa sobre un superadministrador", async () => {
    await actAs({ id: superId, email: "super@test.mx", role: "SUPERADMIN", organizationId: null, slug: null });
    expect(await supportSetUserActive(superId, false)).toHaveProperty("error");
    expect(await supportForceLogout(superId)).toHaveProperty("error");
    expect(await supportUnlockLogin(superId)).toHaveProperty("error");
    const self = await prisma.user.findUniqueOrThrow({ where: { id: superId } });
    expect(self.active).toBe(true);
  });

  it("cierra la sesión y desbloquea intentos de acceso", async () => {
    await prisma.user.update({ where: { id: fixture.tenant.id }, data: { currentSessionId: "viva" } });
    const email = fixture.tenant.email.toLowerCase();
    const lockedUntil = new Date(Date.now() + 10 * 60_000);
    await prisma.loginThrottle.createMany({
      data: [
        { key: `email:${email}`, failures: 5, lockedUntil },
        { key: `reset:${email}`, failures: 3, lockedUntil },
      ],
    });
    await actAs({ id: superId, email: "super@test.mx", role: "SUPERADMIN", organizationId: null, slug: null });

    const [found] = await searchUsers({ q: email });
    expect(found.lockedUntil).not.toBeNull();
    expect(found.hasSession).toBe(true);

    expect(await supportForceLogout(fixture.tenant.id)).toEqual({ ok: true });
    const tenant = await prisma.user.findUniqueOrThrow({ where: { id: fixture.tenant.id } });
    expect(tenant.currentSessionId).toBeNull();

    expect(await supportUnlockLogin(fixture.tenant.id)).toEqual({ ok: true });
    expect(
      await prisma.loginThrottle.count({ where: { key: { in: [`email:${email}`, `reset:${email}`] } } }),
    ).toBe(0);
    expect((await lastLog()).action).toMatch(/desbloqueo/);
  });

  it("la búsqueda solo trae identidad de cuenta y omite superadmins", async () => {
    const results = await searchUsers({ orgId: fixture.organizationId });
    expect(results.map((u) => u.id).sort()).toEqual(
      [fixture.owner.id, fixture.tenant.id, adminId].sort(),
    );
    for (const user of results) {
      for (const key of ["phone", "documentId", "notes", "passwordHash", "currentSessionId", "leases"]) {
        expect(user).not.toHaveProperty(key);
      }
    }
    expect(await searchUsers({ orgId: fixture.organizationId, role: "TENANT" })).toHaveLength(1);
    expect(await searchUsers({ q: "super@" })).toEqual(
      expect.not.arrayContaining([expect.objectContaining({ id: superId })]),
    );
  });
});

// La cookie de sesión se llama así en jwt.ts; si cambia, el mock de arriba
// debe cambiar con ella.
it("el mock de cookies usa el nombre real de la cookie", () => {
  expect(SESSION_COOKIE).toBe("rentas_session");
});
