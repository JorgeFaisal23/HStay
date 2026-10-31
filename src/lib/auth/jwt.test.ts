import { SignJWT } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { effectiveSession, signSession, verifySession, type SessionPayload } from "@/lib/auth/jwt";

const SECRET = "secreto-de-prueba-para-jwt-0123456789";

beforeAll(() => {
  process.env.AUTH_SECRET = SECRET;
});

const superadmin: SessionPayload = {
  sub: "u-super",
  email: "staff@plataforma.test",
  name: "Staff",
  role: "SUPERADMIN",
  sessionId: "s-1",
  orgId: null,
  orgSlug: null,
};

const inOneHour = () => Math.floor(Date.now() / 1000) + 3600;
const support = () => ({ id: "sup-1", orgId: "org-a", orgSlug: "arrendadora-a", expiresAt: inOneHour() });

/** Firma un token arbitrario, como lo haría alguien que tuviera el secreto. */
async function forge(payload: Record<string, unknown>) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(SECRET));
}

describe("claim de soporte", () => {
  it("una sesión de plataforma con soporte se verifica completa", async () => {
    const claim = support();
    const session = await verifySession(await signSession({ ...superadmin, support: claim }));
    expect(session?.support).toEqual(claim);
  });

  it("sin claim, la sesión no trae soporte", async () => {
    const session = await verifySession(await signSession(superadmin));
    expect(session).not.toBeNull();
    expect(session?.support).toBeUndefined();
  });

  it("rechaza el soporte sobre un usuario de arrendadora", async () => {
    const token = await forge({
      ...superadmin,
      role: "OWNER",
      orgId: "org-b",
      orgSlug: "arrendadora-b",
      support: support(),
    });
    expect(await verifySession(token)).toBeNull();
  });

  it("rechaza un claim de soporte mal formado", async () => {
    for (const bad of [null, "org-a", { id: "x", orgId: "org-a" }, { ...support(), expiresAt: "mañana" }]) {
      expect(await verifySession(await forge({ ...superadmin, support: bad })), JSON.stringify(bad)).toBeNull();
    }
  });
});

describe("effectiveSession", () => {
  it("con soporte vigente actúa como Administrativo de esa arrendadora", () => {
    const claim = support();
    const effective = effectiveSession({ ...superadmin, support: claim });
    expect(effective).toMatchObject({
      sub: "u-super",
      role: "ADMIN",
      orgId: "org-a",
      orgSlug: "arrendadora-a",
      supportSessionId: "sup-1",
    });
  });

  it("con soporte vencido vuelve a ser la sesión de plataforma", () => {
    const expired = { ...support(), expiresAt: Math.floor(Date.now() / 1000) - 1 };
    const effective = effectiveSession({ ...superadmin, support: expired });
    expect(effective.role).toBe("SUPERADMIN");
    expect(effective.orgId).toBeNull();
    expect(effective.supportSessionId).toBeUndefined();
  });

  it("sin soporte no cambia nada", () => {
    expect(effectiveSession(superadmin)).toEqual(superadmin);
  });
});
