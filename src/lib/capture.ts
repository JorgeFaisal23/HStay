import "server-only";
import type { OrgDb } from "@/lib/db/scoped";
import type { Role } from "@/lib/auth/jwt";

/**
 * Límite del rol Captura: solo ve y modifica lo de las propiedades que se le
 * asignaron (tabla BuildingAccess). Las acciones que ese rol puede usar llaman
 * a estas funciones antes de leer o escribir; los demás roles no tienen límite
 * por propiedad.
 *
 * Un id de otra propiedad responde igual que uno inexistente: el rol no debe
 * poder averiguar qué hay fuera de sus propiedades.
 */

type AccessDb = Pick<OrgDb, "buildingAccess" | "unit">;

/** Propiedades asignadas a un usuario de Captura. */
export async function captureBuildingIds(db: Pick<OrgDb, "buildingAccess">, userId: string) {
  const rows = await db.buildingAccess.findMany({
    where: { userId },
    select: { buildingId: true },
  });
  return rows.map((row) => row.buildingId);
}

/**
 * Propiedades que puede tocar la sesión: todas (null) para los roles con
 * acceso completo, o la lista asignada para Captura.
 */
export async function allowedBuildingIds(
  db: Pick<OrgDb, "buildingAccess">,
  session: { sub: string; role: Role },
): Promise<string[] | null> {
  return session.role === "CAPTURE" ? captureBuildingIds(db, session.sub) : null;
}

/**
 * ¿Puede la sesión trabajar sobre esta unidad? Para Captura, solo si la unidad
 * es de una de sus propiedades.
 */
export async function canUseUnit(db: AccessDb, session: { sub: string; role: Role }, unitId: string) {
  const allowed = await allowedBuildingIds(db, session);
  if (allowed === null) return true;
  if (allowed.length === 0) return false;
  const unit = await db.unit.findFirst({
    where: { id: unitId, buildingId: { in: allowed } },
    select: { id: true },
  });
  return unit !== null;
}
