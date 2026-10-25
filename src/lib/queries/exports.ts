import type { OrgDb } from "@/lib/db/scoped";
import { csvAmount, toCsv } from "@/lib/csv";
import { periodLabel, toNumber } from "@/lib/format";
import { CHARGE_STATUS_LABELS, SERVICE_TYPE_LABELS } from "@/lib/labels";
import { TODAY_GROUPS } from "@/lib/today";
import { getTodayData } from "@/lib/queries/today";

/**
 * Reportes descargables (CSV). Cada uno sale de las mismas consultas y reglas
 * que su pantalla, siempre con el cliente con alcance de la arrendadora.
 */

export const EXPORTS = {
  pendientes: { title: "Pendientes de hoy", monthly: false },
  cobros: { title: "Cobros del mes", monthly: true },
  gastos: { title: "Gastos de servicios del mes", monthly: true },
} as const;

export type ExportKind = keyof typeof EXPORTS;

export function isExportKind(value: string): value is ExportKind {
  return Object.hasOwn(EXPORTS, value);
}

/** Lo mismo que muestra "Hoy", una fila por asunto. */
async function pendingCsv(db: OrgDb) {
  const { items } = await getTodayData(db);
  const groupTitle = new Map(TODAY_GROUPS.map((g) => [g.id, g.title]));
  return toCsv(
    ["Grupo", "Estado", "Asunto", "Propiedad", "Persona", "Rol", "Fecha", "Por cobrar", "Nota"],
    items.map((item) => [
      groupTitle.get(item.group),
      item.status,
      item.title,
      item.place,
      item.person?.name,
      item.person?.role,
      item.date ?? item.when,
      item.amount === undefined ? null : csvAmount(item.amount),
      item.note,
    ]),
  );
}

/** Cargos de renta del periodo con lo pagado y el saldo. */
async function chargesCsv(db: OrgDb, period: string) {
  const charges = await db.rentCharge.findMany({
    where: { period },
    orderBy: [{ lease: { unit: { building: { name: "asc" } } } }, { lease: { unit: { code: "asc" } } }],
    select: {
      period: true,
      dueDate: true,
      amount: true,
      paidAmount: true,
      status: true,
      paidAt: true,
      method: true,
      reference: true,
      lease: {
        select: {
          tenant: { select: { name: true } },
          unit: { select: { code: true, building: { select: { name: true } } } },
        },
      },
    },
  });
  return toCsv(
    ["Propiedad", "Unidad", "Inquilino", "Periodo", "Vence", "Cargo", "Pagado", "Saldo", "Estado", "Último pago", "Forma de pago", "Referencia"],
    charges.map((c) => {
      const amount = toNumber(c.amount);
      const paid = toNumber(c.paidAmount);
      return [
        c.lease.unit.building.name,
        c.lease.unit.code,
        c.lease.tenant.name,
        periodLabel(c.period),
        c.dueDate,
        csvAmount(amount),
        csvAmount(paid),
        csvAmount(Math.max(0, amount - paid)),
        CHARGE_STATUS_LABELS[c.status],
        c.paidAt,
        c.method,
        c.reference,
      ];
    }),
  );
}

/** Recibos de servicios capturados del periodo. */
async function expensesCsv(db: OrgDb, period: string) {
  const charges = await db.serviceCharge.findMany({
    where: { period },
    orderBy: { serviceAccount: { type: "asc" } },
    select: {
      period: true,
      amount: true,
      dueDate: true,
      status: true,
      paidAt: true,
      serviceAccount: {
        select: {
          type: true,
          providerName: true,
          contractNumber: true,
          includedInRent: true,
          building: { select: { name: true } },
          unit: { select: { code: true, building: { select: { name: true } } } },
        },
      },
    },
  });
  return toCsv(
    ["Propiedad", "Unidad", "Servicio", "Proveedor", "Contrato", "Periodo", "Monto", "Incluido en la renta", "Vence", "Estado", "Pagado el"],
    charges.map((c) => {
      const account = c.serviceAccount;
      return [
        account.building?.name ?? account.unit?.building.name,
        account.unit ? account.unit.code : "Todo el edificio",
        SERVICE_TYPE_LABELS[account.type],
        account.providerName,
        account.contractNumber,
        periodLabel(c.period),
        csvAmount(toNumber(c.amount)),
        account.includedInRent ? "Sí" : "No",
        c.dueDate,
        CHARGE_STATUS_LABELS[c.status],
        c.paidAt,
      ];
    }),
  );
}

export async function buildExport(db: OrgDb, kind: ExportKind, period: string) {
  switch (kind) {
    case "pendientes":
      return pendingCsv(db);
    case "cobros":
      return chargesCsv(db, period);
    case "gastos":
      return expensesCsv(db, period);
  }
}
