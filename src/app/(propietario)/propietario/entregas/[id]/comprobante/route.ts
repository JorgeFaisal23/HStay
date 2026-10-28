import { requireOrgUser } from "@/lib/auth/session";
import { dataUrlResponse } from "@/lib/data-url-response";

/**
 * Comprobante de una entrega, para el propietario: solo las entregas que se
 * le hicieron a él de propiedades que siguen a su nombre.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, db } = await requireOrgUser(["PROPERTY_OWNER"]);
  const { id } = await params;
  const payout = await db.ownerPayout.findFirst({
    where: { id, ownerId: session.sub, building: { ownerId: session.sub } },
    select: { receiptUrl: true },
  });
  return dataUrlResponse(payout?.receiptUrl, "No se encontró el comprobante.");
}
