import "server-only";
import type { OrgDb } from "@/lib/db/scoped";

/**
 * Bitácora. Se escribe siempre; solo se lee desde la pantalla Premium de
 * equipo, de modo que al activar el plan ya hay historial que mostrar.
 *
 * Recibe el cliente con alcance de la acción: el registro queda en la
 * arrendadora de quien actuó sin que nadie tenga que pasar el id.
 *
 * Nunca debe tumbar la operación principal: si falla el registro, se anota en
 * consola y la acción del usuario continúa.
 */
export async function logAction(
  db: OrgDb,
  userId: string | null,
  action: string,
  entity: string,
  entityId?: string,
  detail?: string,
) {
  try {
    await db.auditLog.create({
      data: { userId, action, entity, entityId, detail },
    });
  } catch (error) {
    console.error("No se pudo registrar en la bitácora:", error);
  }
}
