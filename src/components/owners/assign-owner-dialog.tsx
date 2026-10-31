"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserRoundCog } from "lucide-react";
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
import { Field, FormError, NativeSelect } from "@/components/shared/form-field";
import { periodLabel } from "@/lib/format";
import { assignBuildingOwner } from "@/server/actions/owners";

const NONE = "";

/**
 * Elegir el propietario de una propiedad y desde qué mes se le rinden
 * cuentas. "Sin propietario" deja la propiedad como de la arrendadora.
 */
export function AssignOwnerDialog({
  buildingId,
  current,
  owners,
  months,
}: {
  buildingId: string;
  current: { ownerId: string; since: string } | null;
  owners: { id: string; name: string }[];
  /** Meses que se pueden elegir como inicio, del más reciente al más antiguo. */
  months: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [ownerId, setOwnerId] = useState(current?.ownerId ?? NONE);
  const [since, setSince] = useState(current?.since ?? months[0]);
  const [error, setError] = useState<string>();
  const [busy, startTransition] = useTransition();

  // El inicio actual puede ser más antiguo que la lista: se conserva como opción.
  const monthOptions = current && !months.includes(current.since) ? [...months, current.since] : months;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setOwnerId(current?.ownerId ?? NONE);
          setSince(current?.since ?? months[0]);
          setError(undefined);
        }
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline">
            <UserRoundCog className="size-4" aria-hidden />
            {current ? "Cambiar propietario" : "Asignar propietario"}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Propietario de la propiedad</DialogTitle>
          <DialogDescription>
            El propietario ve el estado de cuenta de esta propiedad y lo que se le ha entregado. No ve
            nombres de inquilinos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <Field label="Propietario" htmlFor={`owner-${buildingId}`}>
            <NativeSelect id={`owner-${buildingId}`} value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
              <option value={NONE}>Sin propietario (es de la arrendadora)</option>
              {owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </NativeSelect>
          </Field>

          {ownerId !== NONE ? (
            <Field
              label="Cuentas desde"
              htmlFor={`owner-since-${buildingId}`}
              hint="Lo cobrado y lo gastado a partir de este mes cuenta para lo pendiente de entregar."
            >
              <NativeSelect id={`owner-since-${buildingId}`} value={since} onChange={(e) => setSince(e.target.value)}>
                {monthOptions.map((m) => (
                  <option key={m} value={m}>
                    {periodLabel(m)}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          ) : null}

          {owners.length === 0 ? (
            <p className="text-muted-foreground text-sm text-pretty">
              Aún no hay propietarios. Agrégalos en Propietarios.
            </p>
          ) : null}

          <FormError message={error} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            disabled={busy}
            onClick={() =>
              startTransition(async () => {
                setError(undefined);
                const result = await assignBuildingOwner({
                  buildingId,
                  ownerId: ownerId === NONE ? null : ownerId,
                  since: ownerId === NONE ? undefined : since,
                });
                if (result.error) {
                  setError(result.error);
                  return;
                }
                setOpen(false);
                toast.success(ownerId === NONE ? "La propiedad quedó sin propietario." : "Propietario guardado.");
                router.refresh();
              })
            }
          >
            {busy ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
