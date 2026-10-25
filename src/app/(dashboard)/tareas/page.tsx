import type { Metadata } from "next";
import { ClipboardCheck } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Amount } from "@/components/shared/amount";
import { ReceiptViewer } from "@/components/payments/receipt-viewer";
import { AssignTaskDialog } from "@/components/tasks/assign-task-dialog";
import { CompleteTaskDialog } from "@/components/tasks/complete-task-dialog";
import { CancelTaskDialog } from "@/components/tasks/cancel-task-dialog";
import { ReportRepairDialog } from "@/components/tasks/report-repair-dialog";
import { ReviewExpenseDialog } from "@/components/tasks/review-expense-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOrgUser } from "@/lib/auth/session";
import { getAssignableStaff, getTeamTasks, getUnitOptions } from "@/lib/queries/tasks";
import { daysBetween, dueLabel, relativeDay, shortDate } from "@/lib/format";
import { startOfToday } from "@/lib/payments";
import {
  EXPENSE_STATUS_LABELS,
  EXPENSE_STATUS_TONES,
  TASK_KIND_LABELS,
  TASK_STATUS_LABELS,
  TASK_STATUS_TONES,
} from "@/lib/labels";

export const metadata: Metadata = { title: "Tareas" };

function place(unit: { code: string; building: { name: string } }) {
  return `${unit.building.name} · Unidad ${unit.code}`;
}

function daysFromToday(date: Date) {
  return daysBetween(startOfToday(), new Date(date.getFullYear(), date.getMonth(), date.getDate()));
}

function capitalize(text: string) {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

/**
 * Tareas de operación del equipo: limpiezas y reparaciones abiertas (con su
 * responsable), gastos de reparación por aprobar y lo último que se cerró.
 */
export default async function TasksPage() {
  const { db } = await requireOrgUser(["OWNER", "ADMIN"]);
  const [data, staff, units] = await Promise.all([getTeamTasks(db), getAssignableStaff(db), getUnitOptions(db)]);
  const hasOperations = staff.some((person) => person.role === "OPERATIONS");

  return (
    <>
      <PageHeader
        title="Tareas"
        description="Limpiezas y reparaciones: quién las hace, para cuándo y los gastos que generan."
        action={units.length > 0 ? <ReportRepairDialog units={units} staff={staff} /> : null}
      />

      {!hasOperations ? (
        <p className="text-muted-foreground max-w-2xl text-sm text-pretty">
          Para que alguien de limpieza o mantenimiento vea solo sus tareas en el celular, dale una cuenta con el rol
          Operación desde Equipo. Mientras tanto puedes asignarlas a alguien del equipo.
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>
            Gastos por aprobar <span className="text-muted-foreground font-normal tabular-nums">· {data.pendingExpenses.length}</span>
          </CardTitle>
          <CardDescription>Costos de reparaciones cerradas. No cuentan en tus gastos hasta que los apruebes.</CardDescription>
        </CardHeader>
        <CardContent>
          {data.pendingExpenses.length === 0 ? (
            <p className="text-muted-foreground text-sm">No hay gastos por aprobar.</p>
          ) : (
            <ul className="divide-y">
              {data.pendingExpenses.map((expense) => (
                <li key={expense.id} className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge tone={EXPENSE_STATUS_TONES.PENDING}>{EXPENSE_STATUS_LABELS.PENDING}</StatusBadge>
                      <p className="text-sm font-medium text-pretty">{expense.concept}</p>
                    </div>
                    <p className="text-muted-foreground text-xs">
                      {place(expense.unit)}
                      {expense.createdBy ? ` · Cerró: ${expense.createdBy.name}` : ""} · {shortDate(expense.spentOn)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-3">
                    <Amount value={expense.amount} className="text-sm" />
                    <ReviewExpenseDialog
                      expense={{
                        id: expense.id,
                        concept: expense.concept,
                        place: place(expense.unit),
                        amount: expense.amount,
                        spentOn: expense.spentOn,
                        createdByName: expense.createdBy?.name ?? null,
                        hasReceipt: expense.hasReceipt,
                        notes: expense.notes,
                        taskId: expense.taskId,
                        hasDonePhoto: expense.hasDonePhoto,
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Por hacer <span className="text-muted-foreground font-normal tabular-nums">· {data.open.length}</span>
          </CardTitle>
          <CardDescription>
            Las limpiezas se programan desde Hoy, en cada salida de huésped; las reparaciones las reporta el equipo o el inquilino.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.open.length === 0 ? (
            <EmptyState
              icon={ClipboardCheck}
              title="Sin tareas pendientes"
              description="Cuando programes una limpieza o alguien reporte una reparación, aparecerá aquí con su responsable."
            />
          ) : (
            <ul className="divide-y">
              {data.open.map((task) => (
                <li key={task.id} className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge tone={task.assignee ? "info" : "warning"}>
                        {TASK_KIND_LABELS[task.kind]}
                        {task.assignee ? "" : " · sin asignar"}
                      </StatusBadge>
                      <p className="text-sm font-medium text-pretty">{task.title}</p>
                    </div>
                    <p className="text-muted-foreground text-xs text-pretty">
                      {place(task.unit)} · Responsable: {task.assignee?.name ?? "sin asignar"}
                      {task.reportedBy ? ` · Reportó: ${task.reportedBy.name}` : ""}
                    </p>
                    <p className="text-xs">
                      {task.dueDate
                        ? `${capitalize(dueLabel(daysFromToday(task.dueDate)))} · ${shortDate(task.dueDate)}`
                        : `Reportada ${relativeDay(daysFromToday(task.createdAt))} · ${shortDate(task.createdAt)}`}
                      {task.description ? <span className="text-muted-foreground"> · {task.description}</span> : null}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {task.hasReportPhoto ? (
                      <ReceiptViewer receiptUrl={`/operacion/archivos/reporte/${task.id}`} title={task.title} label="Foto" />
                    ) : null}
                    <AssignTaskDialog
                      staff={staff}
                      target={{ type: "task", taskId: task.id, title: task.title, assigneeId: task.assignee?.id ?? null }}
                    />
                    <CompleteTaskDialog taskId={task.id} kind={task.kind} title={task.title} place={place(task.unit)} />
                    <CancelTaskDialog taskId={task.id} title={task.title} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {data.recent.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Recientes</CardTitle>
            <CardDescription>Lo último que se cerró o se canceló.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {data.recent.map((task) => (
                <li key={task.id} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-pretty">{task.title}</p>
                    <p className="text-muted-foreground text-xs text-pretty">
                      {place(task.unit)}
                      {task.status === "DONE" && task.doneAt
                        ? ` · ${shortDate(task.doneAt)}${task.doneBy ? ` por ${task.doneBy.name}` : ""}`
                        : task.cancelReason
                          ? ` · ${task.cancelReason}`
                          : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {task.expense ? (
                      <span className="text-sm">
                        <Amount value={task.expense.amount} />{" "}
                        <StatusBadge tone={EXPENSE_STATUS_TONES[task.expense.status]}>
                          Gasto {EXPENSE_STATUS_LABELS[task.expense.status].toLowerCase()}
                        </StatusBadge>
                      </span>
                    ) : null}
                    <StatusBadge tone={TASK_STATUS_TONES[task.status]}>{TASK_STATUS_LABELS[task.status]}</StatusBadge>
                    {task.hasDonePhoto ? (
                      <ReceiptViewer receiptUrl={`/operacion/archivos/cierre/${task.id}`} title={task.title} label="Foto" />
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
