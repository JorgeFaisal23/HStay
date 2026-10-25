import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE, signSession, verifySession } from "@/lib/auth/jwt";
import { createOrgFixture, deleteOrgFixtures, type OrgFixture } from "@/test/fixtures";

/**
 * Cuentas con la sesión real (JWT firmado + validación en la base). Solo se
 * simulan las cookies, los encabezados y la redirección, que en una prueba no
 * vienen de una petición HTTP.
 */

class Redirect extends Error {
  constructor(public path: string) {
    super(`REDIRECT ${path}`);
  }
}

const jar = vi.hoisted(() => ({ cookies: new Map<string, string>(), ip: "203.0.113.1" }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.cookies.has(name) ? { value: jar.cookies.get(name)! } : undefined),
    set: (name: string, value: string) => {
      jar.cookies.set(name, value);
    },
    delete: (name: string) => {
      jar.cookies.delete(name);
    },
  }),
  headers: async () => new Headers({ "x-forwarded-for": jar.ip, host: "localhost:3000" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Redirect(path);
  },
}));

// Sin SMTP: el acceso se entrega como contraseña temporal.
delete process.env.SMTP_HOST;

const { changePassword } = await import("@/server/auth/account-actions");
const { completePasswordLink, requestPasswordReset } = await import("@/server/auth/public-actions");
const { createAuthToken } = await import("@/server/auth/tokens");
const { inviteStaff, changeStaffRole, setStaffActive, resetStaffAccess } = await import(
  "@/server/actions/team"
);
const { createTenant, setTenantActive, resetTenantAccess } = await import(
  "@/server/actions/tenants"
);
const { login } = await import("@/app/login/actions");

let a: OrgFixture;
let b: OrgFixture;
let adminA: { id: string; email: string };

async function actAs(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: { organization: { select: { slug: true } } },
  });
  const sessionId = randomUUID();
  await prisma.user.update({ where: { id: userId }, data: { currentSessionId: sessionId } });
  jar.cookies.set(
    SESSION_COOKIE,
    await signSession({
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      sessionId,
      orgId: user.organizationId,
      orgSlug: user.organization?.slug ?? null,
    }),
  );
}

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

async function redirectOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof Redirect) return error.path;
    throw error;
  }
  return null;
}

beforeAll(async () => {
  a = await createOrgFixture("cuentas-a");
  b = await createOrgFixture("cuentas-b");
  adminA = await prisma.user.create({
    data: {
      organizationId: a.organizationId,
      email: `admin-${randomUUID().slice(0, 8)}@test.mx`,
      name: "Admin A",
      role: "ADMIN",
      passwordHash: await bcrypt.hash("clave-del-admin", 10),
    },
    select: { id: true, email: true },
  });
  await prisma.user.update({
    where: { id: a.owner.id },
    data: { passwordHash: await bcrypt.hash("clave-original", 10) },
  });
});

afterAll(async () => {
  await deleteOrgFixtures(a, b);
  await prisma.loginThrottle.deleteMany({
    where: { key: { in: [`email:${a.owner.email}`, `ip:${jar.ip}`] } },
  });
});

describe("contraseña temporal", () => {
  it("bloquea las acciones hasta elegir una propia", async () => {
    await prisma.user.update({ where: { id: a.owner.id }, data: { mustChangePassword: true } });
    await actAs(a.owner.id);

    await expect(setTenantActive(a.tenant.id, true)).rejects.toThrow(/cambia tu contraseña/);

    // Sin pedir la actual; al terminar va a su inicio con una sesión nueva.
    const oldToken = jar.cookies.get(SESSION_COOKIE);
    const path = await redirectOf(
      changePassword({}, form({ password: "una clave nueva", confirm: "una clave nueva" })),
    );
    expect(path).toBe("/hoy");
    expect(jar.cookies.get(SESSION_COOKIE)).not.toBe(oldToken);

    const owner = await prisma.user.findUniqueOrThrow({ where: { id: a.owner.id } });
    expect(owner.mustChangePassword).toBe(false);
    expect(await bcrypt.compare("una clave nueva", owner.passwordHash)).toBe(true);

    // La sesión nueva sí puede operar.
    expect(await setTenantActive(a.tenant.id, true)).toEqual({ ok: true });
  });

  it("el cambio voluntario pide la contraseña actual", async () => {
    await actAs(a.owner.id);
    expect(
      await changePassword({}, form({ current: "equivocada", password: "otra clave nueva", confirm: "otra clave nueva" })),
    ).toEqual({ error: "Tu contraseña actual no es correcta." });
    expect(
      await changePassword({}, form({ current: "una clave nueva", password: "otra clave nueva", confirm: "otra clave nueva" })),
    ).toEqual({ ok: true });
    await prisma.loginThrottle.deleteMany({ where: { key: `email:${a.owner.email}` } });
  });
});

