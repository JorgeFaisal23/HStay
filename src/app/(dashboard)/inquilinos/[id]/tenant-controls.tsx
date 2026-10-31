"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormAction } from "@/hooks/use-form-action";
import { Pencil, UserCheck, UserX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FormError } from "@/components/shared/form-field";
import { ResetAccessDialog } from "@/components/auth/reset-access-dialog";
import { resetTenantAccess, setTenantActive, updateTenant } from "@/server/actions/tenants";

type TenantInfo = {
  id: string;
  name: string;
  /** Sin correo no tiene acceso al portal. */
  email: string | null;
  phone: string | null;
  documentId: string | null;
  notes: string | null;
  active: boolean;
};

function Save({ pending }: { pending: boolean }) {
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Guardando…" : "Guardar"}
    </Button>
  );
}

function EditTenantDialog({ tenant }: { tenant: TenantInfo }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // onSubmit en vez de action: si hay un error, lo capturado no se borra.
  const { onSubmit, pending, error, clearError } = useFormAction(
    (formData) => updateTenant({}, formData),
    {
      onSuccess: () => {
        setOpen(false);
        toast.success("Datos actualizados.");
        router.refresh();
      },
    },
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) clearError();
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <Pencil className="size-4" aria-hidden />
            Editar
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={onSubmit}>
          <input type="hidden" name="tenantId" value={tenant.id} />
          <DialogHeader>
            <DialogTitle>Editar inquilino</DialogTitle>
            <DialogDescription>
              {tenant.email
                ? "Si cambias el correo, a partir de ahora entrará al portal con el nuevo."
                : "Agrega su correo y después usa “Acceso al portal” para que pueda entrar."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Field label="Nombre completo" htmlFor="t-name" required>
              <Input id="t-name" name="name" defaultValue={tenant.name} required />
            </Field>
            <Field label="Correo" htmlFor="t-email" hint="Sin correo no tiene acceso al portal.">
              <Input id="t-email" name="email" type="email" defaultValue={tenant.email ?? ""} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Teléfono" htmlFor="t-phone">
                <Input id="t-phone" name="phone" defaultValue={tenant.phone ?? ""} />
              </Field>
              <Field label="Identificación" htmlFor="t-doc">
                <Input id="t-doc" name="documentId" defaultValue={tenant.documentId ?? ""} />
              </Field>
            </div>
            <Field label="Notas" htmlFor="t-notes">
              <Textarea id="t-notes" name="notes" rows={2} defaultValue={tenant.notes ?? ""} />
            </Field>
            <FormError message={error} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Save pending={pending} />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Editar datos, dar un acceso nuevo al portal y activar o desactivar la cuenta. */
export function TenantControls({ tenant }: { tenant: TenantInfo }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const toggleActive = () =>
    startTransition(async () => {
      const result = await setTenantActive(tenant.id, !tenant.active);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(tenant.active ? "Acceso al portal desactivado." : "Acceso al portal reactivado.");
      router.refresh();
    });

  return (
    <div className="flex flex-wrap gap-2">
      <EditTenantDialog tenant={tenant} />
      {tenant.active && tenant.email ? (
        <ResetAccessDialog
          email={tenant.email}
          action={() => resetTenantAccess(tenant.id)}
          label="Acceso al portal"
        />
      ) : null}
      <Button variant="ghost" size="sm" disabled={pending} onClick={toggleActive}>
        {tenant.active ? (
          <UserX className="size-4" aria-hidden />
        ) : (
          <UserCheck className="size-4" aria-hidden />
        )}
        {tenant.active ? "Desactivar" : "Reactivar"}
      </Button>
    </div>
  );
}
