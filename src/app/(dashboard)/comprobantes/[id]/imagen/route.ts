import { requireOrgUser } from "@/lib/auth/session";

const DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;

/**
 * Foto de un comprobante enviado por un inquilino, para el diálogo de
 * revisión. Se sirve aparte (y no como data URL dentro de la página) para que
 * "Hoy" y Cobros no carguen cada imagen solo por listar comprobantes.
 *
 * Solo OWNER y ADMIN de la arrendadora (el proxy deja fuera a consulta e
 * inquilinos y el cliente con alcance a las demás arrendadoras).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { db } = await requireOrgUser(["OWNER", "ADMIN"]);
  const { id } = await params;

  const proof = await db.paymentProof.findUnique({ where: { id }, select: { receiptUrl: true } });
  const match = proof ? DATA_URL.exec(proof.receiptUrl) : null;
  if (!match) return new Response("No se encontró el comprobante.", { status: 404 });

  return new Response(Buffer.from(match[2], "base64"), {
    headers: {
      "Content-Type": match[1],
      "Cache-Control": "private, no-store",
      "Content-Disposition": "inline",
    },
  });
}
