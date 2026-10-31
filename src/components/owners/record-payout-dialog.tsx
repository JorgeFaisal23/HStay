"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { HandCoins } from "lucide-react";
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
import { Field, FormError, NativeSelect } from "@/components/shared/form-field";
import { ReceiptPicker } from "@/components/payments/receipt-picker";
import { localDateInput } from "@/components/leases/lease-terms-fields";
import { money } from "@/lib/format";
import type { Currency } from "@/lib/currency";
import { PAYMENT_METHODS } from "@/lib/payment-methods";
import { recordOwnerPayout } from "@/server/actions/owners";

/**
 * Registrar dinero entregado al propietario de una propiedad. Propone lo
 * pendiente; el servidor no deja entregar más de eso.
 */
export function RecordPayoutDialog({
  buildingId,
  buildingName,
  ownerName,
  pending,
  variant = "default",
  currency = "MXN",
}: {
  buildingId: string;
  buildingName: string;
  ownerName: string;
  pending: number;
  /** Moneda de la propiedad. */
  currency?: Currency;
  variant?: "default" | "outline";
}) {
  const router = useRouter();
  const suggested = pending > 0 ? String(pending) : "";
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(suggested);
  const [method, setMethod] = useState<string>(PAYMENT_METHODS[0]);
  const [paidOn, setPaidOn] = useState(() => localDateInput());
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [receipt, setReceipt] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string>();
  const [busy, startTransition] = useTransition();

  const reset = () => {
    setAmount(suggested);
    setMethod(PAYMENT_METHODS[0]);
    setPaidOn(localDateInput());
    setReference("");
    setNotes("");
    setReceipt(null);
    setError(undefined);
  };

  const id = (field: string) => `payout-${field}-${buildingId}`;

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
          <Button variant={variant} disabled={pending <= 0} title={pending <= 0 ? "No hay dinero pendiente de entregar" : undefined}>
            <HandCoins className="size-4" aria-hidden />
            Registrar entrega
          </Button>
        }
      />
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar entrega</DialogTitle>
          <DialogDescription>
            {buildingName} · a {ownerName} · pendiente {money(pending, currency)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <Field label="Monto entregado" htmlFor={id("amount")} required>
            <Input
              id={id("amount")}
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              max={pending}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="text-right tabular-nums"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Forma de pago" htmlFor={id("method")} required>
              <NativeSelect id={id("method")} value={method} onChange={(e) => setMethod(e.target.value)}>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Fecha" htmlFor={id("date")} required>
              <Input
                id={id("date")}
                type="date"
                max={localDateInput()}
                value={paidOn}
                onChange={(e) => setPaidOn(e.target.value)}
              />
            </Field>
          </div>

          <Field label="Referencia" htmlFor={id("reference")} hint="Folio o clave de rastreo, si la hay.">
            <Input
              id={id("reference")}
              value={reference}
              maxLength={80}
              onChange={(e) => setReference(e.target.value)}
              placeholder="SPEI 0123456789"
            />
          </Field>

          <Field label="Nota" htmlFor={id("notes")}>
            <Input
              id={id("notes")}
              value={notes}
              maxLength={200}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Liquidación de septiembre"
            />
          </Field>

          <ReceiptPicker
            value={receipt}
            onChange={setReceipt}
            onProcessingChange={setProcessing}
            hint="Opcional: captura de la transferencia o foto del recibo firmado."
          />

          <FormError message={error} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            disabled={busy || processing || !amount}
            onClick={() =>
              startTransition(async () => {
                setError(undefined);
                const result = await recordOwnerPayout({
                  buildingId,
                  amount: Number(amount),
                  paidOn,
                  method,
                  reference: reference || undefined,
                  notes: notes || undefined,
                  receiptUrl: receipt ?? undefined,
                });
                if (result.error) {
                  setError(result.error);
                  return;
                }
                setOpen(false);
                reset();
                toast.success("Entrega registrada.");
                router.refresh();
              })
            }
          >
            {busy ? "Guardando…" : "Registrar entrega"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
