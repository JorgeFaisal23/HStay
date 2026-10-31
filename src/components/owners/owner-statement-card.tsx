import { Amount } from "@/components/shared/amount";
import { Callout } from "@/components/shared/callout";
import { ReceiptViewer } from "@/components/payments/receipt-viewer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { BuildingStatement } from "@/lib/queries/owners";
import { money, periodLabel, periodShortLabel, shortDate } from "@/lib/format";
import type { Currency } from "@/lib/currency";

/** Meses que se muestran en la tabla; el pendiente siempre considera todos. */
const VISIBLE_MONTHS = 12;

/**
 * Estado de cuenta de una propiedad para su propietario: lo pendiente de
 * entregar, el detalle por mes y las entregas. La usan el equipo (con
 * `actions` y `payoutAction`) y el propietario (solo lectura).
 */
export function OwnerStatementCard({
  title,
  description,
  statement,
  actions,
  payoutAction,
  receiptHref,
  currency = "MXN",
}: {
  title: string;
  /** Moneda de la propiedad: la de todo su estado de cuenta. */
  currency?: Currency;
  description?: string;
  statement: BuildingStatement;
  /** Acciones del equipo junto al pendiente (p. ej. "Registrar entrega"). */
  actions?: React.ReactNode;
  /** Acción por entrega (p. ej. deshacer), solo para el equipo. */
  payoutAction?: (payout: BuildingStatement["payouts"][number]) => React.ReactNode;
  /** Ruta de la foto del comprobante de una entrega. */
  receiptHref: (payoutId: string) => string;
}) {
  const { pending, totals, months, payouts, since } = statement;
  const visible = months.slice(0, VISIBLE_MONTHS);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          {description ? `${description} · ` : ""}Cuentas desde {periodLabel(since).toLowerCase()}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1">
            <p className="text-muted-foreground text-sm font-medium">Pendiente de entregar</p>
            <p className="text-3xl tracking-tight">
              <Amount value={pending} currency={currency} tone={pending < 0 ? "danger" : undefined} />
            </p>
            <p className="text-muted-foreground text-xs tabular-nums">
              Cobrado <Amount value={totals.income} currency={currency} className="font-medium" /> − gastos{" "}
              <Amount value={totals.expenses} currency={currency} className="font-medium" /> − entregado{" "}
              <Amount value={totals.payouts} currency={currency} className="font-medium" />
            </p>
          </div>
          {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
        </div>

        {pending < 0 ? (
          <Callout tone="warning">
            Se entregó más de lo cobrado, o los gastos superan lo cobrado. La diferencia se descuenta de
            los próximos meses.
          </Callout>
        ) : null}

        <div className="space-y-2">
          <h3 className="text-sm font-medium">Por mes</h3>
          <Table className="min-w-xl">
            <TableHeader>
              <TableRow>
                <TableHead>Mes</TableHead>
                <TableHead className="text-right">Rentas</TableHead>
                <TableHead className="text-right">Reservas</TableHead>
                <TableHead className="text-right">Gastos</TableHead>
                <TableHead className="text-right">Neto</TableHead>
                <TableHead className="text-right">Entregado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((month) => (
                <TableRow key={month.period}>
                  <TableCell className="capitalize">{periodShortLabel(month.period)}</TableCell>
                  <TableCell className="text-right">
                    <Amount value={month.rent} currency={currency} className="font-normal" />
                  </TableCell>
                  <TableCell className="text-right">
                    <Amount value={month.bookings} currency={currency} className="font-normal" />
                  </TableCell>
                  <TableCell
                    className="text-right"
                    title={`Reparaciones ${money(month.repairs, currency)} · servicios ${money(month.services, currency)}`}
                  >
                    <Amount value={month.expenses} currency={currency} className="font-normal" />
                  </TableCell>
                  <TableCell className="text-right">
                    <Amount value={month.net} currency={currency} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Amount value={month.payouts} currency={currency} className="font-normal" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="text-muted-foreground text-xs text-pretty">
            Rentas: pagos recibidos en el mes. Reservas: total de las estancias que terminaron en el mes.
            Gastos: reparaciones aprobadas y servicios incluidos en la renta.
            {months.length > VISIBLE_MONTHS ? ` Se muestran los últimos ${VISIBLE_MONTHS} meses; el pendiente incluye todos.` : ""}
          </p>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-medium">Entregas</h3>
          {payouts.length === 0 ? (
            <p className="text-muted-foreground text-sm">Todavía no hay entregas registradas.</p>
          ) : (
            <ul className="divide-y">
              {payouts.map((payout) => (
                <li key={payout.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <p className="text-sm">
                      <Amount value={payout.amount} currency={currency} /> · {payout.method}
                    </p>
                    <p className="text-muted-foreground truncate text-xs">
                      {shortDate(payout.paidOn)}
                      {payout.reference ? ` · ${payout.reference}` : ""}
                      {payout.notes ? ` · ${payout.notes}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {payout.hasReceipt ? (
                      <ReceiptViewer
                        receiptUrl={receiptHref(payout.id)}
                        title="Comprobante de la entrega"
                        subtitle={shortDate(payout.paidOn)}
                      />
                    ) : null}
                    {payoutAction?.(payout)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
