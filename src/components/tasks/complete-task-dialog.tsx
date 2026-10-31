"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck } from "lucide-react";
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
import { Callout } from "@/components/shared/callout";
import { Field, FormError } from "@/components/shared/form-field";
import { ReceiptPicker } from "@/components/payments/receipt-picker";
import { completeTask } from "@/server/actions/tasks";
import type { TaskKind } from "@/generated/prisma/enums";

/**
 * Marcar una tarea como hecha. Limpieza: foto opcional. Reparación: foto de
 * cómo quedó y costo; si costó algo, el comprobante, y el costo queda como
 * gasto por aprobar.
 */
export function CompleteTaskDialog({
  taskId,
  kind,
  title,
  place,
  variant = "outline",
}: {
  taskId: string;
  kind: TaskKind;
  title: string;
  place: string;
  variant?: "default" | "outline";
}) {
  const router = useRouter();
  const repair = kind === "REPAIR";
  const [open, setOpen] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [cost, setCost] = useState("");
  const [notes, setNotes] = useState("");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const reset = () => {
    setPhoto(null);
    setReceipt(null);
    setCost("");
    setNotes("");
    setError(undefined);
  };

  const costValue = cost === "" ? undefined : Number(cost);
  const needsReceipt = repair && (costValue ?? 0) > 0;
  const ready = !repair || (photo !== null && costValue !== undefined && (!needsReceipt || receipt !== null));

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
            <CircleCheck className="size-4" aria-hidden />
            Marcar como hecha
          </Button>
        }
      />
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{repair ? "Cerrar reparación" : "Limpieza hecha"}</DialogTitle>
          <DialogDescription>
            {title} · {place}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <ReceiptPicker
            value={photo}
            onChange={setPhoto}
            onProcessingChange={setProcessing}
            required={repair}
            label="Foto de cómo quedó"
            hint={repair ? "Una foto donde se vea la reparación terminada." : "Opcional: una foto de la unidad lista."}
          />

          {repair ? (
            <>
              <Field
                label="Costo"
                htmlFor={`cost-${taskId}`}
                required
                hint="Material y mano de obra. Escribe 0 si no costó nada."
              >
                <Input
                  id={`cost-${taskId}`}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  className="text-right tabular-nums"
                />
              </Field>
              {needsReceipt ? (
                <>
                  <ReceiptPicker
                    value={receipt}
                    onChange={setReceipt}
                    onProcessingChange={setProcessing}
                    required
                    hint="Ticket o factura del gasto."
                  />
                  <Callout tone="info">
                    El costo queda como gasto de la unidad por aprobar: el administrador lo revisa antes de que cuente.
                  </Callout>
                </>
              ) : null}
            </>
          ) : null}

          <Field label="Notas" htmlFor={`notes-${taskId}`}>
            <Textarea
              id={`notes-${taskId}`}
              rows={2}
              maxLength={1000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={repair ? "Se cambió la llave del lavabo." : "Faltan toallas en el baño."}
            />
          </Field>

          <FormError message={error} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            disabled={pending || processing || !ready}
            onClick={() =>
              startTransition(async () => {
                setError(undefined);
                const result = await completeTask(taskId, {
                  photoUrl: photo ?? undefined,
                  receiptUrl: needsReceipt ? (receipt ?? undefined) : undefined,
                  cost: repair ? costValue : undefined,
                  notes: notes || undefined,
                });
                if (result.error) {
                  setError(result.error);
                  return;
                }
                setOpen(false);
                reset();
                toast.success(repair ? "Reparación cerrada." : "Limpieza marcada como hecha.");
                router.refresh();
              })
            }
          >
            {pending ? "Guardando…" : repair ? "Cerrar reparación" : "Marcar como hecha"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
