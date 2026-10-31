"use client";

import { useActionState, useState } from "react";
import { LifeBuoy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
import { Field, FormError } from "@/components/shared/form-field";
import { startSupportSession } from "@/server/superadmin/support";
import { SUPPORT_DURATION_HOURS, SUPPORT_REASON_MAX, SUPPORT_REASON_MIN } from "@/lib/support";
import type { ActionResult } from "@/lib/action-result";

/** Entrar al panel de la arrendadora en modo soporte, con motivo obligatorio. */
export function SupportEntry({ orgId, name, disabled }: { orgId: string; name: string; disabled: boolean }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(startSupportSession, {});
  const [reason, setReason] = useState("");
  const tooShort = reason.trim().length < SUPPORT_REASON_MIN;

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button variant="outline" disabled={disabled}>
            <LifeBuoy className="size-4" aria-hidden />
            Entrar en modo soporte
          </Button>
        }
      />
      <AlertDialogContent>
        <form action={action} className="space-y-4">
          <input type="hidden" name="orgId" value={orgId} />
          <AlertDialogHeader>
            <AlertDialogTitle>¿Entrar al panel de {name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Entrarás como Administrativo durante {SUPPORT_DURATION_HOURS} horas como
              máximo. Su dueño verá en su panel que entraste y el motivo, y cada cambio
              quedará en su bitácora a tu nombre.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Field
            label="Motivo"
            htmlFor="support-reason"
            required
            hint={`Entre ${SUPPORT_REASON_MIN} y ${SUPPORT_REASON_MAX} caracteres. Ejemplo: "Corregir el contrato de la unidad 2B que pidió por correo".`}
          >
            <Textarea
              id="support-reason"
              name="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={SUPPORT_REASON_MAX}
              rows={3}
              required
            />
          </Field>
          <FormError message={state.error} />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button type="submit" disabled={pending || tooShort}>
              {pending ? "Entrando…" : "Entrar en modo soporte"}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
