import type { Metadata } from "next";
import { CalendarRange, CheckCircle2, Circle } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Amount } from "@/components/shared/amount";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { ButtonLink } from "@/components/shared/button-link";
import { NewBookingDialog } from "@/components/bookings/new-booking-dialog";
import { RegisterPaymentDialog } from "@/components/payments/payment-row-actions";
import { GenerateChargesButton } from "@/components/payments/generate-charges-button";
import { ReviewProofDialog } from "@/components/payments/review-proof-dialog";
import { AssignTaskDialog, type StaffOption } from "@/components/tasks/assign-task-dialog";
import { ReviewExpenseDialog } from "@/components/tasks/review-expense-dialog";
import { getAssignableStaff } from "@/lib/queries/tasks";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireOrgUser } from "@/lib/auth/session";
import { getTodayData } from "@/lib/queries/today";
import { getBookableUnits } from "@/lib/queries/properties";
import { deadlineLabel, longDate, relativeDay, shortDate } from "@/lib/format";
import { remainingOf } from "@/lib/payments";
import { TODAY_GROUPS, type TodayAction, type TodayItem } from "@/lib/today";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Hoy" };

/**
 * "Hoy": lo primero que ve el equipo al entrar. Cada asunto sale de los datos
 * (ver src/lib/today.ts) y se resuelve desde aquí o a un clic.
 */
