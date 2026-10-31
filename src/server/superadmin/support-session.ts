import "server-only";
import { prisma } from "@/lib/prisma";
import { createSession } from "@/lib/auth/session";
import type { SessionPayload, SupportClaim } from "@/lib/auth/jwt";
import type { SupportEndReason } from "@/generated/prisma/enums";
import { SUPPORT_DURATION_HOURS } from "@/lib/support";
import { SUPPORT_ACTOR_LABEL, SUPPORT_END_REASON_LABELS } from "@/lib/labels";

/**
 * Modo soporte: abrir y cerrar. Lo usan las acciones de plataforma
 * (support.ts), el cierre por vencimiento (/soporte/terminar) y el logout.
 *
 * La cookie sigue siendo la del superadministrador (mismo `sub` y `sessionId`,
 * así no choca con la sesión única); solo gana o pierde el claim `support`.
 */

/** Sesión de plataforma sin modo soporte. */
function platformSession(session: SessionPayload): SessionPayload {
  return {
    sub: session.sub,
    email: session.email,
    name: session.name,
    role: session.role,
    sessionId: session.sessionId,
    orgId: null,
    orgSlug: null,
  };
}

async function logSupport(organizationId: string, userId: string, action: string, entityId: string, detail: string) {
  try {
    await prisma.auditLog.create({
      data: { organizationId, userId, action, entity: "SupportSession", entityId, detail },
    });
  } catch (error) {
    console.error("No se pudo registrar en la bitácora:", error);
  }
}

/**
 * Cierra las sesiones de soporte que este superadministrador dejó abiertas
 * (por ejemplo, en otro dispositivo). Solo puede atender una arrendadora a la vez.
 */
async function closeDangling(superadminId: string) {
  const open = await prisma.supportSession.findMany({
    where: { superadminId, endedAt: null },
    select: { id: true, organizationId: true, expiresAt: true },
  });
  const now = new Date();
  for (const row of open) {
    const reason: SupportEndReason = row.expiresAt <= now ? "EXPIRED" : "MANUAL";
    await finish(row.id, row.organizationId, superadminId, reason, now);
  }
}

async function finish(
  id: string,
  organizationId: string,
  superadminId: string,
  reason: SupportEndReason,
  now = new Date(),
) {
  // Solo la primera vez: si ya estaba cerrada no se registra dos veces.
  const { count } = await prisma.supportSession.updateMany({
    where: { id, endedAt: null },
    data: { endedAt: now, endReason: reason },
  });
  if (count > 0) {
    await logSupport(organizationId, superadminId, `Fin de sesión · ${SUPPORT_ACTOR_LABEL}`, id, SUPPORT_END_REASON_LABELS[reason]);
  }
}

export async function openSupportSession(
  session: SessionPayload,
  org: { id: string; slug: string },
  reason: string,
) {
  await closeDangling(session.sub);

  const expiresAt = new Date(Date.now() + SUPPORT_DURATION_HOURS * 60 * 60 * 1000);
  const row = await prisma.supportSession.create({
    data: { organizationId: org.id, superadminId: session.sub, reason, expiresAt },
    select: { id: true },
  });
  await logSupport(org.id, session.sub, `Inicio de sesión · ${SUPPORT_ACTOR_LABEL}`, row.id, reason);

  const support: SupportClaim = {
    id: row.id,
    orgId: org.id,
    orgSlug: org.slug,
    expiresAt: Math.floor(expiresAt.getTime() / 1000),
  };
  await createSession({ ...platformSession(session), support });
  return row.id;
}

/**
 * Cierra el modo soporte de la sesión. Con `keepSession` (lo normal) reemite
 * la cookie de plataforma; el logout pasa `false` porque la va a borrar.
 */
export async function closeSupportSession(
  session: SessionPayload & { support: SupportClaim },
  reason: SupportEndReason,
  { keepSession = true } = {},
) {
  await finish(session.support.id, session.support.orgId, session.sub, reason);
  if (keepSession) await createSession(platformSession(session));
}
