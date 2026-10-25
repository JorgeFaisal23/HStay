import type { Metadata } from "next";
import { Wrench } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { ReportRepairDialog } from "@/components/tasks/report-repair-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOrgUser } from "@/lib/auth/session";
import { getPortalReports } from "@/lib/queries/tasks";
import { shortDate } from "@/lib/format";
import type { Tone } from "@/lib/labels";

export const metadata: Metadata = { title: "Reportes" };

type Report = Awaited<ReturnType<typeof getPortalReports>>[number];

/** Lo que el inquilino necesita saber de su reporte, sin detalles internos. */
function reportState(report: Report): { label: string; tone: Tone; detail: string } {
  if (report.status === "DONE") {
    return { label: "Resuelto", tone: "success", detail: report.doneAt ? `Resuelto el ${shortDate(report.doneAt)}.` : "Resuelto." };
  }
  if (report.status === "CANCELLED") {
    return { label: "Cerrado", tone: "neutral", detail: report.cancelReason ?? "Se cerró sin cambios." };
  }
  return report.assigneeId
    ? { label: "En atención", tone: "info", detail: "Ya hay alguien asignado para resolverlo." }
    : { label: "Recibido", tone: "warning", detail: "El administrador lo recibió y asignará a alguien." };
}

export default async function PortalReportsPage() {
  const { session, db } = await requireOrgUser(["TENANT"]);
  const reports = await getPortalReports(db, session.sub);

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Reportes</h1>
          <p className="text-muted-foreground text-sm text-pretty">
            Si algo de tu vivienda no funciona, repórtalo aquí con una foto y sigue cómo va.
          </p>
        </div>
        <ReportRepairDialog />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tus reportes</CardTitle>
          <CardDescription>Los más recientes primero.</CardDescription>
        </CardHeader>
        <CardContent>
          {reports.length === 0 ? (
            <EmptyState
              icon={Wrench}
              title="No has reportado nada"
              description="Cuando reportes un problema, aquí verás si ya lo están atendiendo y cuándo quedó resuelto."
            />
          ) : (
            <ul className="divide-y">
              {reports.map((report) => {
                const state = reportState(report);
                return (
                  <li key={report.id} className="space-y-1 py-3 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium text-pretty">{report.title}</p>
                      <StatusBadge tone={state.tone}>{state.label}</StatusBadge>
                    </div>
                    <p className="text-muted-foreground text-xs text-pretty">
                      Reportado el {shortDate(report.createdAt)} · {state.detail}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
