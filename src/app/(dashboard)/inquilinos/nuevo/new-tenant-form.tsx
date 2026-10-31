"use client";

import { useState } from "react";
import { useFormAction } from "@/hooks/use-form-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ButtonLink } from "@/components/shared/button-link";
import { Field, FormError, NativeSelect } from "@/components/shared/form-field";
import { Separator } from "@/components/ui/separator";
import { createTenant } from "@/server/actions/tenants";
import { money } from "@/lib/format";
import type { Currency } from "@/lib/currency";
import { LeaseTermsFields } from "@/components/leases/lease-terms-fields";

function Submit({ pending }: { pending: boolean }) {
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Guardando…" : "Guardar inquilino"}
    </Button>
  );
}

export function NewTenantForm({
  units,
  defaultUnitId,
  canInvite = false,
}: {
  units: { id: string; code: string; buildingName: string; baseRent: number; currency: Currency }[];
  defaultUnitId?: string;
  /** Hay correo configurado: sin contraseña temporal se le manda una invitación. */
  canInvite?: boolean;
}) {
  // onSubmit en vez de action: si hay un error, lo capturado no se borra.
  const { onSubmit, pending, error } = useFormAction((formData) => createTenant({}, formData));
  const [unitId, setUnitId] = useState(defaultUnitId ?? "");

  const selectedUnit = units.find((u) => u.id === unitId);

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {/* ------------------------------------------------- datos personales */}
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre completo" htmlFor="name" required>
            <Input id="name" name="name" required placeholder="María Fernanda López" />
          </Field>
          <Field
            label="Correo electrónico"
            htmlFor="email"
            hint="Con este correo entrará a su portal. Sin correo se registra sin acceso; puedes agregarlo después."
          >
            <Input id="email" name="email" type="email" placeholder="maria@ejemplo.com" />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Teléfono" htmlFor="phone">
            <Input id="phone" name="phone" placeholder="55 1234 5678" />
          </Field>
          <Field label="Identificación" htmlFor="documentId" hint="CURP, INE o pasaporte.">
            <Input id="documentId" name="documentId" />
          </Field>
        </div>

        <Field
          label="Contraseña temporal"
          htmlFor="password"
          hint={
            canInvite
              ? "Déjala vacía para enviarle una invitación por correo. Si la escribes (mínimo 8 caracteres), entrégasela tú; al entrar se le pedirá cambiarla. Sin correo, déjala vacía."
              : "Con correo, es obligatoria: mínimo 8 caracteres, entrégasela por un medio seguro y al entrar se le pedirá cambiarla. Sin correo, déjala vacía."
          }
        >
          <Input
            id="password"
            name="password"
            type="text"
            autoComplete="new-password"
            minLength={8}
          />
        </Field>

        <Field label="Notas" htmlFor="notes">
          <Textarea id="notes" name="notes" rows={2} />
        </Field>
      </div>

      <Separator />

      {/* -------------------------------------------------------- contrato */}
      <div className="space-y-4">
        <div>
          <h2 className="font-medium">Contrato (opcional)</h2>
          <p className="text-muted-foreground text-sm text-pretty">
            Si ya sabes qué unidad ocupará, regístralo aquí y el contrato queda
            listo. También puedes hacerlo después.
          </p>
        </div>

        <Field label="Unidad" htmlFor="unitId">
          <NativeSelect
            id="unitId"
            name="unitId"
            value={unitId}
            onChange={(e) => setUnitId(e.target.value)}
          >
            <option value="">Sin asignar por ahora</option>
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.buildingName} · {unit.code} — {money(unit.baseRent, unit.currency)}
              </option>
            ))}
          </NativeSelect>
        </Field>

        {unitId ? <LeaseTermsFields key={unitId} baseRent={selectedUnit?.baseRent} /> : null}
      </div>

      <FormError message={error} />

      <div className="flex flex-wrap justify-end gap-2">
        <ButtonLink href="/inquilinos" variant="outline">
          Cancelar
        </ButtonLink>
        <Submit pending={pending} />
      </div>
    </form>
  );
}
