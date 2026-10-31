import "server-only";
import { prisma } from "@/lib/prisma";
import { startOfToday } from "@/lib/payments";

/**
 * Barrido de vencimientos de una arrendadora:
 *
 * - Contratos vigentes cuyo vencimiento ya pasó → terminados; su unidad
 *   vuelve a estar disponible (salvo que esté en mantenimiento).
 * - Cargos pendientes cuya fecha de pago ya pasó → vencidos.
 *
 * Corre "perezoso": al abrir el panel o el portal, como máximo una vez por
 * hora por arrendadora. Así no hace falta un cron, y una arrendadora que
 * nadie abre no gasta nada. El turno se toma con una sola actualización
 * condicionada, así dos peticiones simultáneas no barren dos veces.
 */

const EVERY_MS = 60 * 60 * 1000;

export async function sweepOrg(orgId: string, now = new Date()) {
  const claimed = await prisma.organization.updateMany({
    where: {
      id: orgId,
      OR: [{ lastSweepAt: null }, { lastSweepAt: { lt: new Date(now.getTime() - EVERY_MS) } }],
    },
    data: { lastSweepAt: now },
  });
  if (claimed.count === 0) return { skipped: true as const };

  const today = startOfToday(now);

  const expired = await prisma.lease.findMany({
    where: { organizationId: orgId, status: "ACTIVE", endDate: { lt: today } },
    select: { id: true, unitId: true, tenant: { select: { name: true } } },
  });

  await prisma.$transaction(async (tx) => {
    for (const lease of expired) {
      await tx.lease.update({
        where: { id: lease.id },
        data: { status: "ENDED", endedAt: now, endReason: "Vencimiento" },
      });
      // Solo si no hay otro contrato vigente en la unidad (no debería).
      const other = await tx.lease.findFirst({
        where: { unitId: lease.unitId, status: "ACTIVE" },
        select: { id: true },
      });
      if (!other) {
        await tx.unit.updateMany({
          where: { id: lease.unitId, status: "OCCUPIED" },
          data: { status: "AVAILABLE" },
        });
      }
    }
  });

  const overdue = await prisma.rentCharge.updateMany({
    where: { organizationId: orgId, status: "PENDING", dueDate: { lt: today } },
    data: { status: "OVERDUE" },
  });

  if (expired.length > 0) {
    await prisma.auditLog.create({
      data: {
        organizationId: orgId,
        userId: null,
        action: "Contratos terminados por vencimiento",
        entity: "Lease",
        detail: expired.map((l) => l.tenant.name).join(", "),
      },
    });
  }

  return { skipped: false as const, endedLeases: expired.length, overdueCharges: overdue.count };
}

/** Para los layouts: el barrido nunca debe tumbar una página. */
export async function sweepOrgSafely(orgId: string) {
  try {
    await sweepOrg(orgId);
  } catch (error) {
    console.error("No se pudo correr el barrido de vencimientos:", error);
  }
}
