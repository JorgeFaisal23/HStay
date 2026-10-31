import { SignJWT, jwtVerify } from "jose";

/**
 * Firma y verificación de la sesión. Este módulo se mantiene libre de
 * dependencias de Node (nada de `next/headers` ni Prisma) para que el
 * proxy pueda importarlo.
 */

export const SESSION_COOKIE = "rentas_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 días

export const ROLES = ["SUPERADMIN", "OWNER", "ADMIN", "VIEWER", "OPERATIONS", "PROPERTY_OWNER", "CAPTURE", "TENANT"] as const;
export type Role = (typeof ROLES)[number];

/** Roles que pertenecen a una arrendadora (todos menos el de plataforma). */
export type OrgRole = Exclude<Role, "SUPERADMIN">;

/** Rol con el que el staff de HStay actúa dentro de una arrendadora en modo soporte. */
export const SUPPORT_ROLE = "ADMIN" satisfies OrgRole;

/** Modo soporte abierto: a qué arrendadora entró el superadministrador y hasta cuándo. */
export type SupportClaim = {
  /** Fila de SupportSession. */
  id: string;
  orgId: string;
  orgSlug: string;
  /** Vencimiento en segundos desde epoch. */
  expiresAt: number;
};

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
  /** Solo SUPERADMIN, mientras da soporte a una arrendadora. */
  support?: SupportClaim;
};

/**
 * La sesión con la que se decide qué se ve y qué se puede hacer. Igual a la
 * real salvo en modo soporte vigente: ahí el superadministrador actúa como
 * Administrativo de la arrendadora (mismo `sub`, así queda como autor).
 */
export type EffectiveSession = SessionPayload & {
  /** Id de SupportSession cuando la sesión es de soporte. */
  supportSessionId?: string;
};

export function supportExpired(claim: SupportClaim, now = new Date()) {
  return claim.expiresAt * 1000 <= now.getTime();
}

export function effectiveSession(session: SessionPayload, now = new Date()): EffectiveSession {
  const { support } = session;
  if (!support || supportExpired(support, now)) return session;
  return {
    ...session,
    role: SUPPORT_ROLE,
    orgId: support.orgId,
    orgSlug: support.orgSlug,
    supportSessionId: support.id,
  };
}

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

function parseSupport(value: unknown): SupportClaim | null | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "object" || value === null) return null;
  const claim = value as Record<string, unknown>;
  if (
    typeof claim.id !== "string" ||
    typeof claim.orgId !== "string" ||
    typeof claim.orgSlug !== "string" ||
    typeof claim.expiresAt !== "number"
  ) {
    return null;
  }
  return { id: claim.id, orgId: claim.orgId, orgSlug: claim.orgSlug, expiresAt: claim.expiresAt };
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
    // El modo soporte solo existe sobre una sesión de plataforma.
    const support = parseSupport(payload.support);
    if (support === null) return null;
    if (support && payload.role !== "SUPERADMIN") return null;

    return {
      sub: payload.sub,
      email: payload.email,
      name: payload.name,
      role: payload.role,
      sessionId: payload.sessionId,
      orgId: payload.orgId,
      orgSlug: payload.orgSlug,
      ...(support ? { support } : {}),
    };
  } catch {
    // Token expirado, alterado o firmado con otro secreto.
    return null;
  }
}