describe("equipo", () => {
  it("solo el dueño lo administra", async () => {
    await actAs(adminA.id);
    await expect(
      inviteStaff({}, form({ name: "Intruso", email: `x-${randomUUID()}@test.mx`, role: "ADMIN" })),
    ).rejects.toThrow(/permiso/);
  });

  it("respeta los usuarios contratados: dueño, equipo e inquilinos", async () => {
    await actAs(a.owner.id);
    const setMaxUsers = (maxUsers: number) =>
      prisma.organization.update({ where: { id: a.organizationId }, data: { maxUsers } });
    const activeUsers = () =>
      prisma.user.count({ where: { organizationId: a.organizationId, active: true } });
    const newEmail = () => `cupo-${randomUUID().slice(0, 8)}@test.mx`;

    // Dueño, inquilino y administrativo activos: 3 de 3.
    await setMaxUsers(3);
    expect(await activeUsers()).toBe(3);
    const full = await inviteStaff({}, form({ name: "Nuevo Usuario", email: newEmail(), role: "VIEWER" }));
    expect(full.error).toMatch(/contratados 3 usuarios/);

    // Premium no da usuarios.
    await prisma.organization.update({ where: { id: a.organizationId }, data: { plan: "PREMIUM" } });
    expect(
      await inviteStaff({}, form({ name: "Nuevo Usuario", email: newEmail(), role: "VIEWER" })),
    ).toHaveProperty("error");

    // Desactivar libera un lugar.
    expect(await setStaffActive(adminA.id, false)).toEqual({ ok: true });
    const off = await prisma.user.findUniqueOrThrow({ where: { id: adminA.id } });
    expect(off.active).toBe(false);
    expect(off.currentSessionId).toBeNull();

    const email = newEmail();
    const invited = await inviteStaff({}, form({ name: "Nuevo Usuario", email, role: "VIEWER" }));
    expect(invited.ok).toBe(true);
    expect(invited.delivery?.method).toBe("password");
    const created = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(created.organizationId).toBe(a.organizationId);
    expect(created.mustChangePassword).toBe(true);

    // Reactivar al primero rebasaría lo contratado.
    expect(await setStaffActive(adminA.id, true)).toHaveProperty("error");

    // Los inquilinos también ocupan lugar: alta y reactivación.
    expect(
      await createTenant(
        {},
        form({ name: "Inquilino Nuevo", email: newEmail(), password: "temporal-1234" }),
      ),
    ).toHaveProperty("error");
    const formerTenant = await prisma.user.create({
      data: {
        organizationId: a.organizationId,
        email: newEmail(),
        name: "Exinquilino",
        role: "TENANT",
        passwordHash: "x",
        active: false,
      },
    });
    expect(await setTenantActive(formerTenant.id, true)).toHaveProperty("error");

    // Bajar lo contratado no saca a nadie.
    await setMaxUsers(1);
    expect(await activeUsers()).toBe(3);

    // Con más usuarios contratados vuelve a caber.
    await setMaxUsers(5);
    expect(await setTenantActive(formerTenant.id, true)).toEqual({ ok: true });
    expect(await setStaffActive(adminA.id, true)).toEqual({ ok: true });

    await prisma.organization.update({
      where: { id: a.organizationId },
      data: { plan: "FREE", maxUsers: 100 },
    });
  });

  it("no toca al dueño ni a usuarios de otra arrendadora", async () => {
    await actAs(a.owner.id);
    expect(await changeStaffRole(a.owner.id, "VIEWER")).toHaveProperty("error");
    expect(await setStaffActive(a.owner.id, false)).toHaveProperty("error");
    expect(await changeStaffRole(b.owner.id, "VIEWER")).toHaveProperty("error");
    expect(await resetStaffAccess(b.owner.id)).toHaveProperty("error");

    const ownerB = await prisma.user.findUniqueOrThrow({ where: { id: b.owner.id } });
    expect(ownerB.role).toBe("OWNER");
    expect(ownerB.active).toBe(true);
  });
});

