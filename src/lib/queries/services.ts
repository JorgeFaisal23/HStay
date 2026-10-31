import type { OrgDb } from "@/lib/db/scoped";
import { ACCOUNT_CURRENCY, accountCurrency, addMoney, totalByCurrency, type MoneyByCurrency } from "@/lib/currency";
import { toNumber, shiftPeriod } from "@/lib/format";
import { allocate } from "@/lib/services/allocation";
import type { ServiceType } from "@/generated/prisma/enums";
import { SERVICE_TYPE_ORDER } from "@/lib/labels";

/**
 * Tablero financiero de servicios para un periodo (YYYY-MM).
 *
 * Devuelve una matriz edificio → unidad → tipo de servicio, más los recibos a
 * nivel edificio con su prorrateo, los subtotales por propiedad y el
 * consolidado global.
 */

export type ServiceCell = {
  accountId: string;
  chargeId: string | null;
  amount: number | null;
  contractNumber: string | null;
  includedInRent: boolean;
};

export async function getServicesBoard(db: OrgDb, period: string) {
  const previousPeriod = shiftPeriod(period, -1);

  const [buildings, previousCharges] = await Promise.all([
    db.building.findMany({
      orderBy: { name: "asc" },
      include: {
        serviceAccounts: {
          where: { active: true },
          orderBy: { type: "asc" },
          include: { charges: { where: { period } } },
        },
        units: {
          orderBy: { code: "asc" },
          include: {
            serviceAccounts: {
              where: { active: true },
              orderBy: { type: "asc" },
              include: { charges: { where: { period } } },
            },
          },
        },
      },
    }),
    db.serviceCharge.findMany({
      where: { period: previousPeriod },
      select: { amount: true, serviceAccount: { select: ACCOUNT_CURRENCY } },
    }),
  ]);

  // Solo mostramos columnas de servicios que alguien realmente usa.
  const usedTypes = new Set<ServiceType>();
  for (const building of buildings) {
    for (const unit of building.units) {
      for (const account of unit.serviceAccounts) usedTypes.add(account.type);
    }
  }
  const columns = SERVICE_TYPE_ORDER.filter((type) => usedTypes.has(type));

  // Cada propiedad suma en su moneda; el total general se lleva por moneda.
  let grandTotal: MoneyByCurrency = {};
  let missingCount = 0;
  let totalAccounts = 0;

  const boards = buildings.map((building) => {
    // ---- recibos a nivel edificio, con su reparto entre unidades ocupadas
    const shareTargets = building.units
      .filter((u) => u.status !== "MAINTENANCE")
      .map((u) => ({ id: u.id, label: u.code, sizeM2: u.sizeM2 }));

    const buildingAccounts = building.serviceAccounts.map((account) => {
      const charge = account.charges[0];
      const amount = charge ? toNumber(charge.amount) : null;
      totalAccounts += 1;
      if (amount === null) missingCount += 1;

      return {
        accountId: account.id,
        type: account.type,
        providerName: account.providerName,
        contractNumber: account.contractNumber,
        includedInRent: account.includedInRent,
        splitMode: account.splitMode,
        chargeId: charge?.id ?? null,
        amount,
        allocation:
          amount === null
            ? []
            : allocate(amount, shareTargets, account.splitMode),
      };
    });

    const buildingLevelTotal = buildingAccounts.reduce(
      (sum, a) => sum + (a.amount ?? 0),
      0,
    );

    // ---- servicios propios de cada unidad
    const units = building.units.map((unit) => {
      const cells: Partial<Record<ServiceType, ServiceCell>> = {};
      let unitTotal = 0;

      for (const account of unit.serviceAccounts) {
        const charge = account.charges[0];
        const amount = charge ? toNumber(charge.amount) : null;
        totalAccounts += 1;
        if (amount === null) missingCount += 1;
        unitTotal += amount ?? 0;

        cells[account.type] = {
          accountId: account.id,
          chargeId: charge?.id ?? null,
          amount,
          contractNumber: account.contractNumber,
          includedInRent: account.includedInRent,
        };
      }

      return {
        id: unit.id,
        code: unit.code,
        name: unit.name,
        status: unit.status,
        cells,
        total: unitTotal,
      };
    });

    const unitsTotal = units.reduce((sum, u) => sum + u.total, 0);
    const total = unitsTotal + buildingLevelTotal;
    grandTotal = addMoney(grandTotal, building.currency, total);

    return {
      id: building.id,
      name: building.name,
      currency: building.currency,
      buildingAccounts,
      buildingLevelTotal,
      units,
      unitsTotal,
      total,
    };
  });

  const previousTotal = totalByCurrency(
    previousCharges,
    (c) => accountCurrency(c.serviceAccount),
    (c) => toNumber(c.amount),
  );

  return {
    period,
    previousPeriod,
    columns,
    buildings: boards,
    grandTotal,
    previousTotal,
    missingCount,
    totalAccounts,
  };
}
