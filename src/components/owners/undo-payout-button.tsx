"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Undo2 } from "lucide-react";
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
import { FormError } from "@/components/shared/form-field";
import { deleteOwnerPayout } from "@/server/actions/owners";

/** Borra una entrega capturada por error; vuelve a contar como pendiente. */
export function UndoPayoutButton({ payoutId, description }: { payoutId: string; description: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(undefined);
      }}
    >
      <AlertDialogTrigger
        render={
          <Button variant="ghost" size="sm">
            <Undo2 className="size-4" aria-hidden />
            Deshacer
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Deshacer esta entrega?</AlertDialogTitle>
          <AlertDialogDescription>
            {description}. El monto vuelve a contar como pendiente de entregar y el propietario deja de verla.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <FormError message={error} />
        <AlertDialogFooter>
          <AlertDialogCancel>Volver</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await deleteOwnerPayout(payoutId);
                if (result.error) {
                  setError(result.error);
                  return;
                }
                setOpen(false);
                toast.success("Entrega deshecha.");
                router.refresh();
              })
            }
          >
            {pending ? "Deshaciendo…" : "Deshacer entrega"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