describe("inquilinos", () => {
  it("no se desactiva con un contrato vigente", async () => {
    await actAs(a.owner.id);
    expect(await setTenantActive(a.tenant.id, false)).toHaveProperty("error");
  });

  it("restablecer el acceso entrega una contraseña temporal y cierra su sesión", async () => {
    await actAs(a.owner.id);
    await prisma.user.update({ where: { id: a.tenant.id }, data: { currentSessionId: "abierta" } });

    const result = await resetTenantAccess(a.tenant.id);
    expect(result.delivery?.method).toBe("password");
    const tenant = await prisma.user.findUniqueOrThrow({ where: { id: a.tenant.id } });
    expect(tenant.mustChangePassword).toBe(true);
    expect(tenant.currentSessionId).toBeNull();

    expect(await resetTenantAccess(b.tenant.id)).toHaveProperty("error");
  });
});

describe("enlaces de un solo uso", () => {
  it("el enlace de restablecimiento sirve una sola vez y deja a la persona dentro", async () => {
    jar.cookies.clear();
    const raw = await createAuthToken(adminA.id, "RESET");
    await prisma.user.update({ where: { id: adminA.id }, data: { active: true } });

    const fields = { token: raw, purpose: "RESET", password: "clave desde enlace", confirm: "clave desde enlace" };
    expect(await redirectOf(completePasswordLink({}, form(fields)))).toBe("/hoy");

    const session = await verifySession(jar.cookies.get(SESSION_COOKIE));
    expect(session?.sub).toBe(adminA.id);
    const admin = await prisma.user.findUniqueOrThrow({ where: { id: adminA.id } });
    expect(await bcrypt.compare("clave desde enlace", admin.passwordHash)).toBe(true);

    expect(await completePasswordLink({}, form(fields))).toHaveProperty("error");
  });

  it("rechaza tokens vencidos o de otro tipo", async () => {
    const raw = await createAuthToken(adminA.id, "RESET");
    const wrongPurpose = { token: raw, purpose: "INVITE", password: "clave cualquiera", confirm: "clave cualquiera" };
    expect(await completePasswordLink({}, form(wrongPurpose))).toHaveProperty("error");

    await prisma.authToken.updateMany({ where: { userId: adminA.id, usedAt: null }, data: { expiresAt: new Date(0) } });
    const expired = { ...wrongPurpose, purpose: "RESET" };
    expect(await completePasswordLink({}, form(expired))).toHaveProperty("error");
  });

  it("sin correo configurado, recuperar contraseña remite al administrador", async () => {
    expect(await requestPasswordReset({}, form({ email: a.owner.email }))).toEqual({ manual: true });
  });
});

describe("límite de intentos de acceso", () => {
  it("bloquea el correo tras 5 contraseñas incorrectas", async () => {
    jar.cookies.clear();
    jar.ip = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;
    const attempt = (password: string) => login({}, form({ email: a.owner.email, password }));

    for (let i = 0; i < 5; i++) {
      expect(await attempt("incorrecta")).toEqual({ error: "Correo o contraseña incorrectos." });
    }
    // Bloqueado aunque ahora la contraseña sea la buena.
    const blocked = await attempt("otra clave nueva");
    expect(blocked).toHaveProperty("error");
    expect((blocked as { error: string }).error).toMatch(/Demasiados intentos/);

    await prisma.loginThrottle.deleteMany({ where: { key: { in: [`email:${a.owner.email}`, `ip:${jar.ip}`] } } });
    expect(await redirectOf(attempt("otra clave nueva"))).toBe("/hoy");
  });
});
