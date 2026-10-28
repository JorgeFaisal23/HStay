import { requireOrgUser } from "@/lib/auth/session";
import { dataUrlResponse } from "@/lib/data-url-response";

/** Comprobante de una entrega al propietario, para el equipo (OWNER/ADMIN). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { db } = await requireOrgUser(["OWNER", "ADMIN"]);
  const { id } = await params;
  const payout = await db.ownerPayout.findUnique({ where: { id }, select: { receiptUrl: true } });
  return dataUrlResponse(payout?.receiptUrl, "No se encontró el comprobante.");
}
