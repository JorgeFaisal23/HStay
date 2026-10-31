"use server";

import { revalidatePath } from "next/cache";
import { requireOrgUserAction } from "@/lib/auth/session";
import { logAction } from "@/server/actions/audit";
import type { ActionResult } from "@/lib/action-result";

/**
 * Sincronización de Airbnb — SIMULADA en esta demo.
 *
 * Solo actualiza la marca de tiempo y refresca la vista con las reservas que ya
 * están en la base. La integración real importa el enlace iCal del anuncio;
 * los detalles están en src/lib/airbnb/README.md.
 */
export async function syncAirbnbConnection(
  connectionId: string,
): Promise<ActionResult & { bookings?: number }> {
  const { session, db } = await requireOrgUserAction(["OWNER", "ADMIN"]);

  const connection = await db.airbnbConnection.findUnique({
    where: { id: connectionId },
    select: { id: true, unitId: true, listingName: true },
  });
  if (!connection) return { error: "No se encontró la conexión." };

  const [, bookings] = await Promise.all([
    db.airbnbConnection.update({
      where: { id: connectionId },
      data: { lastSyncedAt: new Date(), status: "CONNECTED" },
    }),
    db.booking.count({
      where: { unitId: connection.unitId, source: "AIRBNB", status: "CONFIRMED" },
    }),
  ]);

  await logAction(
    db,
    session.sub,
    "Sincronización de Airbnb (simulada)",
    "AirbnbConnection",
    connectionId,
    connection.listingName,
  );

  revalidatePath("/integraciones");
  revalidatePath("/calendario");
  return { ok: true, bookings };
}

/** Sincroniza todas las conexiones activas de una vez. */
export async function syncAllConnections(): Promise<
  ActionResult & { count?: number }
> {
  const { session, db } = await requireOrgUserAction(["OWNER", "ADMIN"]);

  const result = await db.airbnbConnection.updateMany({
    where: { status: { not: "DISCONNECTED" } },
    data: { lastSyncedAt: new Date(), status: "CONNECTED" },
  });

  await logAction(
    db,
    session.sub,
    "Sincronización general de Airbnb (simulada)",
    "AirbnbConnection",
    undefined,
    `${result.count} anuncios`,
  );

  revalidatePath("/integraciones");
  revalidatePath("/calendario");
  return { ok: true, count: result.count };
}
