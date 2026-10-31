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
import type { ProofToReview } from "@/lib/today";
import { approvePaymentProof, rejectPaymentProof } from "@/server/actions/proofs";

/**
 * Revisión de un comprobante enviado por el inquilino. Aprobar registra el
 * pago (por el monto que confirme el equipo, que puede ajustarse); rechazar
 * pide un motivo que el inquilino ve en su portal.
 */
export function ReviewProofDialog({ proof }: { proof: ProofToReview }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"approve" | "reject">("approve");
  const [amount, setAmount] = useState(String(Math.min(proof.amount, proof.remaining)));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const reset = () => {
    setMode("approve");
    setAmount(String(Math.min(proof.amount, proof.remaining)));
    setReason("");
    setError(undefined);
  };

  const finalAmount = Number(amount);
  const adjusted = Number.isFinite(finalAmount) && toCents(finalAmount) !== toCents(proof.amount);
  const exceeds = proof.amount > proof.remaining;

  const run = (action: () => Promise<{ ok?: boolean; error?: string }>, success: string) =>
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
            Revisar
          </Button>
        }
      />
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Revisar comprobante</DialogTitle>
          <DialogDescription>
            {proof.tenantName} · renta de {proof.periodName.toLowerCase()} · {proof.place}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="bg-muted overflow-hidden rounded-lg border">
            {/* Imagen servida por /comprobantes/{id}/imagen (solo para el equipo). */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/comprobantes/${proof.id}/imagen`}
              alt={`Comprobante de ${proof.tenantName}`}
              className="max-h-80 w-full object-contain"
            />
          </div>

          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground text-xs">Declara</dt>
              <dd>
                <Amount value={proof.amount} currency={proof.currency} />
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Falta por pagar</dt>
              <dd>
                <Amount value={proof.remaining} currency={proof.currency} />
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Forma de pago</dt>
              <dd>{proof.method}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Pagó el</dt>
              <dd>{shortDate(proof.paidOn)}</dd>
            </div>
            {proof.reference ? (
              <div className="col-span-2">
                <dt className="text-muted-foreground text-xs">Referencia</dt>
                <dd className="font-mono text-xs break-all">{proof.reference}</dd>
              </div>
            ) : null}
          </dl>

          {mode === "approve" ? (
            <>
              <Field
                label="Monto a registrar"
                htmlFor={`proof-amount-${proof.id}`}
                hint="Si lo que recibiste no coincide con lo que declara, escribe lo que de verdad entró."
              >
                <Input
                  id={`proof-amount-${proof.id}`}
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  step="0.01"
                  max={proof.remaining}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="text-right tabular-nums"
                />
              </Field>
              {exceeds ? (
                <Callout tone="warning">
                  Declara más de lo que falta por pagar; se propone registrar solo {money(proof.remaining, proof.currency)}.
                </Callout>
              ) : adjusted ? (
                <Callout tone="info">
                  Registrarás {Number.isFinite(finalAmount) ? money(finalAmount, proof.currency) : "otro monto"}; el inquilino declaró {money(proof.amount, proof.currency)}.
                </Callout>
              ) : null}
            </>
          ) : (
            <Field
              label="Motivo del rechazo"
              htmlFor={`proof-reason-${proof.id}`}
              hint="Lo verá el inquilino en su portal; podrá enviar otro comprobante."
              required
            >
              <Textarea
                id={`proof-reason-${proof.id}`}
                value={reason}
                maxLength={200}
                onChange={(e) => setReason(e.target.value)}
                placeholder="La referencia no aparece en el estado de cuenta."
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
                  run(
                    () => approvePaymentProof(proof.id, { amount: finalAmount }),
                    `Pago de ${proof.tenantName} registrado.`,
                  )
                }
              >
                {pending ? "Guardando…" : "Aprobar y registrar pago"}
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
                onClick={() =>
                  run(() => rejectPaymentProof(proof.id, reason), "Comprobante rechazado. El inquilino verá el motivo en su portal.")
                }
              >
                {pending ? "Guardando…" : "Rechazar comprobante"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
