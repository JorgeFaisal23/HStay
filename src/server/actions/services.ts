"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrgUserAction } from "@/lib/auth/session";
import { shiftPeriod } from "@/lib/format";
import { logAction } from "@/server/actions/audit";
import type { ActionResult } from "@/lib/action-result";

const PERIOD = /^\d{4}-\d{2}$/;

const amountSchema = z.object({
  accountId: z.string().min(1),
  period: z.string().regex(PERIOD, "Periodo no válido."),
  amount: z.number().min(0, "El monto no puede ser negativo.").max(9_999_999),
});

/**
 * Captura o actualiza el monto de un servicio para un periodo.
 * Un monto vacío borra el cargo: es la forma natural de deshacer una captura.
 */
export async function setServiceAmount(input: {
  accountId: string;
  period: string;
  amount: number | null;
}): Promise<ActionResult> {
  const { session, orgId, db } = await requireOrgUserAction(["OWNER", "ADMIN"]);

  if (!PERIOD.test(input.period)) return { error: "Periodo no válido." };

  // La cuenta llega del cliente: sin esta comprobación, el upsert podría crear
  // un cargo colgado de la cuenta de otra arrendadora.
  const account = await db.serviceAccount.findUnique({
    where: { id: input.accountId },
    select: { id: true },
  });
  if (!account) return { error: "No se encontró el servicio." };

  if (input.amount === null) {
    await db.serviceCharge.deleteMany({
      where: { serviceAccountId: input.accountId, period: input.period },
    });
    await logAction(db, session.sub, "Borrado de captura de servicio", "ServiceCharge", input.accountId, input.period);
    revalidatePath("/servicios");
    revalidatePath("/dashboard");
    revalidatePath("/hoy");
    return { ok: true };
  }

  const parsed = amountSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Monto no válido." };
  }

  const { accountId, period, amount } = parsed.data;

  await db.serviceCharge.upsert({
    where: { serviceAccountId_period: { serviceAccountId: accountId, period } },
    create: { organizationId: orgId, serviceAccountId: accountId, period, amount },
    update: { amount },
  });

  await logAction(db, session.sub, "Captura de servicio", "ServiceCharge", accountId, `${period}: ${amount}`);

  revalidatePath("/servicios");
  revalidatePath("/dashboard");
  revalidatePath("/hoy");
  return { ok: true };
}

/**
 * Copia al periodo indicado los montos del mes anterior que aún no se han
 * capturado. No pisa lo ya capturado: el trabajo manual siempre gana.
 */
export async function copyPreviousMonth(period: string): Promise<
  ActionResult & { copied?: number }
> {
  const { session, orgId, db } = await requireOrgUserAction(["OWNER", "ADMIN"]);

  if (!PERIOD.test(period)) return { error: "Periodo no válido." };

  const previous = shiftPeriod(period, -1);

  const [previousCharges, existing] = await Promise.all([
    db.serviceCharge.findMany({
      where: { period: previous },
      select: { serviceAccountId: true, amount: true },
    }),
    db.serviceCharge.findMany({
      where: { period },
      select: { serviceAccountId: true },
    }),
  ]);

  const alreadyCaptured = new Set(existing.map((c) => c.serviceAccountId));
  const pending = previousCharges.filter(
    (c) => !alreadyCaptured.has(c.serviceAccountId),
  );

  if (pending.length === 0) {
    return { ok: true, copied: 0 };
  }

  await db.serviceCharge.createMany({
    data: pending.map((charge) => ({
      organizationId: orgId,
      serviceAccountId: charge.serviceAccountId,
      period,
      amount: charge.amount,
    })),
  });

  await logAction(
    db,
    session.sub,
    "Copia de montos del mes anterior",
    "ServiceCharge",
    undefined,
    `${previous} → ${period}: ${pending.length} montos`,
  );

  revalidatePath("/servicios");
  revalidatePath("/dashboard");
  revalidatePath("/hoy");
  return { ok: true, copied: pending.length };
}
