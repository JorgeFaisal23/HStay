import type { Metadata } from "next";
import { CreditCard, Receipt } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { StatCard } from "@/components/shared/stat-card";
import { Amount } from "@/components/shared/amount";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireOrgUser } from "@/lib/auth/session";
import { getPortalData } from "@/lib/queries/portal";
import { money, periodLabel, shortDate } from "@/lib/format";
import { CHARGE_STATUS_LABELS, CHARGE_STATUS_TONES } from "@/lib/labels";
import { ReceiptViewer } from "@/components/payments/receipt-viewer";
import { SubmitProofDialog } from "@/components/payments/submit-proof-dialog";
import { Callout } from "@/components/shared/callout";
import type { Currency } from "@/lib/currency";
import { PROOF_STATUS_LABELS, PROOF_STATUS_TONES } from "@/lib/labels";
import { remainingOf } from "@/lib/payments";

export const metadata: Metadata = { title: "Mis pagos" };

export default async function PortalPaymentsPage() {
  const { session, db } = await requireOrgUser(["TENANT"]);
  const data = await getPortalData(db, session.sub);

  const paid = data.charges.filter((c) => c.status === "PAID");

  return (
    <>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Mis pagos</h1>
        <p className="text-muted-foreground text-sm text-pretty">
          El historial de tus cargos de renta y su estado. Si ya pagaste, envía tu comprobante.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          label="Saldo pendiente"
          value={data.balance === 0 ? "Sin adeudo" : <Amount value={data.balance} currency={data.currency} />}
          hint={
            data.balance === 0
              ? "Estás al corriente"
              : "Suma de tus cargos sin liquidar"
          }
          icon={CreditCard}
          tone={data.balance > 0 ? "danger" : "brand"}
        />
        <StatCard
          label="Pagos registrados"
          value={String(paid.length)}
          hint={`De ${data.charges.length} cargos en total`}
          icon={Receipt}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Historial</CardTitle>
          <CardDescription>
            Si detectas algo que no corresponde, avísale al administrador.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.charges.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="Todavía no hay cargos"
              description="Cuando se genere el primer cargo de tu renta aparecerá aquí."
            />
          ) : (
            <ul className="divide-y">
              {data.charges.map((charge) => (
                <li
                  key={charge.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {periodLabel(charge.period)}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      Vence el {shortDate(charge.dueDate)}
                      {charge.paidAt
                        ? ` · pagado el ${shortDate(charge.paidAt)}`
                        : ""}
                      {charge.method ? ` · ${charge.method}` : ""}
                      {charge.reference ? ` · ${charge.reference}` : ""}
                    </p>
                    {charge.status === "PARTIAL" ? (
                      <p className="text-muted-foreground text-xs">
                        Abonado <Amount value={charge.paidAmount} currency={data.currency} /> · falta{" "}
                        <Amount value={charge.amount - charge.paidAmount} currency={data.currency} />
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <Amount value={charge.amount} currency={data.currency} className="text-sm" />
                    <StatusBadge tone={CHARGE_STATUS_TONES[charge.status]}>
                      {CHARGE_STATUS_LABELS[charge.status]}
                    </StatusBadge>
                    {charge.receiptUrl ? (
                      <ReceiptViewer
                        receiptUrl={charge.receiptUrl}
                        title={`Pago de ${periodLabel(charge.period)}`}
                        subtitle={`${money(charge.amount, data.currency)}${charge.method ? ` · ${charge.method}` : ""}`}
                      />
                    ) : null}
                  </div>
                  {charge.status !== "PAID" ? <ProofRow charge={charge} currency={data.currency} /> : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}

type PortalCharge = Awaited<ReturnType<typeof getPortalData>>["charges"][number];

/**
 * Comprobante de un cargo sin liquidar: enviarlo, verlo en revisión o, si lo
 * rechazaron, leer el motivo y enviar otro.
 */
function ProofRow({ charge, currency }: { charge: PortalCharge; currency: Currency }) {
  const proof = charge.lastProof;
  const remaining = remainingOf(charge.amount, charge.paidAmount);
  const dialog = (resend: boolean) => (
    <SubmitProofDialog
      chargeId={charge.id}
      periodName={periodLabel(charge.period)}
      remaining={remaining}
      resend={resend}
      currency={currency}
    />
  );

  if (proof?.status === "SUBMITTED") {
    return (
      <div className="flex basis-full flex-wrap items-center gap-2 text-xs">
        <StatusBadge tone={PROOF_STATUS_TONES.SUBMITTED}>
          Comprobante {PROOF_STATUS_LABELS.SUBMITTED.toLowerCase()}
        </StatusBadge>
        <span className="text-muted-foreground text-pretty">
          Enviado el {shortDate(proof.createdAt)} por <Amount value={proof.amount} currency={currency} className="font-normal" />.
          El pago cuenta cuando el administrador lo apruebe.
        </span>
      </div>
    );
  }

  if (proof?.status === "REJECTED") {
    return (
      <div className="basis-full space-y-2">
        <Callout tone="danger" title="Rechazaron tu comprobante">
          {proof.rejectionReason ?? "Revisa los datos y envía otro."}
        </Callout>
        {dialog(true)}
      </div>
    );
  }

  return <div className="basis-full">{dialog(false)}</div>;
}
