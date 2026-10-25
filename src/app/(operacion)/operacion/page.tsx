import type { Metadata } from "next";
import { ClipboardCheck, MapPin } from "lucide-react";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { ReceiptViewer } from "@/components/payments/receipt-viewer";
import { CompleteTaskDialog } from "@/components/tasks/complete-task-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOrgUser } from "@/lib/auth/session";
import { getMyTasks } from "@/lib/queries/tasks";
import { daysBetween, deadlineLabel, dueLabel, shortDate } from "@/lib/format";
import { startOfToday } from "@/lib/payments";
import { TASK_KIND_LABELS } from "@/lib/labels";

export const metadata: Metadata = { title: "Mis tareas" };

function daysFromToday(date: Date) {
  return daysBetween(startOfToday(), new Date(date.getFullYear(), date.getMonth(), date.getDate()));
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * "Mis tareas": lo que le toca a esta persona, con lo necesario para hacerlo
 * (unidad, dirección, para cuándo) y un botón para marcarlo como hecho.
 */
export default async function MyTasksPage() {
  const { session, db } = await requireOrgUser(["OPERATIONS"]);
  const { open, done } = await getMyTasks(db, session.sub);
  const firstName = session.name.split(" ")[0];

  return (
    <>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">Hola, {firstName}</h1>
        <p className="text-muted-foreground text-sm text-pretty">
          {open.length === 0
            ? "No tienes tareas pendientes."
            : open.length === 1
              ? "Tienes 1 tarea por hacer."
              : `Tienes ${open.length} tareas por hacer.`}
        </p>
      </div>

      {open.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="Todo hecho"
          description="Cuando te asignen una limpieza o una reparación aparecerá aquí."
        />
      ) : (
        <ul className="space-y-4">
          {open.map((task) => {
            const place = `${task.unit.building.name} · Unidad ${task.unit.code}`;
            const days = task.dueDate ? daysFromToday(task.dueDate) : null;
            const late = days !== null && days < 0;
            return (
              <li key={task.id}>
                <Card>
                  <CardHeader>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge tone={late ? "danger" : task.turnover ? "warning" : "info"}>
                        {TASK_KIND_LABELS[task.kind]}
                        {late ? " · atrasada" : ""}
                      </StatusBadge>
                      {task.dueDate ? (
                        <span className="text-sm font-medium">
                          {capitalize(late ? deadlineLabel(days!) : dueLabel(days!))} · {shortDate(task.dueDate)}
                        </span>
                      ) : null}
                    </div>
                    <CardTitle className="mt-2 text-pretty">{task.title}</CardTitle>
                    <CardDescription className="flex items-start gap-1.5">
                      <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                      <span className="text-pretty">
                        {place} · {task.unit.building.address}
                      </span>
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {task.turnover ? (
                      <p className="text-sm text-pretty">Entra otro huésped ese mismo día: déjala lista a tiempo.</p>
                    ) : null}
                    {task.description ? <p className="text-sm text-pretty">{task.description}</p> : null}
                    <div className="flex flex-wrap gap-2">
                      <CompleteTaskDialog taskId={task.id} kind={task.kind} title={task.title} place={place} />
                      {task.hasReportPhoto ? (
                        <ReceiptViewer receiptUrl={`/operacion/archivos/reporte/${task.id}`} title={task.title} label="Ver foto del reporte" />
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {done.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Hechas recientemente</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {done.map((task) => (
                <li key={task.id} className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
                  <span className="text-sm text-pretty">{task.title}</span>
                  <span className="text-muted-foreground text-xs">
                    {task.unit.building.name} · {task.unit.code}
                    {task.doneAt ? ` · ${shortDate(task.doneAt)}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
