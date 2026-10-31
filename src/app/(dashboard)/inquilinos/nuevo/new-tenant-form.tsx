"use client";

import { useState } from "react";
import Link from "next/link";
import { useFormAction } from "@/hooks/use-form-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ButtonLink } from "@/components/shared/button-link";
import { Field, FormError, NativeSelect } from "@/components/shared/form-field";
import { Separator } from "@/components/ui/separator";
import { createTenant } from "@/server/actions/tenants";
import { money } from "@/lib/format";

function Submit({ pending }: { pending: boolean }) {
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Guardando…" : "Guardar inquilino"}
    </Button>
  );
}

/** Hoy en formato YYYY-MM-DD y la misma fecha dentro de N meses. */
function isoToday(monthsAhead = 0) {
  const date = new Date();
  date.setMonth(date.getMonth() + monthsAhead);
  return date.toISOString().slice(0, 10);
}

export function NewTenantForm({
  units,
  defaultUnitId,
}: {
  units: { id: string; code: string; buildingName: string; baseRent: number }[];
  defaultUnitId?: string;
}) {
  // onSubmit en vez de action: si hay un error, lo capturado no se borra.
  const { onSubmit, pending, error } = useFormAction(createTenant);
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
            hint="Con este correo entrará a su portal. Sin correo no tendrá acceso."
          >
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="maria@ejemplo.com"
            />
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
          hint="Si la dejas vacía se usa “demo1234”. El inquilino podrá cambiarla."
        >
          <Input id="password" name="password" type="text" placeholder="demo1234" />
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
          <p className="text-muted-foreground mt-1 text-sm text-pretty">
            ¿Es una estancia corta (noches, semanas o unos meses)? Captúrala en{" "}
            <Link href="/reservas/nueva" className="text-primary underline-offset-4 hover:underline">
              Nueva reserva
            </Link>
            : una unidad puede tener varias reservas a futuro.
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
                {unit.buildingName} · {unit.code} — {money(unit.baseRent)}
              </option>
            ))}
          </NativeSelect>
        </Field>

        {unitId ? (
          <div className="space-y-4 rounded-lg border p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Inicio del contrato" htmlFor="startDate" required>
                <Input
                  id="startDate"
                  name="startDate"
                  type="date"
                  required
                  defaultValue={isoToday()}
                />
              </Field>
              <Field label="Vencimiento" htmlFor="endDate" required>
                <Input
                  id="endDate"
                  name="endDate"
                  type="date"
                  required
                  defaultValue={isoToday(12)}
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Renta mensual" htmlFor="rentAmount" required>
                <Input
                  id="rentAmount"
                  name="rentAmount"
                  type="number"
                  min={0}
                  step={50}
                  required
                  defaultValue={selectedUnit?.baseRent}
                  className="tabular-nums"
                />
              </Field>
              <Field label="Depósito" htmlFor="depositAmount">
                <Input
                  id="depositAmount"
                  name="depositAmount"
                  type="number"
                  min={0}
                  step={50}
                  defaultValue={selectedUnit?.baseRent}
                  className="tabular-nums"
                />
              </Field>
              <Field
                label="Día de pago"
                htmlFor="paymentDay"
                hint="Del 1 al 31. Si el mes es más corto, se cobra el último día."
              >
                <Input
                  id="paymentDay"
                  name="paymentDay"
                  type="number"
                  min={1}
                  max={31}
                  defaultValue={1}
                  className="tabular-nums"
                />
              </Field>
            </div>
          </div>
        ) : null}
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
