import "server-only";
import type { OrgDb } from "./scoped";

/**
 * Comprobaciones de pertenencia para las llaves foráneas que llegan del
 * cliente. El cliente con alcance filtra lecturas y actualizaciones, pero un
 * `create` con el `unitId` de otra arrendadora solo lo detiene una de estas
 * verificaciones (ver src/lib/db/scoped.ts).
 *
 * Todas responden "no existe" igual para un id inexistente que para uno de
 * otra arrendadora: no hay que revelar que el id es válido en otro lado.
 */

export async function buildingExists(db: OrgDb, id: string) {
  const row = await db.building.findUnique({ where: { id }, select: { id: true } });
  return row !== null;
}

export async function unitExists(db: OrgDb, id: string) {
  const row = await db.unit.findUnique({ where: { id }, select: { id: true } });
  return row !== null;
}

export async function tenantExists(db: OrgDb, id: string) {
  const row = await db.user.findFirst({
    where: { id, role: "TENANT" },
    select: { id: true },
  });
  return row !== null;
}

/** P2025: la fila que una actualización o borrado buscaba no existe (o no es de la arrendadora). */
export function isNotFoundError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2025"
  );
}
