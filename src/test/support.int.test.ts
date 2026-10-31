import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE, signSession, verifySession } from "@/lib/auth/jwt";
import { createOrgFixture, deleteOrgFixtures, type OrgFixture } from "@/test/fixtures";

/**
 * Modo soporte con la sesión real: el superadministrador entra a una
 * arrendadora como Administrativo, actúa con alcance, y sale (a mano, por
 * vencimiento o porque la arrendadora se suspende).
 */

class Redirect extends Error {
  constructor(public path: string) {
    super(`REDIRECT ${path}`);
  }
}

const jar = vi.hoisted(() => ({ cookies: new Map<string, string>() }));

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
  headers: async () => new Headers({ host: "localhost:3000" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Redirect(path);
  },
}));

const { startSupportSession, endSupportSession } = await import("@/server/superadmin/support");
const { requireOrgUserAction, supportEnded } = await import("@/lib/auth/session");
const { updateBuilding } = await import("@/server/actions/properties");
const { inviteStaff } = await import("@/server/actions/team");
const { setOrganizationPlan } = await import("@/server/superadmin/actions");
const { recentSupportSessions } = await import("@/lib/queries/support");
const { createOrgDb } = await import("@/lib/db/scoped");

let a: OrgFixture;
let b: OrgFixture;
let superId: string;

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

async function currentSession() {
  return verifySession(jar.cookies.get(SESSION_COOKIE));
}

async function actAsSuperadmin() {
  const sessionId = randomUUID();
  await prisma.user.update({ where: { id: superId }, data: { currentSessionId: sessionId } });
  jar.cookies.set(
    SESSION_COOKIE,
    await signSession({
      sub: superId,
      email: "staff@test.mx",
      name: "Staff",
      role: "SUPERADMIN",
      sessionId,
      orgId: null,
      orgSlug: null,
    }),
  );
}

async function enter(org: OrgFixture, reason = "Corregir datos que pidió el dueño") {
  return redirectOf(startSupportSession({}, form({ orgId: org.organizationId, reason })));
}

beforeAll(async () => {
  a = await createOrgFixture("soporte-a");
  b = await createOrgFixture("soporte-b");
  const superadmin = await prisma.user.create({
    data: {
      email: `staff-${randomUUID().slice(0, 8)}@test.mx`,
      name: "Staff",
      role: "SUPERADMIN",
      passwordHash: "x",
    },
  });
  superId = superadmin.id;
});

afterAll(async () => {
  await prisma.supportSession.deleteMany({ where: { superadminId: superId } });
  await deleteOrgFixtures(a, b);
  await prisma.user.delete({ where: { id: superId } });
});

beforeEach(async () => {
  jar.cookies.clear();
  await prisma.supportSession.deleteMany({ where: { superadminId: superId } });
  await prisma.organization.update({ where: { id: a.organizationId }, data: { status: "ACTIVE" } });
  await actAsSuperadmin();
});

