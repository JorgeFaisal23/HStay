"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
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
import { Callout } from "@/components/shared/callout";
import { Field, FormError, NativeSelect } from "@/components/shared/form-field";
import { ReceiptPicker } from "@/components/payments/receipt-picker";
import { localDateInput } from "@/components/leases/lease-terms-fields";
import { money } from "@/lib/format";
import { PAYMENT_METHODS } from "@/lib/payment-methods";
import { submitPaymentProof } from "@/server/actions/proofs";

/**
 * El inquilino avisa que ya pagó: monto, forma de pago, referencia, fecha y la
 * foto del comprobante (obligatoria). Enviar no marca nada como pagado: lo
 * confirma el administrador al revisarlo.
 */
export function SubmitProofDialog({
  chargeId,
  periodName,
  remaining,
  resend = false,
  variant = "outline",
}: {
  chargeId: string;
  periodName: string;
  /** Lo que falta por pagar del cargo. */
  remaining: number;
  /** Tras un rechazo, el botón invita a enviar otro. */
  resend?: boolean;
  variant?: "default" | "outline";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(remaining));
  const [method, setMethod] = useState<string>(PAYMENT_METHODS[0]);
  const [reference, setReference] = useState("");
  const [paidOn, setPaidOn] = useState(() => localDateInput());
  const [receipt, setReceipt] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const reset = () => {
    setAmount(String(remaining));
    setMethod(PAYMENT_METHODS[0]);
    setReference("");
    setPaidOn(localDateInput());
    setReceipt(null);
    setError(undefined);
  };

  const id = (field: string) => `proof-${field}-${chargeId}`;

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
          <Button variant={variant}>
            <Send className="size-4" aria-hidden />
            {resend ? "Enviar otro comprobante" : "Enviar comprobante"}
          </Button>
        }
      />
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Enviar comprobante</DialogTitle>
          <DialogDescription>
            Renta de {periodName.toLowerCase()} · faltan {money(remaining)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <Callout tone="info">
            Tu pago queda confirmado cuando el administrador revise el comprobante. Mientras tanto
            lo verás como &ldquo;Por revisar&rdquo;.
          </Callout>

          <ReceiptPicker
            value={receipt}
            onChange={setReceipt}
            onProcessingChange={setProcessing}
            required
            hint="Foto del recibo o captura de la transferencia donde se lean el monto y la fecha."
          />

          <Field label="Monto que pagaste" htmlFor={id("amount")} required>
            <Input
              id={id("amount")}
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              max={remaining}
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
            <Field label="Fecha de pago" htmlFor={id("date")} required>
              <Input
                id={id("date")}
                type="date"
                max={localDateInput()}
                value={paidOn}
                onChange={(e) => setPaidOn(e.target.value)}
              />
            </Field>
          </div>

          <Field
            label="Referencia"
            htmlFor={id("reference")}
            hint="Folio o clave de rastreo de la transferencia, si la tienes."
          >
            <Input
              id={id("reference")}
              value={reference}
              maxLength={80}
              onChange={(e) => setReference(e.target.value)}
              placeholder="SPEI 0123456789"
            />
          </Field>

          <FormError message={error} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            disabled={pending || processing || !receipt}
            onClick={() =>
              startTransition(async () => {
                setError(undefined);
                const result = await submitPaymentProof({
                  chargeId,
                  amount: Number(amount),
                  method,
                  reference: reference || undefined,
                  paidOn,
                  receiptUrl: receipt ?? "",
                });
                if (result.error) {
                  setError(result.error);
                  return;
                }
                setOpen(false);
                reset();
                toast.success("Comprobante enviado. Aquí verás cuando lo revisen.");
                router.refresh();
              })
            }
          >
            {pending ? "Enviando…" : "Enviar comprobante"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
