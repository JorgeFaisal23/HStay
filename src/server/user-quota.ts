import "server-only";
import type { OrgDb } from "@/lib/db/scoped";
import { userQuotaError } from "@/lib/plans";

/**
 * Usuarios contratados de la arrendadora de la sesión: cuántos tiene activos
 * y cuántos puede tener. El dueño y su equipo no pueden cambiar el cupo.
 */
export async function userQuota(db: OrgDb) {
  const [org, active] = await Promise.all([
    db.organization.findFirstOrThrow({ select: { maxUsers: true } }),
    db.user.count({ where: { active: true } }),
  ]);
  return { active, max: org.maxUsers, full: active >= org.maxUsers };
}

/** Error si no cabe una cuenta activa más (alta o reactivación). */
export async function userQuotaErrorFor(db: OrgDb) {
  const { active, max } = await userQuota(db);
  return userQuotaError(active, max);
}