describe("modo soporte", () => {
  it("exige un motivo", async () => {
    const result = await startSupportSession({}, form({ orgId: a.organizationId, reason: "corto" }));
    expect(result.error).toMatch(/motivo/);
    expect(await prisma.supportSession.count({ where: { superadminId: superId } })).toBe(0);
  });

  it("no entra a una arrendadora suspendida", async () => {
    await prisma.organization.update({ where: { id: a.organizationId }, data: { status: "SUSPENDED" } });
    const result = await startSupportSession({}, form({ orgId: a.organizationId, reason: "Revisar un cobro duplicado" }));
    expect(result.error).toMatch(/suspendido/);
  });

  it("solo el superadministrador puede abrirlo", async () => {
    const sessionId = randomUUID();
    await prisma.user.update({ where: { id: a.owner.id }, data: { currentSessionId: sessionId } });
    jar.cookies.set(
      SESSION_COOKIE,
      await signSession({
        sub: a.owner.id,
        email: a.owner.email!,
        name: "Dueño",
        role: "OWNER",
        sessionId,
        orgId: a.organizationId,
        orgSlug: a.org.slug,
      }),
    );
    await expect(enter(b)).rejects.toThrow(/permiso/);
  });

  it("entra como Administrativo, con alcance a esa arrendadora", async () => {
    expect(await enter(a)).toBe("/dashboard");

    const row = await prisma.supportSession.findFirstOrThrow({ where: { superadminId: superId } });
    expect(row.organizationId).toBe(a.organizationId);
    expect(row.endedAt).toBeNull();

    const session = await currentSession();
    expect(session?.role).toBe("SUPERADMIN");
    expect(session?.support?.id).toBe(row.id);

    const { session: effective, orgId, db } = await requireOrgUserAction(["OWNER", "ADMIN"]);
    expect(effective.role).toBe("ADMIN");
    expect(effective.sub).toBe(superId);
    expect(orgId).toBe(a.organizationId);
    // La otra arrendadora sigue sin verse.
    expect(await db.building.findUnique({ where: { id: b.building.id } })).toBeNull();

    const start = await prisma.auditLog.findFirst({
      where: { organizationId: a.organizationId, entity: "SupportSession", entityId: row.id },
    });
    expect(start?.userId).toBe(superId);
    expect(start?.detail).toBe("Corregir datos que pidió el dueño");
  });

  it("edita la operación y queda en la bitácora a su nombre", async () => {
    await enter(a);
    const result = await updateBuilding(
      {},
      form({ buildingId: a.building.id, name: "Edificio corregido", address: "Calle 2", currency: "MXN" }),
    );
    expect(result.error).toBeUndefined();
    const building = await prisma.building.findUniqueOrThrow({ where: { id: a.building.id } });
    expect(building.name).toBe("Edificio corregido");

    const log = await prisma.auditLog.findFirst({
      where: { organizationId: a.organizationId, entityId: a.building.id },
      orderBy: { createdAt: "desc" },
    });
    expect(log?.userId).toBe(superId);
  });

  it("no administra el equipo ni la plataforma mientras está dentro", async () => {
    await enter(a);
    await expect(
      inviteStaff({}, form({ name: "Nuevo", email: "nuevo@test.mx", role: "ADMIN" })),
    ).rejects.toThrow(/permiso/);
    await expect(setOrganizationPlan(a.organizationId, "PREMIUM")).rejects.toThrow(/permiso/);
  });

  it("terminar lo cierra, lo registra y regresa a la ficha", async () => {
    await enter(a);
    const path = await redirectOf(endSupportSession());
    expect(path).toBe(`/superadmin/organizaciones/${a.organizationId}`);

    const row = await prisma.supportSession.findFirstOrThrow({ where: { superadminId: superId } });
    expect(row.endedAt).not.toBeNull();
    expect(row.endReason).toBe("MANUAL");

    const session = await currentSession();
    expect(session?.role).toBe("SUPERADMIN");
    expect(session?.support).toBeUndefined();
    await expect(requireOrgUserAction()).rejects.toThrow(/permiso/);
  });

  it("vencido o con la arrendadora suspendida, deja de dar acceso sin cerrar la sesión", async () => {
    await enter(a);
    const session = (await currentSession())!;

    await prisma.supportSession.update({
      where: { id: session.support!.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await supportEnded(session)).toBe(true);
    await expect(requireOrgUserAction()).rejects.toThrow(/soporte terminó/);
    // La cookie del superadministrador sigue ahí.
    expect(jar.cookies.has(SESSION_COOKIE)).toBe(true);

    await prisma.supportSession.update({
      where: { id: session.support!.id },
      data: { expiresAt: new Date(Date.now() + 60_000) },
    });
    expect(await supportEnded(session)).toBe(false);
    await prisma.organization.update({ where: { id: a.organizationId }, data: { status: "SUSPENDED" } });
    expect(await supportEnded(session)).toBe(true);
  });

  it("entrar a otra arrendadora cierra la sesión anterior", async () => {
    await enter(a);
    await actAsSuperadmin();
    await enter(b);
    const rows = await prisma.supportSession.findMany({
      where: { superadminId: superId },
      orderBy: { startedAt: "asc" },
    });
    expect(rows).toHaveLength(2);
    expect(rows[0].endedAt).not.toBeNull();
    expect(rows[1].endedAt).toBeNull();
  });

  it("la arrendadora ve el aviso con el motivo", async () => {
    await enter(a, "Revisar el contrato de la unidad 101");
    const notices = await recentSupportSessions(createOrgDb(a.organizationId));
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ reason: "Revisar el contrato de la unidad 101", staffName: "Staff", endedAt: null });
    expect(await recentSupportSessions(createOrgDb(b.organizationId))).toHaveLength(0);
  });
});
