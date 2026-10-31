"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { SERVICE_TYPE_LABELS } from "@/lib/labels";
import { moneyCompact } from "@/lib/format";
import type { Currency } from "@/lib/currency";
import type { ServiceType } from "@/generated/prisma/enums";

/**
 * Gráficas de la sección de reportes.
 *
 * Los colores de las series llegan como valores concretos desde el servidor
 * (derivados del color de marca): Recharts los escribe como atributos de
 * presentación del SVG, donde `var(--token)` no se sustituye. Para ejes y
 * rejilla sí usamos `currentColor`, que en atributos sí hereda del CSS.
 */

/** Montos de las gráficas, sin centavos, en la moneda del reporte. */
const amountIn = (code: Currency) => (value: unknown) => moneyCompact(Number(value ?? 0), code);

const axisProps = {
  stroke: "currentColor",
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const;

const tooltipStyle = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  fontSize: 12,
  color: "var(--popover-foreground)",
} as const;

/** Contenedor que fija el color heredado por ejes y rejilla. */
function ChartFrame({
  height,
  children,
}: {
  height: number;
  children: React.ReactElement;
}) {
  return (
    <div className="text-muted-foreground w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

export function IncomeVsExpensesChart({
  data,
  colors,
  currency: code = "MXN",
}: {
  data: { label: string; income: number; expenses: number }[];
  colors: string[];
  currency?: Currency;
}) {
  const currency = amountIn(code);
  const [income, , , expenses] = colors;

  return (
    <ChartFrame height={260}>
      <AreaChart data={data} margin={{ left: 4, right: 4, top: 8 }}>
        <defs>
          <linearGradient id="fillIncome" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={income} stopOpacity={0.35} />
            <stop offset="100%" stopColor={income} stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="fillExpenses" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={expenses} stopOpacity={0.3} />
            <stop offset="100%" stopColor={expenses} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="currentColor" strokeOpacity={0.2} />
        <XAxis dataKey="label" {...axisProps} />
        <YAxis {...axisProps} width={64} tickFormatter={(v) => currency(v)} />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(value, name) => [
            currency(value),
            name === "income" ? "Renta facturada" : "Gasto en servicios",
          ]}
        />
        <Area
          type="monotone"
          dataKey="income"
          stroke={income}
          strokeWidth={2}
          fill="url(#fillIncome)"
        />
        <Area
          type="monotone"
          dataKey="expenses"
          stroke={expenses}
          strokeWidth={2}
          fill="url(#fillExpenses)"
        />
      </AreaChart>
    </ChartFrame>
  );
}

export function ProfitByBuildingChart({
  data,
  colors,
  currency: code = "MXN",
}: {
  data: { name: string; net: number }[];
  colors: string[];
  currency?: Currency;
}) {
  const currency = amountIn(code);
  return (
    <ChartFrame height={240}>
      <BarChart data={data} margin={{ left: 4, right: 4, top: 8 }}>
        <CartesianGrid vertical={false} stroke="currentColor" strokeOpacity={0.2} />
        <XAxis dataKey="name" {...axisProps} />
        <YAxis {...axisProps} width={64} tickFormatter={(v) => currency(v)} />
        <Tooltip
          cursor={{ fill: "currentColor", fillOpacity: 0.06 }}
          contentStyle={tooltipStyle}
          formatter={(value) => [currency(value), "Resultado neto"]}
        />
        <Bar dataKey="net" fill={colors[0]} radius={[6, 6, 0, 0]} maxBarSize={96} />
      </BarChart>
    </ChartFrame>
  );
}

export function ServiceBreakdownChart({
  data,
  colors,
  currency: code = "MXN",
}: {
  data: { type: string; amount: number }[];
  colors: string[];
  currency?: Currency;
}) {
  const currency = amountIn(code);
  const chartData = data.map((item) => ({
    name: SERVICE_TYPE_LABELS[item.type as ServiceType] ?? item.type,
    value: item.amount,
  }));

  return (
    <ChartFrame height={240}>
      <PieChart>
        <Pie
          data={chartData}
          dataKey="value"
          nameKey="name"
          innerRadius={52}
          outerRadius={84}
          paddingAngle={2}
        >
          {chartData.map((entry, index) => (
            <Cell key={entry.name} fill={colors[index % colors.length]} />
          ))}
        </Pie>
        <Legend
          verticalAlign="bottom"
          iconType="circle"
          formatter={(value) => (
            <span style={{ color: "var(--muted-foreground)", fontSize: 12 }}>
              {value}
            </span>
          )}
        />
        <Tooltip contentStyle={tooltipStyle} formatter={(value) => currency(value)} />
      </PieChart>
    </ChartFrame>
  );
}
