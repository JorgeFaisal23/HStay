import type { Metadata } from "next";
import { PiggyBank, Receipt, TrendingUp } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Amount } from "@/components/shared/amount";
import { PremiumGate } from "@/components/premium/premium-gate";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { requireOrgUser } from "@/lib/auth/session";
import { requireCurrentOrg } from "@/lib/org";
import { chartPalette } from "@/lib/brand";
import { getReportsData } from "@/lib/queries/reports";
import { moneyCompact, periodLabel, recentPeriods } from "@/lib/format";
import { ExportMenu } from "@/components/reports/export-menu";
import {
  IncomeVsExpensesChart,
  ProfitByBuildingChart,
  ServiceBreakdownChart,
} from "./report-charts";

export const metadata: Metadata = { title: "Reportes" };

export default async function ReportsPage() {
  const { db } = await requireOrgUser(["OWNER", "ADMIN"]);
  const [data, org] = await Promise.all([getReportsData(db), requireCurrentOrg()]);
  // Colores concretos derivados de la marca: Recharts no resuelve var() en los
  // atributos del SVG.
  const colors = chartPalette(org.primaryColor);

  const net = data.totals.income - data.totals.expenses;
  const margin =
    data.totals.income === 0
      ? 0
      : Math.round((net / data.totals.income) * 100);

  return (
    <>
      <PageHeader
        title="Reportes"
        description="Rentabilidad, ocupación y gasto de tus propiedades a lo largo del tiempo."
        action={
          <ExportMenu
            enabled={org.plan === "PREMIUM"}
            months={recentPeriods(2).map((period) => ({
              period,
              label: periodLabel(period).toLowerCase(),
            }))}
          />
        }
      />

      <PremiumGate
        title="Reportes y analítica"
        description="Mide la rentabilidad real de cada propiedad, compara meses y detecta en qué se te va el dinero."
      >
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Renta facturada (6 meses)"
              value={<Amount value={data.totals.income} compact />}
              hint={`${moneyCompact(data.totals.collected)} efectivamente cobrados`}
              icon={TrendingUp}
              tone="brand"
            />
            <StatCard
              label="Gasto en servicios"
              value={<Amount value={data.totals.expenses} compact />}
              hint="Agua, luz, internet y mantenimiento"
              icon={Receipt}
            />
            <StatCard
              label="Resultado neto"
              value={<Amount value={net} compact />}
              hint={`Margen del ${margin}%`}
              icon={PiggyBank}
            />
            <StatCard
              label="Ingreso por renta corta"
              value={<Amount value={data.totals.shortTermIncome} compact />}
              hint="Reservas confirmadas y completadas"
              icon={TrendingUp}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Ingresos contra gastos</CardTitle>
              <CardDescription>
                Renta facturada y gasto en servicios, mes a mes.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <IncomeVsExpensesChart data={data.monthly} colors={colors} />
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Resultado por propiedad</CardTitle>
                <CardDescription>
                  Cuánto deja cada inmueble después de servicios.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ProfitByBuildingChart data={data.byBuilding} colors={colors} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>En qué se va el gasto</CardTitle>
                <CardDescription>
                  Distribución por tipo de servicio.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ServiceBreakdownChart data={data.serviceBreakdown} colors={colors} />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Detalle por propiedad</CardTitle>
            </CardHeader>
            <CardContent>
              <Table className="min-w-2xl">
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">Propiedad</TableHead>
                    <TableHead scope="col" className="text-right">Ingresos</TableHead>
                    <TableHead scope="col" className="text-right">Gastos</TableHead>
                    <TableHead scope="col" className="text-right">Neto</TableHead>
                    <TableHead scope="col" className="text-right">Margen</TableHead>
                    <TableHead scope="col" className="w-40 pl-4">Ocupación</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.byBuilding.map((building) => (
                    <TableRow key={building.id}>
                      <TableCell className="font-medium">{building.name}</TableCell>
                      <TableCell className="text-right">
                        <Amount value={building.income} className="font-normal" />
                      </TableCell>
                      <TableCell className="text-right">
                        <Amount value={building.expenses} className="font-normal" />
                      </TableCell>
                      <TableCell className="text-right">
                        <Amount value={building.net} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {building.margin}%
                      </TableCell>
                      <TableCell className="pl-4">
                        <div className="flex items-center gap-2">
                          <Progress value={building.occupancy} className="flex-1" />
                          <span className="text-muted-foreground w-9 text-right text-xs tabular-nums">
                            {building.occupancy}%
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </PremiumGate>
    </>
  );
}
