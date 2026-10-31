import { prisma } from "@/lib/prisma";
import { toNumber, daysBetween, periodKey } from "@/lib/format";
import { suggestRenewal, utcDay } from "@/lib/services/lease-renewal";

/** Listado de inquilinos con el estado de su contrato y de su último pago. */
export async function getTenants(organizationId?: string | null) {
  const now = new Date();
  const period = periodKey(now);

  const tenants = await prisma.user.findMany({
    where: {
      role: "TENANT",
      ...(organizationId ? { organizationId } : {}),
    },
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
              building: { select: { name: true } },
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
      endDate: lease?.endDate ?? null,
      daysLeft: lease ? daysBetween(now, lease.endDate) : null,
      currentChargeStatus: charge?.status ?? null,
    };
  });
}

export async function getTenantDetail(
  tenantId: string,
  organizationId?: string | null,
) {
  const tenant = await prisma.user.findFirst({
    where: {
      id: tenantId,
      role: "TENANT",
      ...(organizationId ? { organizationId } : {}),
    },
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
          rentAmount: true,
          depositAmount: true,
          paymentDay: true,
          notes: true,
          unit: {
            select: {
              id: true,
              code: true,
              baseRent: true,
              currency: true,
              building: { select: { id: true, name: true, address: true } },
              leases: {
                where: { status: "ACTIVE" },
                select: { id: true },
              },
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
  const today = utcDay(new Date());
  const allLeases = tenant.leases;

  // Datos que necesitan las acciones de editar / renovar / terminar.
  function leaseTerms(l: (typeof allLeases)[number]) {
    const startDate = utcDay(l.startDate);
    const endDate = utcDay(l.endDate);
    // Se renueva el contrato más reciente de cada unidad, y solo si la unidad
    // no tiene ya otro contrato vigente.
    const isLatestForUnit = !allLeases.some(
      (other) => other.unit.id === l.unit.id && other.startDate > l.startDate,
    );
    const otherActive = l.unit.leases.some((a) => a.id !== l.id);
    return {
      id: l.id,
      status: l.status,
      currency: l.unit.currency,
      startDate,
      endDate,
      rentAmount: toNumber(l.rentAmount),
      depositAmount: l.depositAmount === null ? null : toNumber(l.depositAmount),
      paymentDay: l.paymentDay,
      notes: l.notes,
      canRenew: l.status !== "CANCELLED" && isLatestForUnit && !otherActive,
      renewal: suggestRenewal(startDate, endDate, today),
    };
  }

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
          notes: activeLease.notes,
          terms: leaseTerms(activeLease),
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
          charges: activeLease.rentCharges.map((c) => ({
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
          })),
        }
      : null,
    // Todos los demás contratos: los terminados y, si renta más de una unidad,
    // sus otros contratos vigentes.
    otherLeases: allLeases
      .filter((l) => l.id !== activeLease?.id)
      .map((l) => ({
        ...leaseTerms(l),
        unitId: l.unit.id,
        unitCode: l.unit.code,
        buildingName: l.unit.building.name,
      })),
  };
}

/** Unidades sin contrato activo, para asignar un inquilino nuevo. */
export async function getAssignableUnits(organizationId?: string | null) {
  const units = await prisma.unit.findMany({
    where: {
      status: { in: ["AVAILABLE", "OCCUPIED"] },
      leases: { none: { status: "ACTIVE" } },
      ...(organizationId ? { building: { organizationId } } : {}),
    },
    orderBy: [{ building: { name: "asc" } }, { code: "asc" }],
    select: {
      id: true,
      code: true,
      baseRent: true,
      building: { select: { name: true } },
    },
  });

  return units.map((unit) => ({
    id: unit.id,
    code: unit.code,
    buildingName: unit.building.name,
    baseRent: toNumber(unit.baseRent),
  }));
}
