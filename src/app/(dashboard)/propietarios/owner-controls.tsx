"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { MoreHorizontal, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FormError } from "@/components/shared/form-field";
import { AccessDeliveryNotice } from "@/components/auth/access-delivery-notice";
import { ResetAccessDialog } from "@/components/auth/reset-access-dialog";
import { createOwner, resetOwnerAccess, setOwnerActive } from "@/server/actions/owners";
import type { AccessResult } from "@/server/actions/team";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Guardando…" : "Dar acceso"}
    </Button>
  );
}

/**
 * Alta de un propietario. Como en Equipo, el diálogo queda montado para no
 * perder la contraseña temporal que se está mostrando.
 */
export function CreateOwnerDialog({ atLimit = false }: { atLimit?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setFormKey((k) => k + 1);
        else router.refresh();
      }}
    >
      <DialogTrigger
        render={
          <Button disabled={atLimit} title={atLimit ? "Ya usas todos tus usuarios contratados" : undefined}>
            <UserPlus className="size-4" aria-hidden />
            Agregar propietario
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <CreateOwnerForm
          key={formKey}
          onClose={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function CreateOwnerForm({ onClose }: { onClose: () => void }) {
  const [state, formAction] = useActionState<AccessResult, FormData>(createOwner, {});

  if (state.ok && state.delivery) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Propietario agregado</DialogTitle>
          <DialogDescription>
            Ya puede entrar a ver su estado de cuenta. Asígnale sus propiedades desde la ficha de cada una.
          </DialogDescription>
        </DialogHeader>
        <AccessDeliveryNotice delivery={state.delivery} />
        <DialogFooter>
          <Button onClick={onClose}>Listo</Button>
        </DialogFooter>
      </>
    );
  }

  return (
    <form action={formAction}>
      <DialogHeader>
        <DialogTitle>Agregar propietario</DialogTitle>
        <DialogDescription>
          Dueño de un inmueble que administras. Solo ve el estado de cuenta de sus propiedades y ocupa un
          usuario contratado.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-4">
        <Field label="Nombre completo" htmlFor="owner-name" required>
          <Input id="owner-name" name="name" required placeholder="Ernesto Salgado" />
        </Field>
        <Field label="Correo" htmlFor="owner-email" required>
          <Input id="owner-email" name="email" type="email" required placeholder="ernesto@ejemplo.com" />
        </Field>
        <Field label="Teléfono" htmlFor="owner-phone">
          <Input id="owner-phone" name="phone" type="tel" placeholder="55 1234 5678" />
        </Field>
        <FormError message={state.error} />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Submit />
      </DialogFooter>
    </form>
  );
}

export function OwnerRowActions({
  owner,
}: {
  owner: { id: string; name: string; email: string; active: boolean };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const toggle = () =>
    startTransition(async () => {
      const result = await setOwnerActive(owner.id, !owner.active);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(owner.active ? "Acceso desactivado." : "Acceso reactivado.");
      router.refresh();
    });

  return (
    <div className="flex items-center gap-1">
      {owner.active ? (
        <ResetAccessDialog email={owner.email} action={() => resetOwnerAccess(owner.id)} />
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon" disabled={pending} aria-label={`Opciones de ${owner.name}`}>
              <MoreHorizontal className="size-4" aria-hidden />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={toggle}>
            {owner.active ? "Desactivar acceso" : "Reactivar acceso"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
