import type { OrgDb } from "@/lib/db/scoped";
import { toNumber, daysBetween } from "@/lib/format";

/**
 * Datos del portal del inquilino.
 *
 * Todo se filtra por el id de la sesión en el servidor: el portal nunca recibe
 * información de otras unidades ni de otros inquilinos.
 */
export async function getPortalData(db: OrgDb, userId: string) {
  const now = new Date();

  const [lease, booking, organization, rentCharges] = await Promise.all([
    db.lease.findFirst({
      where: { tenantId: userId, status: "ACTIVE" },
      select: {
        id: true,
        startDate: true,
        endDate: true,
        rentAmount: true,
        depositAmount: true,
        paymentDay: true,
        unit: {
          select: {
            id: true,
            code: true,
            type: true,
            bedrooms: true,
            bathrooms: true,
            sizeM2: true,
            description: true,
            building: { select: { name: true, address: true, city: true } },
            serviceAccounts: {
              select: {
                type: true,
                includedInRent: true,
                providerName: true,
                contractNumber: true,
              },
            },
          },
        },
      },
    }),
    // Un huésped de estancia corta ve su reserva en vez de un contrato.
    db.booking.findFirst({
      where: {
        guestUserId: userId,
        status: "CONFIRMED",
        checkOut: { gte: now },
      },
      orderBy: { checkIn: "asc" },
      select: {
        id: true,
        guestName: true,
        checkIn: true,
        checkOut: true,
        guests: true,
        totalAmount: true,
        source: true,
        unit: {
          select: {
            code: true,
            building: { select: { name: true, address: true } },
          },
        },
      },
    }),
    db.organization.findFirst({
      select: { brandName: true, contactEmail: true, contactPhone: true },
    }),
    // Cargos de todos sus contratos: si un contrato terminó con saldo
    // pendiente, el inquilino lo sigue viendo.
    db.rentCharge.findMany({
      where: { lease: { tenantId: userId } },
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
        // El último comprobante que envió: si está en revisión o si lo rechazaron.
        proofs: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { status: true, amount: true, rejectionReason: true, createdAt: true },
        },
      },
    }),
  ]);

  const charges = rentCharges.map((c) => ({
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
      lastProof: c.proofs[0]
        ? {
            status: c.proofs[0].status,
            amount: toNumber(c.proofs[0].amount),
            rejectionReason: c.proofs[0].rejectionReason,
            createdAt: c.proofs[0].createdAt,
          }
        : null,
    }));

  const nextCharge =
    charges
      .filter((c) => c.status !== "PAID")
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())[0] ?? null;

  return {
    organization,
    lease: lease
      ? {
          id: lease.id,
          startDate: lease.startDate,
          endDate: lease.endDate,
          daysLeft: daysBetween(now, lease.endDate),
          rentAmount: toNumber(lease.rentAmount),
          depositAmount: toNumber(lease.depositAmount),
          paymentDay: lease.paymentDay,
          unit: {
            id: lease.unit.id,
            code: lease.unit.code,
            type: lease.unit.type,
            bedrooms: lease.unit.bedrooms,
            bathrooms: lease.unit.bathrooms,
            sizeM2: lease.unit.sizeM2,
            description: lease.unit.description,
            buildingName: lease.unit.building.name,
            buildingAddress: lease.unit.building.address,
            city: lease.unit.building.city,
          },
          services: lease.unit.serviceAccounts.map((s) => ({
            type: s.type,
            includedInRent: s.includedInRent,
            providerName: s.providerName,
            contractNumber: s.contractNumber,
          })),
        }
      : null,
    booking: booking
      ? {
          id: booking.id,
          guestName: booking.guestName,
          checkIn: booking.checkIn,
          checkOut: booking.checkOut,
          guests: booking.guests,
          totalAmount: toNumber(booking.totalAmount),
          source: booking.source,
          unitCode: booking.unit.code,
          buildingName: booking.unit.building.name,
          buildingAddress: booking.unit.building.address,
        }
      : null,
    charges,
    nextCharge,
    balance: charges
      .filter((c) => c.status !== "PAID")
      .reduce((sum, c) => sum + c.amount - c.paidAmount, 0),
  };
}
