import { SignJWT, jwtVerify } from "jose";

/**
 * Firma y verificación de la sesión. Este módulo se mantiene libre de
 * dependencias de Node (nada de `next/headers` ni Prisma) para que el
 * proxy pueda importarlo.
 */

export const SESSION_COOKIE = "rentas_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 días

export const ROLES = ["SUPERADMIN", "OWNER", "ADMIN", "VIEWER", "OPERATIONS", "TENANT"] as const;
export type Role = (typeof ROLES)[number];

/** Roles que pertenecen a una arrendadora (todos menos el de plataforma). */
export type OrgRole = Exclude<Role, "SUPERADMIN">;

export type SessionPayload = {
  sub: string;
  email: string;
  name: string;
  role: Role;
  sessionId: string;
  /** Arrendadora del usuario. Nulo solo para SUPERADMIN. */
  orgId: string | null;
  /** Slug de la arrendadora, para volver a su acceso con marca al salir. */
  orgSlug: string | null;
};

function secretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("Falta la variable de entorno AUTH_SECRET");
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(secretKey());
}

function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

export async function verifySession(
  token: string | undefined,
): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (
      typeof payload.sub !== "string" ||
      typeof payload.email !== "string" ||
      typeof payload.name !== "string" ||
      !isRole(payload.role) ||
      typeof payload.sessionId !== "string" ||
      !isNullableString(payload.orgId) ||
      !isNullableString(payload.orgSlug)
    ) {
      // Incluye los tokens anteriores al multi-arrendador (sin orgId): basta
      // con volver a iniciar sesión.
      return null;
    }
    // Un usuario de arrendadora siempre trae su arrendadora; el de plataforma
    // nunca. Cualquier otra combinación es un token que no emitimos.
    if ((payload.role === "SUPERADMIN") !== (payload.orgId === null)) {
      return null;
    }
    return {
      sub: payload.sub,
      email: payload.email,
      name: payload.name,
      role: payload.role,
      sessionId: payload.sessionId,
      orgId: payload.orgId,
      orgSlug: payload.orgSlug,
    };
  } catch {
    // Token expirado, alterado o firmado con otro secreto.
    return null;
  }
}
