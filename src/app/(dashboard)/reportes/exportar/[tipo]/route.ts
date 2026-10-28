import type { NextRequest } from "next/server";
import { requireOrgUser } from "@/lib/auth/session";
import { requireCurrentOrg } from "@/lib/org";
import { inputDate, periodKey } from "@/lib/format";
import { buildExport, EXPORTS, isExportKind } from "@/lib/queries/exports";
import { logAction } from "@/server/actions/audit";

const PERIOD = /^\d{4}-\d{2}$/;

/**
 * Descarga de reportes en CSV: /reportes/exportar/{pendientes|cobros|gastos|propietarios}?mes=YYYY-MM.
 *
 * Solo OWNER y ADMIN (el proxy ya deja fuera a consulta e inquilinos) y solo
 * en Premium, como promete /premium. Cada descarga queda en la bitácora: son
 * datos personales de inquilinos que salen de la plataforma.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ tipo: string }> }) {
  const { session, db } = await requireOrgUser(["OWNER", "ADMIN"]);
  const org = await requireCurrentOrg();
  if (org.plan !== "PREMIUM") {
    return new Response("Exportar reportes es parte del plan Premium.", { status: 403 });
  }

  const { tipo } = await params;
  if (!isExportKind(tipo)) return new Response("Reporte no encontrado.", { status: 404 });

  const mes = request.nextUrl.searchParams.get("mes");
  const period = mes && PERIOD.test(mes) ? mes : periodKey(new Date());

  const csv = await buildExport(db, tipo, period);
  await logAction(db, session.sub, "Exportación de reporte", "Report", undefined, `${EXPORTS[tipo].title}${EXPORTS[tipo].monthly ? ` · ${period}` : ""}`);

  const name = EXPORTS[tipo].monthly ? `${tipo}-${period}.csv` : `${tipo}-${inputDate(new Date())}.csv`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${org.slug}-${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
