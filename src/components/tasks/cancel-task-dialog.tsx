"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import { Field, FormError } from "@/components/shared/form-field";
import { cancelTask } from "@/server/actions/tasks";

/** Cancelar una tarea que ya no hace falta, con el motivo. */
export function CancelTaskDialog({ taskId, title }: { taskId: string; title: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setReason("");
          setError(undefined);
        }
      }}
    >
      <AlertDialogTrigger render={<Button variant="ghost">Cancelar tarea</Button>} />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Cancelar la tarea?</AlertDialogTitle>
          <AlertDialogDescription>{title}. Deja de aparecer en las listas de pendientes.</AlertDialogDescription>
        </AlertDialogHeader>
        <Field label="Motivo" htmlFor={`cancel-${taskId}`} required>
          <Textarea
            id={`cancel-${taskId}`}
            rows={2}
            maxLength={200}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Se reportó dos veces."
          />
        </Field>
        <FormError message={error} />
        <AlertDialogFooter>
          <AlertDialogCancel>Volver</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await cancelTask(taskId, reason);
                if (result.error) {
                  setError(result.error);
                  return;
                }
                setOpen(false);
                toast.success("Tarea cancelada.");
                router.refresh();
              })
            }
          >
            {pending ? "Cancelando…" : "Cancelar tarea"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
