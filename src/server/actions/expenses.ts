"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrgUserAction } from "@/lib/auth/session";
import { money, toNumber } from "@/lib/format";
import { toCents } from "@/lib/payments";
import type { ActionResult } from "@/lib/action-result";
import { logAction } from "@/server/actions/audit";

/**
 * Revisión de gastos de unidad (hoy nacen al cerrar una reparación con
 * costo). Solo los aprobados cuentan en Cobros, Reportes y el CSV de gastos.
 * El administrador puede ajustar el monto al aprobar.
 */

function refreshExpenses(unitId: string) {
  revalidatePath("/hoy");
  revalidatePath("/tareas");
  revalidatePath("/pagos");
  revalidatePath("/reportes");
  revalidatePath(`/unidades/${unitId}`);
}

const approveSchema = z.object({
  amount: z.number().positive("El monto debe ser mayor a cero.").max(99_999_999).optional(),
});

export async function approveExpense(expenseId: string, input: { amount?: number } = {}): Promise<ActionResult> {
  const { session, db } = await requireOrgUserAction(["OWNER", "ADMIN"]);
  const parsed = approveSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Revisa el monto." };

  const expense = await db.expense.findUnique({
    where: { id: expenseId },
    select: { status: true, amount: true, concept: true, unitId: true, unit: { select: { building: { select: { currency: true } } } } },
  });
  if (!expense) return { error: "No se encontró el gasto." };

  const declared = toNumber(expense.amount);
  const amount = parsed.data.amount ?? declared;

  // Solo si sigue por aprobar: dos revisiones simultáneas no aprueban dos veces.
  const updated = await db.expense.updateMany({
    where: { id: expenseId, status: "PENDING" },
    data: { status: "APPROVED", amount, reviewedById: session.sub, reviewedAt: new Date() },
  });
  if (updated.count === 0) return { error: "Este gasto ya se revisó." };

  const adjusted = toCents(amount) !== toCents(declared);
  await logAction(
    db,
    session.sub,
    adjusted ? "Aprobación de gasto con monto ajustado" : "Aprobación de gasto",
    "Expense",
    expenseId,
    `${expense.concept} · ${money(amount, expense.unit.building.currency)}${adjusted ? ` (se capturó ${money(declared, expense.unit.building.currency)})` : ""}`,
  );
  refreshExpenses(expense.unitId);
  return { ok: true };
}

const rejectSchema = z.object({
  reason: z.string().trim().min(3, "Escribe por qué se rechaza el gasto.").max(200),
});

export async function rejectExpense(expenseId: string, reason: string): Promise<ActionResult> {
  const { session, db } = await requireOrgUserAction(["OWNER", "ADMIN"]);
  const parsed = rejectSchema.safeParse({ reason });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Escribe el motivo." };

  const expense = await db.expense.findUnique({ where: { id: expenseId }, select: { concept: true, unitId: true } });
  if (!expense) return { error: "No se encontró el gasto." };

  const updated = await db.expense.updateMany({
    where: { id: expenseId, status: "PENDING" },
    data: { status: "REJECTED", rejectionReason: parsed.data.reason, reviewedById: session.sub, reviewedAt: new Date() },
  });
  if (updated.count === 0) return { error: "Este gasto ya se revisó." };

  await logAction(db, session.sub, "Rechazo de gasto", "Expense", expenseId, `${expense.concept} · ${parsed.data.reason}`);
  refreshExpenses(expense.unitId);
  return { ok: true };
}
