"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
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
import {
  BuildingFormFields,
  type BuildingDefaults,
} from "@/components/properties/building-form-fields";
import { useFormAction } from "@/hooks/use-form-action";
import { updateBuilding } from "@/server/actions/properties";

export function EditBuildingDialog({
  buildingId,
  defaults,
  currencyLocked,
}: {
  buildingId: string;
  defaults: BuildingDefaults;
  /** Por qué ya no se puede cambiar la moneda, si es el caso. */
  currencyLocked?: string | null;
}) {
  const [open, setOpen] = useState(false);
  // onSubmit en vez de action: si hay un error, lo capturado no se borra.
  const { onSubmit, pending, error, clearError } = useFormAction(
    (formData) => updateBuilding({}, formData),
    {
      onSuccess: () => {
        setOpen(false);
        toast.success("Propiedad actualizada.");
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
          <Button variant="outline">
            <Pencil className="size-4" aria-hidden />
            Editar
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={onSubmit}>
          <input type="hidden" name="buildingId" value={buildingId} />
          <DialogHeader>
            <DialogTitle>Editar propiedad</DialogTitle>
            <DialogDescription>
              El nombre y la dirección se ven en toda la app y en el portal de
              tus inquilinos.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <BuildingFormFields defaults={defaults} currencyLocked={currencyLocked} />
            <FormError message={error} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : "Guardar cambios"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
