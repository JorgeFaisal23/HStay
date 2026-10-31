"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
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
import { FormError } from "@/components/shared/form-field";
import { BuildingFormFields } from "@/components/properties/building-form-fields";
import { useFormAction } from "@/hooks/use-form-action";
import { createBuilding } from "@/server/actions/properties";

export function NewBuildingDialog() {
  const [open, setOpen] = useState(false);
  // onSubmit en vez de action: si hay un error, lo capturado no se borra.
  const { onSubmit, pending, error, clearError } = useFormAction(
    (formData) => createBuilding({}, formData),
    {
      onSuccess: () => {
        setOpen(false);
        toast.success("Propiedad registrada.");
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
          <Button>
            <Plus className="size-4" aria-hidden />
            Nueva propiedad
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>Nueva propiedad</DialogTitle>
            <DialogDescription>
              Un edificio, una casa o cualquier inmueble que agrupe unidades en
              renta. Después le agregas los cuartos o departamentos.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <BuildingFormFields />

            <FormError message={error} />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : "Guardar propiedad"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
