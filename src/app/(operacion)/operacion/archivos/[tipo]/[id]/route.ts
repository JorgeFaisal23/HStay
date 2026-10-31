import { requireOrgUser } from "@/lib/auth/session";

const DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;

/**
 * Fotos de tareas y comprobantes de gastos, servidas aparte para que las
 * listas no carguen imágenes:
 *
 * - `reporte/{tareaId}`: la foto con la que se reportó una reparación.
 * - `cierre/{tareaId}`: la foto con la que se cerró la tarea.
 * - `gasto/{gastoId}`: el comprobante de un gasto.
 *
 * El equipo (OWNER/ADMIN) ve las de su arrendadora. Operación solo las fotos
 * de las tareas que tiene asignadas, nunca comprobantes de gastos.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ tipo: string; id: string }> }) {
  const { session, db } = await requireOrgUser(["OWNER", "ADMIN", "OPERATIONS"]);
  const { tipo, id } = await params;
  const team = session.role !== "OPERATIONS";

  let dataUrl: string | null = null;
  if (tipo === "reporte" || tipo === "cierre") {
    const task = await db.task.findUnique({
      where: { id },
      select: { assigneeId: true, reportPhotoUrl: true, donePhotoUrl: true },
    });
    if (task && (team || task.assigneeId === session.sub)) {
      dataUrl = tipo === "reporte" ? task.reportPhotoUrl : task.donePhotoUrl;
    }
  } else if (tipo === "gasto" && team) {
    const expense = await db.expense.findUnique({ where: { id }, select: { receiptUrl: true } });
    dataUrl = expense?.receiptUrl ?? null;
  }

  const match = dataUrl ? DATA_URL.exec(dataUrl) : null;
  if (!match) return new Response("No se encontró la imagen.", { status: 404 });

  return new Response(Buffer.from(match[2], "base64"), {
    headers: { "Content-Type": match[1], "Cache-Control": "private, no-store", "Content-Disposition": "inline" },
  });
}
