import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { orgDb, type OrgDb } from "@/lib/db/scoped";
import { homePathFor } from "@/lib/permissions";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  type EffectiveSession,
  type OrgRole,
  type Role,
  type SessionPayload,
  effectiveSession,
  signSession,
  supportExpired,
  verifySession,
} from "./jwt";

export { loginPathFor } from "./paths";

/** Lee la sesión actual. Devuelve null si no hay o si el token no es válido. */
export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}

/**
 * La sesión con la que se decide qué se ve (ver `effectiveSession`). Solo lee
 * el token; la vigencia la imponen requireUser y requireUserAction.
 */
export async function getEffectiveSession(): Promise<EffectiveSession | null> {
  const session = await getSession();
  return session ? effectiveSession(session) : null;
}

export async function createSession(payload: SessionPayload) {
  const token = await signSession(payload);
  const store = await cookies();

  let isSecure = false;
  try {
    const headerStore = await headers();
    const proto = headerStore.get("x-forwarded-proto");
    isSecure =
      process.env.COOKIE_SECURE === "true" ||
      (proto === "https" && process.env.COOKIE_SECURE !== "false");
  } catch {
    isSecure = process.env.COOKIE_SECURE === "true";
  }

  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecure,
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

/** Solo en Server Actions y Route Handlers: Next no deja tocar cookies al renderizar. */
export async function destroySession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

// ------------------------------------------------------------ validación

/** Por qué una sesión con firma válida ya no sirve. Se usa como `?motivo=`. */
export type SessionProblem =
  | "sesion_duplicada"
  | "cuenta_inactiva"
  | "organizacion_suspendida";

export const SESSION_PROBLEMS: readonly SessionProblem[] = [
  "sesion_duplicada",
  "cuenta_inactiva",
  "organizacion_suspendida",
];

const PROBLEM_MESSAGES: Record<SessionProblem, string> = {
  sesion_duplicada:
    "Tu sesión fue cerrada porque se inició sesión en otro dispositivo.",
  cuenta_inactiva: "Tu cuenta ya no está activa o tu sesión ha expirado.",
  organizacion_suspendida:
    "El acceso de tu arrendadora está suspendido. Contacta al administrador de la plataforma.",
};

/** Una sola consulta por petición aunque layout y página validen la sesión. */
const loadAccount = cache(async (userId: string) =>
  prisma.user.findUnique({
    where: { id: userId },
    select: {
      active: true,
      currentSessionId: true,
      mustChangePassword: true,
      organizationId: true,
      organization: { select: { status: true } },
    },
  }),
);

/**
 * El JWT solo prueba quién firmó; la base dice si la sesión sigue valiendo:
 * cuenta activa, misma arrendadora, sesión vigente (una por usuario) y
 * arrendadora no suspendida.
 */
export async function findSessionProblem(
  session: SessionPayload,
): Promise<SessionProblem | null> {
  const user = await loadAccount(session.sub);
  if (!user || !user.active) return "cuenta_inactiva";
  if (user.organizationId !== session.orgId) return "cuenta_inactiva";
  // La suspensión va antes que la sesión duplicada: al suspender se cierran
  // las sesiones, y el aviso que importa es el de la suspensión.
  if (user.organization && user.organization.status !== "ACTIVE") {
    return "organizacion_suspendida";
  }
  if (user.currentSessionId !== session.sessionId) return "sesion_duplicada";
  return null;
}

/** Cierra un modo soporte vencido o terminado y regresa al panel de plataforma. */
export const SUPPORT_END_PATH = "/soporte/terminar";

const SUPPORT_ENDED_MESSAGE =
  "Tu sesión de soporte terminó. Vuelve a entrar desde el panel de plataforma.";

const loadSupport = cache(async (id: string) =>
  prisma.supportSession.findUnique({
    where: { id },
    select: {
      superadminId: true,
      organizationId: true,
      expiresAt: true,
      endedAt: true,
      organization: { select: { status: true } },
    },
  }),
);

/**
 * ¿El modo soporte de la sesión ya no vale? Además del vencimiento del token,
 * la base manda: la fila debe seguir abierta, ser de este superadministrador y
 * de esa arrendadora, y la arrendadora debe estar activa.
 */
export async function supportEnded(session: SessionPayload, now = new Date()): Promise<boolean> {
  const { support } = session;
  if (!support) return false;
  if (supportExpired(support, now)) return true;
  const row = await loadSupport(support.id);
  return (
    !row ||
    row.endedAt !== null ||
    row.expiresAt <= now ||
    row.superadminId !== session.sub ||
    row.organizationId !== support.orgId ||
    row.organization.status !== "ACTIVE"
  );
}

/** Ruta del cambio obligatorio de contraseña (cuenta con contraseña temporal). */
export const FORCED_PASSWORD_PATH = "/cambiar-contrasena";

/** Para el cambio de contraseña: deja pasar a quien todavía tiene la temporal. */
type RequireOptions = { allowPendingPasswordChange?: boolean };

/** ¿La cuenta de la sesión tiene contraseña temporal pendiente de cambiar? */
export async function mustChangePassword(session: SessionPayload) {
  const account = await loadAccount(session.sub);
  return account?.mustChangePassword ?? false;
}

// ------------------------------------------------------------ páginas

/**
 * Exige una sesión válida y, opcionalmente, uno de los roles indicados.
 * Redirige en vez de lanzar para que las páginas no tengan que manejarlo.
 *
 * Una sesión que ya no vale se manda a /salir: ahí un Route Handler borra la
 * cookie (durante el render no se puede) y lleva al acceso con el motivo.
 */
export async function requireUser(
  roles?: Role[],
  options: RequireOptions = {},
): Promise<EffectiveSession> {
  const session = await getSession();
  if (!session) redirect("/login");

  const problem = await findSessionProblem(session);
  if (problem) redirect(`/salir?motivo=${problem}`);

  // Un soporte vencido no cierra la sesión del superadministrador: solo lo
  // saca de la arrendadora.
  if (await supportEnded(session)) redirect(SUPPORT_END_PATH);

  // Con contraseña temporal no se usa la app hasta elegir una propia.
  if (!options.allowPendingPasswordChange && (await mustChangePassword(session))) {
    redirect(FORCED_PASSWORD_PATH);
  }

  const effective = effectiveSession(session);
  if (roles && !roles.includes(effective.role)) redirect(homePathFor(effective.role));
  return effective;
}

/** Sesión de un usuario de arrendadora: el orgId y el slug siempre existen. */
export type OrgSession = EffectiveSession & {
  role: OrgRole;
  orgId: string;
  orgSlug: string;
};

export type OrgContext = {
  session: OrgSession;
  orgId: string;
  /** Cliente limitado a la arrendadora de la sesión (ver src/lib/db/scoped.ts). */
  db: OrgDb;
};

function toOrgContext(session: EffectiveSession): OrgContext | null {
  if (session.role === "SUPERADMIN" || !session.orgId || !session.orgSlug) {
    return null;
  }
  return {
    session: session as OrgSession,
    orgId: session.orgId,
    db: orgDb(session.orgId),
  };
}

/** Para páginas del panel y del portal: sesión + cliente con alcance. */
export async function requireOrgUser(roles?: OrgRole[]): Promise<OrgContext> {
  const session = await requireUser(roles);
  const context = toOrgContext(session);
  if (!context) redirect(homePathFor(session.role));
  return context;
}

export async function requireSuperadmin(): Promise<SessionPayload> {
  return requireUser(["SUPERADMIN"]);
}

// ------------------------------------------------------------ server actions

/** Para Server Actions: lanza en vez de redirigir. */
export async function requireUserAction(
  roles?: Role[],
  options: RequireOptions = {},
): Promise<EffectiveSession> {
  const session = await getSession();
  if (!session) throw new Error("Sesión no válida. Vuelve a iniciar sesión.");

  const problem = await findSessionProblem(session);
  if (problem) {
    await destroySession();
    throw new Error(PROBLEM_MESSAGES[problem]);
  }

  if (await supportEnded(session)) throw new Error(SUPPORT_ENDED_MESSAGE);

  if (!options.allowPendingPasswordChange && (await mustChangePassword(session))) {
    throw new Error("Primero cambia tu contraseña temporal.");
  }

  const effective = effectiveSession(session);
  if (roles && !roles.includes(effective.role)) {
    throw new Error("No tienes permiso para realizar esta acción.");
  }
  return effective;
}

export async function requireOrgUserAction(roles?: OrgRole[]): Promise<OrgContext> {
  const session = await requireUserAction(roles);
  const context = toOrgContext(session);
  if (!context) throw new Error("No tienes permiso para realizar esta acción.");
  return context;
}

export async function requireSuperadminAction(): Promise<SessionPayload> {
  return requireUserAction(["SUPERADMIN"]);
}

/**
 * Para terminar el modo soporte: la sesión real del superadministrador, con
 * su claim de soporte aunque ya haya vencido (justo para poder cerrarlo).
 */
export async function requireSupportAction(): Promise<SessionPayload & { support: NonNullable<SessionPayload["support"]> }> {
  const session = await getSession();
  if (!session) throw new Error("Sesión no válida. Vuelve a iniciar sesión.");

  const problem = await findSessionProblem(session);
  if (problem) {
    await destroySession();
    throw new Error(PROBLEM_MESSAGES[problem]);
  }

  const { support } = session;
  if (session.role !== "SUPERADMIN" || !support) {
    throw new Error("No hay una sesión de soporte abierta.");
  }
  return { ...session, support };
}

/**
 * Para el monitor en cliente: devuelve el problema de la sesión (y la cierra)
 * o null si sigue activa.
 */
export async function checkSessionProblem(): Promise<
  SessionProblem | "sin_sesion" | "soporte_terminado" | null
> {
  const session = await getSession();
  if (!session) return "sin_sesion";

  const problem = await findSessionProblem(session);
  if (problem) {
    await destroySession();
    return problem;
  }
  return (await supportEnded(session)) ? "soporte_terminado" : null;
}
