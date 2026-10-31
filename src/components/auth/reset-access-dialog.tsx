"use client";

import { useState, useTransition } from "react";
import { KeyRound } from "lucide-react";
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
import { AccessDeliveryNotice } from "@/components/auth/access-delivery-notice";
import type { AccessDelivery } from "@/server/auth/access";

/**
 * Confirmar y dar un acceso nuevo a alguien que perdió su contraseña (dueño,
 * equipo o inquilino). El resultado —enlace enviado o contraseña temporal— se
 * muestra en el mismo diálogo.
 */
export function ResetAccessDialog({
  email,
  action,
  label = "Restablecer acceso",
}: {
  email: string;
  action: () => Promise<{ error?: string; delivery?: AccessDelivery }>;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [delivery, setDelivery] = useState<AccessDelivery>();
  const [pending, startTransition] = useTransition();

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setDelivery(undefined);
      }}
    >
      <AlertDialogTrigger
        render={
          <Button variant="outline" size="sm">
            <KeyRound className="size-4" aria-hidden />
            {label}
          </Button>
        }
      />
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>{label}</AlertDialogTitle>
          <AlertDialogDescription>
            {delivery
              ? "Listo. Su contraseña anterior y su sesión abierta dejaron de servir."
              : `${email} recibirá un enlace para elegir contraseña o, si no hay correo configurado, verás una contraseña temporal para entregarle. Su contraseña actual dejará de servir.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {delivery ? <AccessDeliveryNotice delivery={delivery} /> : null}
        <AlertDialogFooter>
          <AlertDialogCancel>{delivery ? "Cerrar" : "Cancelar"}</AlertDialogCancel>
          {delivery ? null : (
            <Button
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await action();
                  if (result.error || !result.delivery) {
                    toast.error(result.error ?? "No se pudo restablecer el acceso.");
                    return;
                  }
                  setDelivery(result.delivery);
                })
              }
            >
              {pending ? "Procesando…" : "Restablecer"}
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
