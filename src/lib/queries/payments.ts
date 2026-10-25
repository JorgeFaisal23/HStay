import type { OrgDb } from "@/lib/db/scoped";
import { toNumber } from "@/lib/format";
import { chargeableLeasesWhere } from "@/lib/payments";

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
                building: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    }),
    db.lease.count({ where: { status: "ACTIVE" } }),
  ]);

  // Lo demás del dinero del mes y lo que falta para cerrarlo.
  const [missingCharges, serviceCharges, deposits, servicesMissing] = await Promise.all([
    db.lease.count({ where: chargeableLeasesWhere(period) }),
    db.serviceCharge.aggregate({ where: { period }, _sum: { amount: true } }),
    db.lease.aggregate({
      where: { status: "ACTIVE", depositAmount: { gt: 0 } },
      _sum: { depositAmount: true },
      _count: true,
    }),
    db.serviceAccount.count({ where: { active: true, charges: { none: { period } } } }),
  ]);

  const groups = new Map<
    string,
    {
      id: string;
      name: string;
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
  const expected = buildings.reduce((sum, b) => sum + b.total, 0);
  const collected = buildings.reduce((sum, b) => sum + b.collected, 0);
  const overdue = charges.filter((c) => c.status === "OVERDUE");

  return {
    period,
    buildings,
    expected,
    collected,
    pending: expected - collected,
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
    servicesExpense: toNumber(serviceCharges._sum.amount ?? 0),
    /** Cuentas de servicio activas sin monto del mes. */
    servicesMissing,
    /**
     * Depósitos en garantía pactados en los contratos vigentes. Es dinero del
     * inquilino que se resguarda, no ingreso; la recepción y la devolución
     * todavía no se registran.
     */
    deposits: { total: toNumber(deposits._sum.depositAmount ?? 0), leases: deposits._count },
  };
}
