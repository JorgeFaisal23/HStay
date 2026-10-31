"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserAction } from "@/lib/auth/session";
import { periodToDate } from "@/lib/format";
import { rentDueDate } from "@/lib/services/rent-schedule";
import { logAction } from "@/server/actions/audit";
import { saveFile } from "@/lib/storage";
import type { ActionResult } from "@/server/actions/properties";

const PERIOD = /^\d{4}-\d{2}$/;

/**
 * Genera los cargos de renta del periodo para todos los contratos vigentes que
 * aún no lo tengan. Es idempotente: correrlo dos veces no duplica cargos.
 */
export async function generateMonthlyCharges(
  period: string,
): Promise<ActionResult & { created?: number }> {
  const session = await requireUserAction(["OWNER", "ADMIN"]);
  if (!PERIOD.test(period)) return { error: "Periodo no válido." };

  const monthStart = periodToDate(period);
  const monthEnd = new Date(
    monthStart.getFullYear(),
    monthStart.getMonth() + 1,
    0,
  );

  const leases = await prisma.lease.findMany({
    where: {
      status: "ACTIVE",
      startDate: { lte: monthEnd },
      endDate: { gte: monthStart },
      rentCharges: { none: { period } },
      ...(session.organizationId ? { unit: { building: { organizationId: session.organizationId } } } : {}),
    },
    select: { id: true, rentAmount: true, paymentDay: true },
  });

  if (leases.length === 0) return { ok: true, created: 0 };

  await prisma.rentCharge.createMany({
    data: leases.map((lease) => ({
      leaseId: lease.id,
      period,
      // Si el contrato dice "día 31" y el mes tiene 30, se cobra el último día.
      dueDate: rentDueDate(period, lease.paymentDay),
      amount: lease.rentAmount,
      status: "PENDING",
    })),
    skipDuplicates: true,
  });

  await logAction(
    session.sub,
    "Generación de cargos de renta",
    "RentCharge",
    undefined,
    `${period}: ${leases.length} cargos`,
    session.organizationId,
  );

  revalidatePath("/pagos");
  revalidatePath("/dashboard");
  return { ok: true, created: leases.length };
}

/**
 * Formatos aceptados para el comprobante. El navegador siempre manda JPEG
 * (ver src/lib/images.ts); la lista es la red de seguridad del servidor.
 */
const RECEIPT_PATTERN = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const MAX_RECEIPT_CHARS = 1_400_000; // ~1 MB de imagen ya en base64

/** Marca un cargo como pagado por su totalidad, con comprobante opcional. */
export async function markChargePaid(input: {
  chargeId: string;
  method: string;
  reference?: string;
  receiptUrl?: string;
}): Promise<ActionResult> {
  const session = await requireUserAction(["OWNER", "ADMIN"]);

  const charge = await prisma.rentCharge.findFirst({
    where: {
      id: input.chargeId,
      ...(session.organizationId ? { lease: { unit: { building: { organizationId: session.organizationId } } } } : {}),
    },
    select: { amount: true, lease: { select: { tenantId: true } } },
  });
  if (!charge) return { error: "No se encontró el cargo." };

  const receipt = input.receiptUrl?.trim();
  let storedReceiptUrl: string | undefined;
  if (receipt) {
    if (receipt.length > MAX_RECEIPT_CHARS) {
      return { error: "El comprobante es demasiado pesado." };
    }
    if (!RECEIPT_PATTERN.test(receipt)) {
      return { error: "El comprobante debe ser una imagen." };
    }
    try {
      storedReceiptUrl = await saveFile(receipt, "receipts", `charge_${input.chargeId}`);
    } catch {
      return { error: "No se pudo almacenar el comprobante." };
    }
  }

  await prisma.rentCharge.update({
    where: { id: input.chargeId },
    data: {
      status: "PAID",
      paidAmount: charge.amount,
      paidAt: new Date(),
      method: input.method,
      reference: input.reference ?? null,
      ...(storedReceiptUrl ? { receiptUrl: storedReceiptUrl } : {}),
    },
  });

  await logAction(
    session.sub,
    "Registro de pago",
    "RentCharge",
    input.chargeId,
    input.method,
    session.organizationId,
  );

  revalidatePath("/pagos");
  revalidatePath("/dashboard");
  revalidatePath("/portal/pagos");
  revalidatePath(`/inquilinos/${charge.lease.tenantId}`);
  return { ok: true };
}

/** Deshace un pago registrado por error. */
export async function markChargeUnpaid(chargeId: string): Promise<ActionResult> {
  const session = await requireUserAction(["OWNER", "ADMIN"]);

  const charge = await prisma.rentCharge.findFirst({
    where: {
      id: chargeId,
      ...(session.organizationId ? { lease: { unit: { building: { organizationId: session.organizationId } } } } : {}),
    },
    select: { dueDate: true, lease: { select: { tenantId: true } } },
  });
  if (!charge) return { error: "No se encontró el cargo." };

  // Al deshacer, el estado correcto depende de si ya venció la fecha de pago.
  const overdue = charge.dueDate < new Date();

  await prisma.rentCharge.update({
    where: { id: chargeId },
    data: {
      status: overdue ? "OVERDUE" : "PENDING",
      paidAmount: 0,
      paidAt: null,
      method: null,
      reference: null,
      // El comprobante era evidencia de ese pago: si se deshace, se va con él.
      receiptUrl: null,
    },
  });

  await logAction(
    session.sub,
    "Cancelación de pago",
    "RentCharge",
    chargeId,
    undefined,
    session.organizationId,
  );

  revalidatePath("/pagos");
  revalidatePath("/dashboard");
  revalidatePath("/portal/pagos");
  revalidatePath(`/inquilinos/${charge.lease.tenantId}`);
  return { ok: true };
}
