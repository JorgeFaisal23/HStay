import type { OrgDb } from "@/lib/db/scoped";
import { toNumber, daysBetween, periodKey } from "@/lib/format";

/** Listado de inquilinos con el estado de su contrato y de su último pago. */
export async function getTenants(db: OrgDb) {
  const now = new Date();
  const period = periodKey(now);

  const tenants = await db.user.findMany({
    where: { role: "TENANT" },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      active: true,
      leases: {
        where: { status: "ACTIVE" },
        take: 1,
        select: {
          id: true,
          endDate: true,
          rentAmount: true,
          unit: {
            select: {
              id: true,
              code: true,
              building: { select: { name: true, currency: true } },
            },
          },
          rentCharges: {
            where: { period },
            select: { status: true },
            take: 1,
          },
        },
      },
    },
  });

  return tenants.map((tenant) => {
    const lease = tenant.leases[0];
    const charge = lease?.rentCharges[0];

    return {
      id: tenant.id,
      name: tenant.name,
      email: tenant.email,
      phone: tenant.phone,
      active: tenant.active,
      hasLease: Boolean(lease),
      unitCode: lease?.unit.code ?? null,
      unitId: lease?.unit.id ?? null,
      buildingName: lease?.unit.building.name ?? null,
      rentAmount: lease ? toNumber(lease.rentAmount) : null,
      currency: lease?.unit.building.currency ?? "MXN",
      endDate: lease?.endDate ?? null,
      daysLeft: lease ? daysBetween(now, lease.endDate) : null,
      currentChargeStatus: charge?.status ?? null,
    };
  });
}

export async function getTenantDetail(db: OrgDb, tenantId: string) {
  const tenant = await db.user.findFirst({
    where: { id: tenantId, role: "TENANT" },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      documentId: true,
      notes: true,
      active: true,
      createdAt: true,
      leases: {
        orderBy: { startDate: "desc" },
        select: {
          id: true,
          status: true,
          startDate: true,
          endDate: true,
          endReason: true,
          rentAmount: true,
          depositAmount: true,
          paymentDay: true,
          unit: {
            select: {
              id: true,
              code: true,
              baseRent: true,
              building: { select: { id: true, name: true, address: true, currency: true } },
              serviceAccounts: {
                select: {
                  type: true,
                  includedInRent: true,
                  contractNumber: true,
                  providerName: true,
                },
              },
            },
          },
          rentCharges: {
            orderBy: { period: "desc" },
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
            },
          },
        },
      },
    },
  });

  if (!tenant) return null;

  const activeLease = tenant.leases.find((l) => l.status === "ACTIVE") ?? null;

  return {
    id: tenant.id,
    name: tenant.name,
    email: tenant.email,
    phone: tenant.phone,
    documentId: tenant.documentId,
    notes: tenant.notes,
    active: tenant.active,
    createdAt: tenant.createdAt,
    activeLease: activeLease
      ? {
          id: activeLease.id,
          startDate: activeLease.startDate,
          endDate: activeLease.endDate,
          rentAmount: toNumber(activeLease.rentAmount),
          depositAmount: toNumber(activeLease.depositAmount),
          paymentDay: activeLease.paymentDay,
          currency: activeLease.unit.building.currency,
          daysLeft: daysBetween(new Date(), activeLease.endDate),
          unit: {
            id: activeLease.unit.id,
            code: activeLease.unit.code,
            buildingId: activeLease.unit.building.id,
            buildingName: activeLease.unit.building.name,
            buildingAddress: activeLease.unit.building.address,
          },
          services: activeLease.unit.serviceAccounts.map((s) => ({
            type: s.type,
            includedInRent: s.includedInRent,
            contractNumber: s.contractNumber,
            providerName: s.providerName,
          })),
        }
      : null,
    // Cargos de todos sus contratos: un adeudo no desaparece de la ficha
    // porque el contrato haya terminado.
    charges: tenant.leases
      .flatMap((l) =>
        l.rentCharges.map((c) => ({
          id: c.id,
          period: c.period,
          amount: toNumber(c.amount),
          paidAmount: toNumber(c.paidAmount),
          status: c.status,
          dueDate: c.dueDate,
          paidAt: c.paidAt,
          method: c.method,
          reference: c.reference,
          receiptUrl: c.receiptUrl,
          unitCode: l.unit.code,
          current: l.status === "ACTIVE",
          currency: l.unit.building.currency,
        })),
      )
      .sort((x, y) => y.period.localeCompare(x.period)),
    pastLeases: tenant.leases
      .filter((l) => l.status !== "ACTIVE")
      .map((l) => ({
        id: l.id,
        status: l.status,
        startDate: l.startDate,
        endDate: l.endDate,
        endReason: l.endReason,
        unitCode: l.unit.code,
        buildingName: l.unit.building.name,
      })),
  };
}

/** Unidades sin contrato activo, para asignar un inquilino nuevo. */
export async function getAssignableUnits(db: OrgDb) {
  const units = await db.unit.findMany({
    where: {
      status: { in: ["AVAILABLE", "OCCUPIED"] },
      leases: { none: { status: "ACTIVE" } },
    },
    orderBy: [{ building: { name: "asc" } }, { code: "asc" }],
    select: {
      id: true,
      code: true,
      baseRent: true,
      building: { select: { name: true, currency: true } },
    },
  });

  return units.map((unit) => ({
    id: unit.id,
    code: unit.code,
    buildingName: unit.building.name,
    baseRent: toNumber(unit.baseRent),
    currency: unit.building.currency,
  }));
}

/** Inquilinos activos sin contrato vigente: a quiénes se les puede asignar unidad. */
export async function getTenantsWithoutLease(db: OrgDb) {
  return db.user.findMany({
    where: { role: "TENANT", active: true, leases: { none: { status: "ACTIVE" } } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true },
  });
}
