"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Undo2 } from "lucide-react";
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
import { Field, NativeSelect } from "@/components/shared/form-field";
import { money } from "@/lib/format";
import type { Currency } from "@/lib/currency";
import { PAYMENT_METHODS } from "@/lib/payment-methods";
import { ReceiptPicker } from "@/components/payments/receipt-picker";
import { markChargeUnpaid, registerPayment } from "@/server/actions/payments";
import { remainingOf } from "@/lib/payments";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";


/**
 * Registrar un pago (total o parcial) de un cargo de renta, o deshacer los
 * pagos registrados por error.
 */
export function PaymentRowActions({
  chargeId,
  tenantName,
  amount,
  paidAmount,
  currency = "MXN",
}: {
  chargeId: string;
  tenantName: string;
  amount: number;
  paidAmount: number;
  /** Moneda de la propiedad del cargo. */
  currency?: Currency;
}) {
  const remaining = remainingOf(amount, paidAmount);
  return (
    <div className="flex items-center gap-1">
      {paidAmount > 0 ? <UndoPayments chargeId={chargeId} tenantName={tenantName} /> : null}
      {remaining > 0 ? (
        <RegisterPaymentDialog
          chargeId={chargeId}
          tenantName={tenantName}
          amount={amount}
          remaining={remaining}
          partial={paidAmount > 0}
          currency={currency}
        />
      ) : null}
    </div>
  );
}

/** Deshacer pide confirmación: borra los pagos y sus comprobantes. */
function UndoPayments({ chargeId, tenantName }: { chargeId: string; tenantName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button variant="ghost" size="sm" disabled={pending}>
            <Undo2 className="size-4" aria-hidden />
            <span className="sr-only sm:not-sr-only">Deshacer</span>
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Deshacer los pagos?</AlertDialogTitle>
          <AlertDialogDescription>
            Se borran los pagos registrados de {tenantName} en este cargo, con
            sus comprobantes. Úsalo solo si se registraron por error.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await markChargeUnpaid(chargeId);
                if (result.error) {
                  toast.error(result.error);
                  return;
                }
                setOpen(false);
                toast.success("Pagos deshechos.");
                router.refresh();
              })
            }
          >
            {pending ? "Deshaciendo…" : "Deshacer pagos"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * En la tabla de Cobros el botón es la acción de cada fila y en celular se
 * reduce al icono; fuera de ella (p. ej. en "Hoy") va en `outline` y con su
 * texto siempre visible.
 */
export function RegisterPaymentDialog({
  chargeId,
  tenantName,
  amount,
  remaining,
  partial,
  variant = "default",
  iconOnlyOnMobile = true,
  currency = "MXN",
}: {
  chargeId: string;
  tenantName: string;
  amount: number;
  remaining: number;
  partial: boolean;
  /** Moneda de la propiedad del cargo. */
  currency?: Currency;
  variant?: "default" | "outline";
  iconOnlyOnMobile?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [paid, setPaid] = useState(String(remaining));
  const [method, setMethod] = useState<string>(PAYMENT_METHODS[0]);
  const [reference, setReference] = useState("");
  const [receipt, setReceipt] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [pending, startTransition] = useTransition();

  const reset = () => {
    setPaid(String(remaining));
    setMethod(PAYMENT_METHODS[0]);
    setReference("");
    setReceipt(null);
  };

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
          <Button size="sm" variant={variant}>
            <Check className="size-4" aria-hidden />
            <span className={iconOnlyOnMobile ? "sr-only sm:not-sr-only" : undefined}>
              {partial ? "Abonar" : "Registrar pago"}
            </span>
          </Button>
        }
      />
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar pago</DialogTitle>
          <DialogDescription>
            {tenantName} · cargo de {money(amount, currency)}
            {partial ? ` · faltan ${money(remaining, currency)}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <Field
            label="Monto recibido"
            htmlFor={`paid-${chargeId}`}
            hint="Si pagó solo una parte, escribe lo que recibiste; el resto queda pendiente."
          >
            <Input
              id={`paid-${chargeId}`}
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              max={remaining}
              value={paid}
              onChange={(e) => setPaid(e.target.value)}
              className="text-right tabular-nums"
            />
          </Field>

          <Field label="Forma de pago" htmlFor={`method-${chargeId}`}>
            <NativeSelect
              id={`method-${chargeId}`}
              value={method}
              onChange={(e) => setMethod(e.target.value)}
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </NativeSelect>
          </Field>

          <Field
            label="Referencia"
            htmlFor={`reference-${chargeId}`}
            hint="Folio de la transferencia o del recibo, si lo tienes."
          >
            <Input
              id={`reference-${chargeId}`}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="REF-000123"
            />
          </Field>

          <ReceiptPicker
            value={receipt}
            onChange={setReceipt}
            onProcessingChange={setProcessing}
            hint="Foto del recibo o captura de la transferencia. Se guarda con el pago y tu inquilino puede verla en su portal."
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            disabled={pending || processing}
            onClick={() =>
              startTransition(async () => {
                const result = await registerPayment({
                  chargeId,
                  amount: Number(paid),
                  method,
                  reference: reference || undefined,
                  receiptUrl: receipt ?? undefined,
                });
                if (result.error) {
                  toast.error(result.error);
                  return;
                }
                setOpen(false);
                reset();
                toast.success(
                  Number(paid) < remaining
                    ? `Abono de ${tenantName} registrado.`
                    : `Pago de ${tenantName} registrado.`,
                );
                router.refresh();
              })
            }
          >
            {pending ? "Guardando…" : "Confirmar pago"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
