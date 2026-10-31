import type { Metadata } from "next";
import Link from "next/link";
import { Receipt, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Amount, Amounts } from "@/components/shared/amount";
import { anyNegative, hasMoney, moneyEntries, subtractMoney } from "@/lib/currency";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireOrgUser } from "@/lib/auth/session";
import { canEdit } from "@/lib/permissions";
import { getServicesBoard } from "@/lib/queries/services";
import { moneyCompact, moneyTotals, periodKey, periodLabel, recentPeriods } from "@/lib/format";
import { SERVICE_TYPE_LABELS } from "@/lib/labels";
import { AmountInput } from "./amount-input";
import { PeriodToolbar } from "./period-toolbar";

export const metadata: Metadata = { title: "Servicios" };

export default async function ServicesPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { session, db } = await requireOrgUser(["OWNER", "ADMIN"]);
  const { mes } = await searchParams;

  const periods = recentPeriods(12);
  const period = mes && periods.includes(mes) ? mes : periodKey(new Date());

  const board = await getServicesBoard(db, period);
  const editable = canEdit(session.role);

  // Diferencia contra el mes pasado, moneda por moneda.
  const difference = subtractMoney(board.grandTotal, board.previousTotal);
  const hasPrevious = hasMoney(board.previousTotal);
  const differenceText = moneyEntries(difference)
    .map(([c, value]) => `${value >= 0 ? "+" : "−"}${moneyCompact(Math.abs(value), c)}`)
    .join(" · ");
  const growing = !anyNegative(difference);
  const capturedCount = board.totalAccounts - board.missingCount;

  return (
    <>
      <PageHeader
        title="Servicios"
        description="Captura lo que cuesta cada servicio y consulta el gasto por propiedad y el total consolidado."
        action={
          <PeriodToolbar
            period={period}
            periods={periods}
            previousPeriod={board.previousPeriod}
            missingCount={board.missingCount}
            editable={editable}
          />
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label={`Total consolidado · ${periodLabel(period)}`}
          value={<Amounts value={board.grandTotal} compact />}
          hint={`${board.buildings.length} ${board.buildings.length === 1 ? "propiedad" : "propiedades"}`}
          icon={Wallet}
          tone="brand"
        />
        <StatCard
          label={`Comparado con ${periodLabel(board.previousPeriod).toLowerCase()}`}
          value={
            hasPrevious
              ? differenceText
              : "Sin referencia"
          }
          hint={
            hasPrevious
              ? `El mes pasado fueron ${moneyTotals(board.previousTotal, { compact: true })}`
              : "No hay montos capturados el mes anterior"
          }
          icon={growing ? TrendingUp : TrendingDown}
        />
        <StatCard
          label="Avance de captura"
          value={`${capturedCount}/${board.totalAccounts}`}
          hint={
            board.missingCount === 0
              ? "Todos los servicios tienen monto"
              : `Faltan ${board.missingCount} por capturar`
          }
          icon={Receipt}
          tone={board.missingCount > 0 ? "danger" : "default"}
        />
      </div>

      {board.buildings.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="Todavía no hay propiedades"
          description="Registra una propiedad y sus unidades para empezar a llevar el control de los servicios."
        />
      ) : (
        board.buildings.map((building) => (
          <Card key={building.id} className="overflow-hidden">
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
                    {building.units.length}{" "}
                    {building.units.length === 1 ? "unidad" : "unidades"} ·
                    Escribe directamente sobre los montos para editarlos.
                  </CardDescription>
                </div>
                <div className="text-right">
                  <p className="text-muted-foreground text-xs">
                    Total de la propiedad
                  </p>
                  <p className="text-xl">
                    <Amount value={building.total} currency={building.currency} />
                  </p>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-6">
              {/* ------------------------------------ servicios por unidad */}
              {building.units.length === 0 ? (
                <EmptyState
                  title="Esta propiedad no tiene unidades"
                  description="Agrega cuartos o departamentos para capturar sus servicios."
                />
              ) : (
                <Table className="min-w-xl">
                  <caption className="sr-only">
                    Montos de servicios por unidad en {periodLabel(period)}
                  </caption>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead scope="col" className="pr-3">
                        Unidad
                      </TableHead>
                      {board.columns.map((type) => (
                        <TableHead key={type} scope="col" className="text-right">
                          {SERVICE_TYPE_LABELS[type]}
                        </TableHead>
                      ))}
                      <TableHead scope="col" className="pl-3 text-right">
                        Subtotal
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {building.units.map((unit) => (
                      <TableRow key={unit.id}>
                        <th scope="row" className="py-1.5 pr-3 pl-2 text-left font-normal">
                          <Link
                            href={`/unidades/${unit.id}`}
                            className="hover:underline"
                          >
                            <span className="font-medium">{unit.code}</span>
                          </Link>
                        </th>
                        {board.columns.map((type) => {
                          const cell = unit.cells[type];
                          return (
                            <TableCell key={type} className="px-1 py-1.5">
                              {cell ? (
                                <AmountInput
                                  accountId={cell.accountId}
                                  period={period}
                                  initialAmount={cell.amount}
                                  label={`${SERVICE_TYPE_LABELS[type]} de la unidad ${unit.code}`}
                                  editable={editable}
                                />
                              ) : (
                                <span
                                  className="text-muted-foreground/40 block text-right"
                                  title="Esta unidad no tiene contratado este servicio"
                                >
                                  ·
                                </span>
                              )}
                            </TableCell>
                          );
                        })}
                        <TableCell className="py-1.5 pl-3 text-right">
                          {unit.total === 0 ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <Amount value={unit.total} currency={building.currency} className="font-medium" />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter className="bg-transparent">
                    <TableRow className="hover:bg-transparent">
                      <th scope="row" className="py-2 pr-3 pl-2 text-left font-medium">
                        Subtotal por unidades
                      </th>
                      <TableCell colSpan={board.columns.length} />
                      <TableCell className="pl-3 text-right">
                        <Amount value={building.unitsTotal} currency={building.currency} />
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              )}

              {/* ------------------------------- recibos de toda la propiedad */}
              {building.buildingAccounts.length > 0 ? (
                <div className="space-y-3">
                  <div>
                    <h3 className="text-sm font-medium">
                      Recibos de toda la propiedad
                    </h3>
                    <p className="text-muted-foreground text-xs text-pretty">
                      Llegan a nombre del edificio completo y se reparten entre
                      las unidades habitables.
                    </p>
                  </div>

                  <ul className="grid gap-3 md:grid-cols-2">
                    {building.buildingAccounts.map((account) => (
                      <li
                        key={account.accountId}
                        className="space-y-3 rounded-lg border p-3"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium">
                              {SERVICE_TYPE_LABELS[account.type]}
                            </p>
                            <p className="text-muted-foreground truncate text-xs">
                              {account.providerName ?? "Sin proveedor"} ·
                              Contrato {account.contractNumber ?? "—"}
                            </p>
                          </div>
                          <div className="w-28 shrink-0">
                            <AmountInput
                              accountId={account.accountId}
                              period={period}
                              initialAmount={account.amount}
                              label={`${SERVICE_TYPE_LABELS[account.type]} de ${building.name}`}
                              editable={editable}
                            />
                          </div>
                        </div>

                        {account.allocation.length > 0 ? (
                          <details className="group">
                            <summary className="text-muted-foreground hover:text-foreground cursor-pointer list-none text-xs">
                              Ver reparto entre {account.allocation.length}{" "}
                              unidades
                              <span className="ml-1 inline-block transition-transform group-open:rotate-90">
                                ›
                              </span>
                            </summary>
                            <ul className="text-muted-foreground mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
                              {account.allocation.map((share) => (
                                <li
                                  key={share.id}
                                  className="flex justify-between gap-2 tabular-nums"
                                >
                                  <span>{share.label}</span>
                                  <Amount value={share.amount} currency={building.currency} className="font-normal" />
                                </li>
                              ))}
                            </ul>
                          </details>
                        ) : null}

                        {account.includedInRent ? (
                          <StatusBadge tone="success">
                            Incluido en la renta
                          </StatusBadge>
                        ) : (
                          <StatusBadge tone="neutral">
                            Se cobra aparte
                          </StatusBadge>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ))
      )}

      {/* ------------------------------------------- consolidado global */}
      {board.buildings.length > 0 ? (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">
                Total consolidado de {periodLabel(period).toLowerCase()}
              </p>
              <p className="text-muted-foreground text-xs text-pretty">
                Suma de todas las propiedades, incluyendo recibos de edificio y
                servicios por unidad.
              </p>
            </div>
            <p className="text-3xl">
              <Amounts value={board.grandTotal} />
            </p>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
