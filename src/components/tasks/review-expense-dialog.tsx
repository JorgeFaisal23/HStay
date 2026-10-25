"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileSearch } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Amount } from "@/components/shared/amount";
import { Callout } from "@/components/shared/callout";
import { Field, FormError } from "@/components/shared/form-field";
import { money, shortDate } from "@/lib/format";
import { toCents } from "@/lib/payments";
import type { ExpenseToReview } from "@/lib/today";
import { approveExpense, rejectExpense } from "@/server/actions/expenses";

/**
 * Aprobar o rechazar el gasto de una reparación. Se ve el comprobante y la
 * foto del trabajo; el monto se puede ajustar antes de aprobar.
 */
export function ReviewExpenseDialog({ expense }: { expense: ExpenseToReview }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"approve" | "reject">("approve");
  const [amount, setAmount] = useState(String(expense.amount));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const reset = () => {
    setMode("approve");
    setAmount(String(expense.amount));
    setReason("");
    setError(undefined);
  };
  const finalAmount = Number(amount);
  const adjusted = Number.isFinite(finalAmount) && toCents(finalAmount) !== toCents(expense.amount);

  const run = (action: () => Promise<{ error?: string }>, success: string) =>
    startTransition(async () => {
      setError(undefined);
      const result = await action();
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      reset();
      toast.success(success);
      router.refresh();
    });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline">
            <FileSearch className="size-4" aria-hidden />
            Revisar gasto
          </Button>
        }
      />
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Revisar gasto</DialogTitle>
          <DialogDescription>
            {expense.concept} · {expense.place}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid gap-3 sm:grid-cols-2">
            {expense.hasReceipt ? (
              <figure className="space-y-1">
                <div className="bg-muted overflow-hidden rounded-lg border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/operacion/archivos/gasto/${expense.id}`}
                    alt="Comprobante del gasto"
                    className="max-h-60 w-full object-contain"
                  />
                </div>
                <figcaption className="text-muted-foreground text-xs">Comprobante</figcaption>
              </figure>
            ) : null}
            {expense.taskId && expense.hasDonePhoto ? (
              <figure className="space-y-1">
                <div className="bg-muted overflow-hidden rounded-lg border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/operacion/archivos/cierre/${expense.taskId}`}
                    alt="Foto del trabajo terminado"
                    className="max-h-60 w-full object-contain"
                  />
                </div>
                <figcaption className="text-muted-foreground text-xs">Trabajo terminado</figcaption>
              </figure>
            ) : null}
          </div>

          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground text-xs">Costo capturado</dt>
              <dd>
                <Amount value={expense.amount} />
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Fecha</dt>
              <dd>{shortDate(expense.spentOn)}</dd>
            </div>
            {expense.createdByName ? (
              <div>
                <dt className="text-muted-foreground text-xs">Lo capturó</dt>
                <dd>{expense.createdByName}</dd>
              </div>
            ) : null}
            {expense.notes ? (
              <div className="col-span-2">
                <dt className="text-muted-foreground text-xs">Notas</dt>
                <dd className="text-pretty">{expense.notes}</dd>
              </div>
            ) : null}
          </dl>

          {mode === "approve" ? (
            <>
              <Field label="Monto a aprobar" htmlFor={`expense-amount-${expense.id}`}>
                <Input
                  id={`expense-amount-${expense.id}`}
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="text-right tabular-nums"
                />
              </Field>
              {adjusted ? (
                <Callout tone="info">
                  Aprobarás {Number.isFinite(finalAmount) ? money(finalAmount) : "otro monto"}; se capturó {money(expense.amount)}.
                </Callout>
              ) : null}
            </>
          ) : (
            <Field label="Motivo del rechazo" htmlFor={`expense-reason-${expense.id}`} required>
              <Textarea
                id={`expense-reason-${expense.id}`}
                value={reason}
                maxLength={200}
                onChange={(e) => setReason(e.target.value)}
                placeholder="El ticket no corresponde a esta reparación."
              />
            </Field>
          )}

          <FormError message={error} />
        </div>

        <DialogFooter>
          {mode === "approve" ? (
            <>
              <Button variant="outline" disabled={pending} onClick={() => setMode("reject")}>
                Rechazar
              </Button>
              <Button
                disabled={pending}
                onClick={() =>
                  run(() => approveExpense(expense.id, { amount: finalAmount }), "Gasto aprobado.")
                }
              >
                {pending ? "Guardando…" : "Aprobar gasto"}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" disabled={pending} onClick={() => setMode("approve")}>
                Volver
              </Button>
              <Button
                variant="destructive"
                disabled={pending}
                onClick={() => run(() => rejectExpense(expense.id, reason), "Gasto rechazado.")}
              >
                {pending ? "Guardando…" : "Rechazar gasto"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
