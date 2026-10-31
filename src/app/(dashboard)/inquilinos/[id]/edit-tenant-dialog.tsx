"use client";

import { useState } from "react";
import { useFormAction } from "@/hooks/use-form-action";
import { Pencil } from "lucide-react";
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
import { updateTenant } from "@/server/actions/tenants";

function Submit({ pending }: { pending: boolean }) {
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Guardando…" : "Guardar cambios"}
    </Button>
  );
}

export function EditTenantDialog({
  tenant,
}: {
  tenant: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    documentId: string | null;
    notes: string | null;
  };
}) {
  const [open, setOpen] = useState(false);
  // onSubmit en vez de action: si hay error, lo capturado no se borra.
  const { onSubmit, pending, error, clearError } = useFormAction(updateTenant, {
    onSuccess: () => {
      setOpen(false);
      toast.success("Inquilino actualizado.");
    },
  });

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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={onSubmit}>
          <input type="hidden" name="tenantId" value={tenant.id} />

          <DialogHeader>
            <DialogTitle>Editar inquilino</DialogTitle>
            <DialogDescription>
              Datos de contacto y acceso al portal.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nombre completo" htmlFor="name" required>
                <Input id="name" name="name" required defaultValue={tenant.name} />
              </Field>
              <Field
                label="Correo electrónico"
                htmlFor="email"
                hint="Sin correo no tiene acceso al portal."
              >
                <Input
                  id="email"
                  name="email"
                  type="email"
                  defaultValue={tenant.email ?? ""}
                  placeholder="maria@ejemplo.com"
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Teléfono" htmlFor="phone">
                <Input id="phone" name="phone" defaultValue={tenant.phone ?? ""} />
              </Field>
              <Field label="Identificación" htmlFor="documentId" hint="CURP, INE o pasaporte.">
                <Input id="documentId" name="documentId" defaultValue={tenant.documentId ?? ""} />
              </Field>
            </div>

            <Field
              label="Nueva contraseña temporal"
              htmlFor="password"
              hint={
                tenant.email
                  ? "Déjala vacía para no cambiarla. Mínimo 8 caracteres."
                  : "Para darle acceso al portal: escribe su correo y una contraseña temporal (mínimo 8 caracteres)."
              }
            >
              <Input id="password" name="password" type="text" autoComplete="off" />
            </Field>

            <Field label="Notas" htmlFor="notes">
              <Textarea id="notes" name="notes" rows={2} defaultValue={tenant.notes ?? ""} />
            </Field>

            <FormError message={error} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Submit pending={pending} />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
