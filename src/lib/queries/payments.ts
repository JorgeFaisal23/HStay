import type { OrgDb } from "@/lib/db/scoped";
import { toNumber } from "@/lib/format";
import {
  ACCOUNT_CURRENCY,
  UNIT_CURRENCY,
  accountCurrency,
  subtractMoney,
  totalByCurrency,
  type Currency,
} from "@/lib/currency";
import { chargeableLeasesWhere, periodBounds } from "@/lib/payments";

/** Cobros de renta de un periodo, agrupados por propiedad. */
export async function getPaymentsBoard(db: OrgDb, period: string) {
  const [charges, activeLeases] = await Promise.all([
    db.rentCharge.findMany({
      where: { period },
      orderBy: [
        { lease: { unit: { building: { name: "asc" } } } },
        { lease: { unit: { code: "asc" } } },
      ],
      select: {
        id: true,
        period: true,
        amount: true,
        paidAmount: true,
        status: true,
        dueDate: true,
        paidAt: true,
        method: true,
        reference: true,
        receiptUrl: true,
        proofs: {
          where: { status: "SUBMITTED" },
          select: { id: true, amount: true, method: true, reference: true, paidOn: true },
          take: 1,
        },
        lease: {
          select: {
            id: true,
            tenant: { select: { id: true, name: true } },
            unit: {
              select: {
                id: true,
                code: true,
                building: { select: { id: true, name: true, currency: true } },
              },
            },
          },
        },
      },
    }),
    db.lease.count({ where: { status: "ACTIVE" } }),
  ]);

  // Lo demás del dinero del mes y lo que falta para cerrarlo.
  const { start: monthStart, end: monthEnd } = periodBounds(period);
  const monthLimit = new Date(monthEnd.getFullYear(), monthEnd.getMonth(), monthEnd.getDate() + 1);

  // Montos con la moneda de su propiedad: los totales se llevan por moneda.
  const [missingCharges, serviceCharges, deposits, servicesMissing, repairs, pendingRepairExpenses] = await Promise.all([
    db.lease.count({ where: chargeableLeasesWhere(period) }),
    db.serviceCharge.findMany({
      where: { period },
      select: { amount: true, serviceAccount: { select: ACCOUNT_CURRENCY } },
    }),
    db.lease.findMany({
      where: { status: "ACTIVE", depositAmount: { gt: 0 } },
      select: { depositAmount: true, unit: { select: UNIT_CURRENCY } },
    }),
    db.serviceAccount.count({ where: { active: true, charges: { none: { period } } } }),
    // Reparaciones del mes: aprobadas cuentan como gasto; las pendientes se avisan.
    db.expense.findMany({
      where: { status: "APPROVED", spentOn: { gte: monthStart, lt: monthLimit } },
      select: { amount: true, unit: { select: UNIT_CURRENCY } },
    }),
    db.expense.count({ where: { status: "PENDING" } }),
  ]);

  const groups = new Map<
    string,
    {
      id: string;
      name: string;
      /** Moneda de la propiedad: la de todos sus cargos. */
      currency: Currency;
      charges: {
        id: string;
        tenantId: string;
        tenantName: string;
        unitId: string;
        unitCode: string;
        amount: number;
        paidAmount: number;
        status: (typeof charges)[number]["status"];
        dueDate: Date;
        paidAt: Date | null;
        method: string | null;
        receiptUrl: string | null;
        /** Comprobante del inquilino por revisar, si lo hay. */
        pendingProof: {
          id: string;
          amount: number;
          method: string;
          reference: string | null;
          paidOn: Date;
        } | null;
      }[];
      total: number;
      collected: number;
    }
  >();

  for (const charge of charges) {
    const building = charge.lease.unit.building;
    const group = groups.get(building.id) ?? {
      id: building.id,
      name: building.name,
      currency: building.currency,
      charges: [],
      total: 0,
      collected: 0,
    };

    const amount = toNumber(charge.amount);
    const paid = toNumber(charge.paidAmount);

    group.charges.push({
      id: charge.id,
      tenantId: charge.lease.tenant.id,
      tenantName: charge.lease.tenant.name,
      unitId: charge.lease.unit.id,
      unitCode: charge.lease.unit.code,
      amount,
      paidAmount: paid,
      status: charge.status,
      dueDate: charge.dueDate,
      paidAt: charge.paidAt,
      method: charge.method,
      receiptUrl: charge.receiptUrl,
      pendingProof: charge.proofs[0]
        ? { ...charge.proofs[0], amount: toNumber(charge.proofs[0].amount) }
        : null,
    });
    group.total += amount;
    group.collected += paid;
    groups.set(building.id, group);
  }

  const buildings = [...groups.values()];
  // Cada propiedad suma en su moneda; el total general se lleva por moneda.
  const expected = totalByCurrency(buildings, (b) => b.currency, (b) => b.total);
  const collected = totalByCurrency(buildings, (b) => b.currency, (b) => b.collected);
  const overdue = charges.filter((c) => c.status === "OVERDUE");

  return {
    period,
    buildings,
    expected,
    collected,
    pending: subtractMoney(expected, collected),
    overdueCount: overdue.length,
    chargeCount: charges.length,
    activeLeases,
    /** Contratos que deberían tener cargo este mes y no lo tienen (los que crea "Generar cargos"). */
    missingCharges,
    /** Comprobantes de inquilinos por revisar en los cargos del mes. */
    pendingProofs: charges.filter((c) => c.proofs.length > 0).length,
    /** Cargos del mes sin liquidar. */
    openCharges: charges.filter((c) => c.status !== "PAID").length,
    /** Gasto en servicios capturado del mes. */
    servicesExpense: totalByCurrency(
      serviceCharges,
      (c) => accountCurrency(c.serviceAccount),
      (c) => toNumber(c.amount),
    ),
    /** Gastos de reparación aprobados del mes. */
    repairsExpense: totalByCurrency(
      repairs,
      (r) => r.unit.building.currency,
      (r) => toNumber(r.amount),
    ),
    /** Gastos de reparación por aprobar (de cualquier mes). */
    pendingRepairExpenses,
    /** Cuentas de servicio activas sin monto del mes. */
    servicesMissing,
    /**
     * Depósitos en garantía pactados en los contratos vigentes. Es dinero del
     * inquilino que se resguarda, no ingreso; la recepción y la devolución
     * todavía no se registran.
     */
    deposits: {
      total: totalByCurrency(
        deposits,
        (l) => l.unit.building.currency,
        (l) => toNumber(l.depositAmount),
      ),
      leases: deposits.length,
    },
  };
}