export default async function TodayPage() {
  const { db } = await requireOrgUser(["OWNER", "ADMIN"]);
  const [data, bookableUnits, staff] = await Promise.all([
    getTodayData(db),
    getBookableUnits(db),
    getAssignableStaff(db),
  ]);

  const groups = TODAY_GROUPS.map((group) => ({
    ...group,
    items: data.items.filter((item) => item.group === group.id),
  })).filter((group) => group.items.length > 0);

  const total = data.items.length;
  const urgent = data.items.filter((item) => item.tone === "danger").length;
  const setupPending = data.setup.some((step) => !step.done);

  const summary =
    total === 0
      ? "Todo al día."
      : `${total === 1 ? "1 asunto por atender" : `${total} asuntos por atender`}${
          urgent > 0 ? `, ${urgent === 1 ? "1 urgente" : `${urgent} urgentes`}` : ""
        }.`;

  return (
    <>
      <PageHeader
        title="Hoy"
        description={`${capitalize(longDate(new Date()))} · ${summary}`}
        action={
          bookableUnits.length > 0 ? <NewBookingDialog units={bookableUnits} variant="default" /> : null
        }
      />

      {setupPending ? <SetupGuide steps={data.setup} /> : null}

      {groups.length === 0 ? (
        setupPending ? null : (
          <EmptyState
            icon={CheckCircle2}
            title="Nada pendiente por ahora"
            description="No hay comprobantes ni gastos por revisar, rentas vencidas, cargos por generar, reparaciones, llegadas, salidas, contratos por vencer ni servicios sin monto. Esta lista se actualiza sola en cuanto algo cambia."
            actions={
              <ButtonLink href="/calendario" variant="outline">
                <CalendarRange className="size-4" aria-hidden />
                Abrir calendario
              </ButtonLink>
            }
          />
        )
      ) : (
        groups.map((group) => (
          <Card key={group.id}>
            <CardHeader>
              <CardTitle>
                {group.title}{" "}
                <span className="text-muted-foreground font-normal tabular-nums">
                  · {group.items.length}
                </span>
              </CardTitle>
              <CardDescription>{group.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {group.items.map((item) => (
                  <TodayRow key={item.key} item={item} staff={staff} />
                ))}
              </ul>
            </CardContent>
          </Card>
        ))
      )}
    </>
  );
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Los plazos dicen "venció hace 3 días"; los sucesos, "hoy" o "Enviado hace 2 días". */
function dateText(item: TodayItem) {
  if (item.date === null) return item.when ?? "";
  const relative = item.dateKind === "event" ? relativeDay(item.days) : deadlineLabel(item.days);
  const text = item.datePrefix ? `${item.datePrefix} ${relative}` : capitalize(relative);
  return `${text} · ${shortDate(item.date)}`;
}

function TodayRow({ item, staff }: { item: TodayItem; staff: StaffOption[] }) {
  return (
    <li className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={item.tone}>{item.status}</StatusBadge>
          <p className="text-sm font-medium text-pretty">{item.title}</p>
        </div>
        <p className="text-muted-foreground text-xs text-pretty">
          {item.place}
          {item.person ? ` · ${item.person.role}: ${item.person.name}` : ""}
          {item.assignee !== undefined ? ` · Responsable: ${item.assignee ?? "sin asignar"}` : ""}
        </p>
        <p className="text-xs text-pretty">
          {item.date ? <time dateTime={item.date.toISOString()}>{dateText(item)}</time> : dateText(item)}
          {item.note ? <span className="text-muted-foreground"> · {item.note}</span> : null}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-3 sm:justify-end">
        {item.amount !== undefined ? (
          <span className="text-sm">
            <span className="text-muted-foreground mr-1.5 text-xs">{item.amountLabel}</span>
            <Amount value={item.amount} tone={item.action.kind === "review" ? undefined : "danger"} />
          </span>
        ) : null}
        <RowAction action={item.action} staff={staff} />
      </div>
    </li>
  );
}

function RowAction({ action, staff }: { action: TodayAction; staff: StaffOption[] }) {
  switch (action.kind) {
    case "payment":
      return (
        <RegisterPaymentDialog
          chargeId={action.chargeId}
          tenantName={action.tenantName}
          amount={action.amount}
          remaining={remainingOf(action.amount, action.paidAmount)}
          partial={action.paidAmount > 0}
          variant="outline"
          iconOnlyOnMobile={false}
        />
      );
    case "review":
      return <ReviewProofDialog proof={action.proof} />;
    case "assign":
      return <AssignTaskDialog target={action.target} staff={staff} />;
    case "expense":
      return <ReviewExpenseDialog expense={action.expense} />;
    case "generate":
      return <GenerateChargesButton period={action.period} count={action.count} variant="outline" />;
    case "link":
      return (
        <ButtonLink href={action.href} variant="outline">
          {action.label}
        </ButtonLink>
      );
  }
}

// ------------------------------------------------------------------ primeros pasos

const SETUP_STEPS: Record<
  "property" | "unit" | "rent" | "charges",
  { title: string; description: string; href: string; cta: string }
> = {
  property: {
    title: "Registra tu primera propiedad",
    description: "El edificio, la casa o el local que agrupa lo que rentas.",
    href: "/edificios",
    cta: "Agregar propiedad",
  },
  unit: {
    title: "Agrega sus unidades",
    description: "Cada departamento, cuarto o local, con su renta. Un edificio puede tener varias.",
    href: "/unidades/nueva",
    cta: "Agregar unidad",
  },
  rent: {
    title: "Renta tu primera unidad",
    description: "Da de alta a un inquilino con su contrato, o registra una reserva de corta estancia con el botón de arriba.",
    href: "/inquilinos/nuevo",
    cta: "Agregar inquilino",
  },
  charges: {
    title: "Genera los cargos del mes",
    description: "Con los cargos llevas la cobranza, y aquí verás lo que se atrasa.",
    href: "/pagos",
    cta: "Ir a Cobros",
  },
};

function SetupGuide({
  steps,
}: {
  steps: readonly { id: keyof typeof SETUP_STEPS; done: boolean }[];
}) {
  const done = steps.filter((step) => step.done).length;
  const next = steps.find((step) => !step.done)?.id;

  return (
    <Card className="bg-brand-soft">
      <CardHeader>
        <CardTitle>Primeros pasos</CardTitle>
        <CardDescription>
          <span className="tabular-nums">
            {done} de {steps.length}
          </span>{" "}
          listos. Esta guía desaparece cuando completes los cuatro.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="space-y-3">
          {steps.map((step) => {
            const copy = SETUP_STEPS[step.id];
            const Icon = step.done ? CheckCircle2 : Circle;
            return (
              <li key={step.id} className="flex items-start gap-3">
                <Icon
                  className={cn(
                    "mt-0.5 size-4 shrink-0",
                    step.done ? "text-success" : "text-muted-foreground",
                  )}
                  aria-hidden
                />
                <div className="min-w-0 flex-1 space-y-2">
                  <div>
                    <p className={cn("text-sm font-medium", step.done && "text-muted-foreground line-through")}>
                      {copy.title}
                      <span className="sr-only">{step.done ? " (listo)" : " (pendiente)"}</span>
                    </p>
                    {step.done ? null : (
                      <p className="text-muted-foreground text-xs text-pretty">{copy.description}</p>
                    )}
                  </div>
                  {step.id === next ? (
                    <ButtonLink href={copy.href} variant="outline">
                      {copy.cta}
                    </ButtonLink>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
