import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Banknote, CircleDollarSign, Wallet } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Amount } from "@/components/shared/amount";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { requireOrgUser } from "@/lib/auth/session";
import { canEdit } from "@/lib/permissions";
import { getPaymentsBoard } from "@/lib/queries/payments";
import {
  money,
  periodKey,
  periodLabel,
  recentPeriods,
  shortDate,
} from "@/lib/format";
import {
  CHARGE_STATUS_LABELS,
  CHARGE_STATUS_TONES,
  PROOF_STATUS_LABELS,
  PROOF_STATUS_TONES,
} from "@/lib/labels";
import { remainingOf } from "@/lib/payments";
import { ReviewProofDialog } from "@/components/payments/review-proof-dialog";
import { PaymentsToolbar } from "./payments-toolbar";
import { PaymentRowActions } from "@/components/payments/payment-row-actions";
import { ReceiptBadge } from "@/components/payments/receipt-viewer";

export const metadata: Metadata = { title: "Cobros" };

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { session, db } = await requireOrgUser(["OWNER", "ADMIN"]);
  const { mes } = await searchParams;

  const periods = recentPeriods(12);
  const period = mes && periods.includes(mes) ? mes : periodKey(new Date());

  const board = await getPaymentsBoard(db, period);
  const editable = canEdit(session.role);

  const progress =
    board.expected === 0 ? 0 : Math.round((board.collected / board.expected) * 100);

  return (
    <>
      <PageHeader
        title="Cobros"
        description="Cargos de renta del mes: qué se espera, qué ya entró y qué está vencido."
        action={
          <PaymentsToolbar
            period={period}
            periods={periods}
            missingCharges={board.missingCharges}
            editable={editable}
          />
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={`Esperado · ${periodLabel(period)}`}
          value={<Amount value={board.expected} compact />}
          hint={`${board.chargeCount} ${board.chargeCount === 1 ? "cargo" : "cargos"} generados`}
          icon={Wallet}
        />
        <StatCard
          label="Cobrado"
          value={<Amount value={board.collected} compact />}
          hint={`${progress}% del total esperado`}
          icon={Banknote}
          tone="brand"
        />
        <StatCard
          label="Por cobrar"
          value={<Amount value={board.pending} compact />}
          hint={
            board.pending === 0
              ? "Todo cobrado este mes"
              : "Incluye pendientes y vencidos"
          }
          icon={CircleDollarSign}
        />
        <StatCard
          label="Vencidos"
          value={board.overdueCount === 0 ? "Ninguno" : String(board.overdueCount)}
          hint={
            board.overdueCount === 0
              ? "Sin atrasos"
              : "Conviene contactar a estos inquilinos"
          }
          icon={AlertTriangle}
          tone={board.overdueCount > 0 ? "danger" : "default"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Dinero de {periodLabel(period).toLowerCase()}</CardTitle>
            <CardDescription>
              Cada cifra va por separado: lo cobrado no incluye depósitos ni descuenta gastos.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-medium">Avance de cobranza</span>
                <span className="text-muted-foreground tabular-nums">
                  <Amount value={board.collected} className="text-foreground" /> de{" "}
                  <Amount value={board.expected} className="font-normal" />
                </span>
              </div>
              <Progress value={progress} />
            </div>
            <dl className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border p-3">
                <dt className="text-muted-foreground text-xs">Gastos de servicios</dt>
                <dd className="mt-1 text-lg">
                  <Amount value={board.servicesExpense} />
                </dd>
                <dd className="text-muted-foreground text-xs text-pretty">
                  Recibos capturados del mes.{" "}
                  <Link href={`/servicios?mes=${period}`} className="underline">
                    Ver servicios
                  </Link>
                </dd>
              </div>
              <div className="rounded-lg border p-3">
                <dt className="text-muted-foreground text-xs">Depósitos en garantía</dt>
                <dd className="mt-1 text-lg">
                  <Amount value={board.deposits.total} />
                </dd>
                <dd className="text-muted-foreground text-xs text-pretty">
                  {board.deposits.leases === 0
                    ? "Ningún contrato vigente tiene depósito."
                    : `Pactados en ${board.deposits.leases === 1 ? "1 contrato vigente" : `${board.deposits.leases} contratos vigentes`}. Son del inquilino: no cuentan como ingreso.`}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <MonthCloseCard
          period={period}
          missingCharges={board.missingCharges}
          pendingProofs={board.pendingProofs}
          openCharges={board.openCharges}
          overdueCount={board.overdueCount}
          servicesMissing={board.servicesMissing}
        />
      </div>

      {board.chargeCount === 0 ? (
        <EmptyState
          icon={Banknote}
          title={`Aún no hay cargos de ${periodLabel(period).toLowerCase()}`}
          description={
            board.activeLeases === 0
              ? "Cuando tengas contratos vigentes podrás generar aquí los cargos mensuales."
              : `Tienes ${board.activeLeases} contratos vigentes. Genera los cargos del mes para empezar a llevar la cobranza.`
          }
          actions={
            editable && board.activeLeases > 0 ? (
              <PaymentsToolbar
                period={period}
                periods={periods}
                missingCharges={board.missingCharges}
                editable={editable}
              />
            ) : undefined
          }
        />
      ) : (
        board.buildings.map((building) => (
          <Card key={building.id}>
            <CardHeader>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <CardTitle>
                    <Link
                      href={`/edificios/${building.id}`}
                      className="hover:underline"
                    >
                      {building.name}
                    </Link>
                  </CardTitle>
                  <CardDescription>
                    {building.charges.length}{" "}
                    {building.charges.length === 1 ? "cargo" : "cargos"} ·{" "}
                    <Amount value={building.collected} className="font-normal" /> cobrados
                  </CardDescription>
                </div>
                <Amount value={building.total} className="text-xl tracking-tight" />
              </div>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {building.charges.map((charge) => (
                  <li
                    key={charge.id}
                    className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/inquilinos/${charge.tenantId}`}
                        className="truncate text-sm font-medium hover:underline"
                      >
                        {charge.tenantName}
                      </Link>
                      <p className="text-muted-foreground text-xs">
                        Unidad {charge.unitCode} · vence el{" "}
                        {shortDate(charge.dueDate)}
                        {charge.paidAt
                          ? ` · pagado el ${shortDate(charge.paidAt)}${charge.method ? ` (${charge.method})` : ""}`
                          : ""}
                      </p>
                      {charge.status === "PARTIAL" ? (
                        <p className="text-muted-foreground text-xs">
                          Abonado <Amount value={charge.paidAmount} /> de{" "}
                          <Amount value={charge.amount} />
                        </p>
                      ) : null}
                    </div>

                    <div className="flex items-center justify-between gap-3 sm:justify-end">
                      <Amount value={charge.amount} className="text-sm" />
                      <StatusBadge tone={CHARGE_STATUS_TONES[charge.status]}>
                        {CHARGE_STATUS_LABELS[charge.status]}
                      </StatusBadge>
                      {charge.receiptUrl ? (
                        <ReceiptBadge
                          receiptUrl={charge.receiptUrl}
                          title={`${charge.tenantName} · ${money(charge.amount)}`}
                          subtitle={`Unidad ${charge.unitCode} · ${periodLabel(period)}`}
                        />
                      ) : null}
                      {charge.pendingProof ? (
                        <StatusBadge tone={PROOF_STATUS_TONES.SUBMITTED}>
                          Comprobante {PROOF_STATUS_LABELS.SUBMITTED.toLowerCase()}
                        </StatusBadge>
                      ) : null}
                      {editable && charge.pendingProof ? (
                        <ReviewProofDialog
                          proof={{
                            ...charge.pendingProof,
                            tenantName: charge.tenantName,
                            periodName: periodLabel(period),
                            place: `${building.name} · Unidad ${charge.unitCode}`,
                            remaining: remainingOf(charge.amount, charge.paidAmount),
                          }}
                        />
                      ) : null}
                      {editable ? (
                        <PaymentRowActions
                          chargeId={charge.id}
                          tenantName={charge.tenantName}
                          amount={charge.amount}
                          paidAmount={charge.paidAmount}
                        />
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))
      )}
    </>
  );
}

/**
 * Antes de cerrar un mes: lo que falta revisar del periodo. Todo sale de los
 * datos; no hay un "cierre" que guardar, solo una lista para no olvidar nada.
 */
function MonthCloseCard({
  period,
  missingCharges,
  pendingProofs,
  openCharges,
  overdueCount,
  servicesMissing,
}: {
  period: string;
  missingCharges: number;
  pendingProofs: number;
  openCharges: number;
  overdueCount: number;
  servicesMissing: number;
}) {
  const checks = [
    {
      id: "charges",
      done: missingCharges === 0,
      label:
        missingCharges === 0
          ? "Todos los contratos tienen su cargo"
          : missingCharges === 1
            ? "Falta generar 1 cargo de renta"
            : `Faltan generar ${missingCharges} cargos de renta`,
    },
    {
      id: "proofs",
      done: pendingProofs === 0,
      label:
        pendingProofs === 0
          ? "No hay comprobantes por revisar"
          : pendingProofs === 1
            ? "1 comprobante de inquilino por revisar"
            : `${pendingProofs} comprobantes de inquilinos por revisar`,
    },
    {
      id: "collections",
      done: openCharges === 0,
      label:
        openCharges === 0
          ? "No quedan cargos sin liquidar"
          : `${openCharges === 1 ? "1 cargo sin liquidar" : `${openCharges} cargos sin liquidar`}${
              overdueCount > 0 ? `, ${overdueCount === 1 ? "1 vencido" : `${overdueCount} vencidos`}` : ""
            }`,
    },
    {
      id: "services",
      done: servicesMissing === 0,
      label:
        servicesMissing === 0
          ? "Todos los servicios tienen monto"
          : servicesMissing === 1
            ? "1 servicio sin monto"
            : `${servicesMissing} servicios sin monto`,
      href: servicesMissing > 0 ? `/servicios?mes=${period}` : undefined,
    },
  ];
  const pending = checks.filter((check) => !check.done).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Antes de cerrar el mes</CardTitle>
        <CardDescription>
          {pending === 0
            ? `${periodLabel(period)} está completo: no falta nada por revisar.`
            : `Lo que falta revisar de ${periodLabel(period).toLowerCase()}.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {checks.map((check) => (
            <li key={check.id} className="flex items-start justify-between gap-3 text-sm">
              {check.href ? (
                <Link href={check.href} className="text-primary min-w-0 text-pretty underline-offset-4 hover:underline">
                  {check.label}
                </Link>
              ) : (
                <span className="min-w-0 text-pretty">{check.label}</span>
              )}
              <StatusBadge tone={check.done ? "success" : "warning"} className="shrink-0">
                {check.done ? "Listo" : "Pendiente"}
              </StatusBadge>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
