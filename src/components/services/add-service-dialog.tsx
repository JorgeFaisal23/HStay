"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
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
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Field, FormError, NativeSelect } from "@/components/shared/form-field";
import { SERVICE_TYPE_LABELS, SERVICE_TYPE_ORDER } from "@/lib/labels";
import type { ServiceType } from "@/generated/prisma/enums";
import {
  createBuildingServiceAccount,
  createUnitServiceAccount,
} from "@/server/actions/properties";
import { SplitModeSelect } from "./split-mode-select";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Guardando…" : "Agregar servicio"}
    </Button>
  );
}

/** A quién pertenece el servicio: una unidad o la propiedad completa. */
export type ServiceTarget =
  | { scope: "UNIT"; unitId: string }
  | { scope: "BUILDING"; buildingId: string };

export function AddServiceDialog({
  target,
  existingTypes,
}: {
  target: ServiceTarget;
  existingTypes: ServiceType[];
}) {
  const [open, setOpen] = useState(false);
  const [included, setIncluded] = useState(false);
  const [error, setError] = useState<string>();
  const isBuilding = target.scope === "BUILDING";

  // La acción se envuelve en lugar de reaccionar a su resultado con un
  // efecto: cerrar el diálogo y avisar son consecuencias directas de
  // enviar el formulario, no de un cambio de estado posterior.
  async function submit(formData: FormData) {
    const result = isBuilding
      ? await createBuildingServiceAccount({}, formData)
      : await createUnitServiceAccount({}, formData);
    if (result?.error) {
      setError(result.error);
      return;
    }
    setError(undefined);
    setOpen(false);
    toast.success("Servicio agregado.");
  }

  const available = SERVICE_TYPE_ORDER.filter(
    (type) => !existingTypes.includes(type),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" disabled={available.length === 0}>
            <Plus className="size-4" aria-hidden />
            Agregar servicio
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <form action={submit}>
          {target.scope === "BUILDING" ? (
            <input type="hidden" name="buildingId" value={target.buildingId} />
          ) : (
            <input type="hidden" name="unitId" value={target.unitId} />
          )}
          <input
            type="hidden"
            name="includedInRent"
            value={included ? "on" : "off"}
          />

          <DialogHeader>
            <DialogTitle>Agregar servicio</DialogTitle>
            <DialogDescription>
              {isBuilding
                ? "Un recibo a nombre de toda la propiedad, como el agua del edificio, que se reparte entre sus unidades."
                : "Un servicio contratado específicamente para esta unidad, con su propio número de contrato."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <Field label="Tipo de servicio" htmlFor="type" required>
              <NativeSelect id="type" name="type" required defaultValue="">
                <option value="" disabled>
                  Elige un servicio
                </option>
                {available.map((type) => (
                  <option key={type} value={type}>
                    {SERVICE_TYPE_LABELS[type]}
                  </option>
                ))}
              </NativeSelect>
            </Field>

            <Field label="Proveedor" htmlFor="providerName">
              <Input id="providerName" name="providerName" placeholder="CFE" />
            </Field>

            <Field label="Número de contrato" htmlFor="contractNumber">
              <Input
                id="contractNumber"
                name="contractNumber"
                placeholder="4471023"
                className="tabular-nums"
              />
            </Field>

            {isBuilding ? (
              <SplitModeSelect id="splitMode-nuevo" defaultValue="EQUAL" />
            ) : null}

            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label htmlFor="incluido-nuevo" className="font-normal">
                ¿Va incluido en la renta?
              </Label>
              <Switch
                id="incluido-nuevo"
                checked={included}
                onCheckedChange={(value) => setIncluded(Boolean(value))}
              />
            </div>

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
            <Submit />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
