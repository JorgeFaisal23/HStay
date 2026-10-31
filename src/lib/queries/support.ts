import type { OrgDb } from "@/lib/db/scoped";
import { SUPPORT_NOTICE_DAYS } from "@/lib/support";

/**
 * Sesiones de soporte recientes de la arrendadora, para el aviso de su panel.
 * Las abiertas van primero; luego las de los últimos días.
 */
export async function recentSupportSessions(db: Pick<OrgDb, "supportSession">, now = new Date()) {
  const since = new Date(now.getTime() - SUPPORT_NOTICE_DAYS * 24 * 60 * 60 * 1000);
  const rows = await db.supportSession.findMany({
    where: { startedAt: { gte: since } },
    orderBy: { startedAt: "desc" },
    take: 3,
    select: {
      id: true,
      reason: true,
      startedAt: true,
      expiresAt: true,
      endedAt: true,
      superadmin: { select: { name: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    reason: row.reason,
    startedAt: row.startedAt,
    /** Hasta cuándo duró, o null si sigue abierta. */
    endedAt: row.endedAt ?? (row.expiresAt <= now ? row.expiresAt : null),
    staffName: row.superadmin.name,
  }));
}

export type RecentSupportSession = Awaited<ReturnType<typeof recentSupportSessions>>[number];
