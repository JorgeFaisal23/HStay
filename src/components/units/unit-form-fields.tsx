"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, NativeSelect } from "@/components/shared/form-field";
import { UNIT_STATUS_LABELS, UNIT_TYPE_LABELS } from "@/lib/labels";
import type { UnitStatus, UnitType } from "@/generated/prisma/enums";
import type { Currency } from "@/lib/currency";

export type UnitDefaults = {
  buildingId?: string;
  code?: string;
  name?: string | null;
  type?: UnitType;
  status?: UnitStatus;
  floor?: number | null;
  bedrooms?: number;
  bathrooms?: number;
  sizeM2?: number | null;
  baseRent?: number;
  nightlyRate?: number | null;
  weeklyRate?: number | null;
  monthlyRate?: number | null;
  description?: string | null;
};

const STAY_RATES = [
  { name: "nightlyRate", label: "Por noche", placeholder: "1200" },
  { name: "weeklyRate", label: "Por semana", placeholder: "7000" },
  { name: "monthlyRate", label: "Por mes", placeholder: "22000" },
] as const;

const TYPES: UnitType[] = ["ROOM", "APARTMENT", "STUDIO", "COMMERCIAL"];
const STATUSES: UnitStatus[] = [
  "AVAILABLE",
  "OCCUPIED",
  "SHORT_TERM",
  "MAINTENANCE",
];

/**
 * Campos compartidos entre el alta y la edición de una unidad. Tener un solo
 * lugar evita que los dos formularios se desincronicen.
 */
export function UnitFormFields({
  buildings,
  defaults = {},
  lockBuilding = false,
}: {
  buildings: { id: string; name: string; currency?: Currency }[];
  defaults?: UnitDefaults;
  lockBuilding?: boolean;
}) {
  // La moneda de la propiedad elegida: en ella se capturan renta y tarifas.
  const [buildingId, setBuildingId] = useState(defaults.buildingId ?? "");
  const currency = buildings.find((b) => b.id === buildingId)?.currency;
  return (
    <div className="space-y-4">
      <Field label="Propiedad" htmlFor="buildingId" required>
        <NativeSelect
          id="buildingId"
          name="buildingId"
          required
          value={buildingId}
          onChange={(e) => setBuildingId(e.target.value)}
          disabled={lockBuilding}
        >
          <option value="" disabled>
            Elige la propiedad
          </option>
          {buildings.map((building) => (
            <option key={building.id} value={building.id}>
              {building.name}
            </option>
          ))}
        </NativeSelect>
        {lockBuilding ? (
          <input type="hidden" name="buildingId" value={defaults.buildingId} />
        ) : null}
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Identificador"
          htmlFor="code"
          required
          hint="El número o clave con el que llamas al cuarto: 101, A-2…"
        >
          <Input
            id="code"
            name="code"
            required
            defaultValue={defaults.code}
            placeholder="101"
          />
        </Field>

        <Field label="Nombre (opcional)" htmlFor="name">
          <Input
            id="name"
            name="name"
            defaultValue={defaults.name ?? ""}
            placeholder="Cuarto con balcón"
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tipo" htmlFor="type" required>
          <NativeSelect
            id="type"
            name="type"
            defaultValue={defaults.type ?? "ROOM"}
          >
            {TYPES.map((type) => (
              <option key={type} value={type}>
                {UNIT_TYPE_LABELS[type]}
              </option>
            ))}
          </NativeSelect>
        </Field>

        <Field
          label="Estado"
          htmlFor="status"
          required
          hint="“Renta corta” es para unidades que operas por noche."
        >
          <NativeSelect
            id="status"
            name="status"
            defaultValue={defaults.status ?? "AVAILABLE"}
          >
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {UNIT_STATUS_LABELS[status]}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>

      <Field
        label={`Renta mensual${currency ? ` (${currency})` : ""}`}
        htmlFor="baseRent"
        required
        hint="La que se propone al hacer un contrato. Si la unidad solo se renta por noche, deja 0."
      >
        <Input
          id="baseRent"
          name="baseRent"
          type="number"
          min={0}
          step={50}
          required
          defaultValue={defaults.baseRent}
          placeholder="6500"
          className="tabular-nums"
        />
      </Field>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">
          Tarifas de estancia corta{currency ? ` en ${currency}` : ""}{" "}
          <span className="text-muted-foreground font-normal">(opcional)</span>
        </legend>
        <div className="grid gap-4 sm:grid-cols-3">
          {STAY_RATES.map((rate) => (
            <Field key={rate.name} label={rate.label} htmlFor={rate.name}>
              <Input
                id={rate.name}
                name={rate.name}
                type="number"
                min={0}
                step={50}
                defaultValue={defaults[rate.name] ?? ""}
                placeholder={rate.placeholder}
                className="tabular-nums"
              />
            </Field>
          ))}
        </div>
        <p className="text-muted-foreground text-xs text-pretty">
          El total de una reserva se sugiere por bloques: cada 30 noches con la tarifa mensual, cada 7
          con la semanal y el resto por noche. Deja vacías las que no uses.
        </p>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-4">
        <Field label="Piso" htmlFor="floor">
          <Input
            id="floor"
            name="floor"
            type="number"
            min={0}
            defaultValue={defaults.floor ?? ""}
            className="tabular-nums"
          />
        </Field>
        <Field label="Recámaras" htmlFor="bedrooms">
          <Input
            id="bedrooms"
            name="bedrooms"
            type="number"
            min={0}
            defaultValue={defaults.bedrooms ?? 1}
            className="tabular-nums"
          />
        </Field>
        <Field label="Baños" htmlFor="bathrooms">
          <Input
            id="bathrooms"
            name="bathrooms"
            type="number"
            min={0}
            defaultValue={defaults.bathrooms ?? 1}
            className="tabular-nums"
          />
        </Field>
        <Field label="Metros²" htmlFor="sizeM2">
          <Input
            id="sizeM2"
            name="sizeM2"
            type="number"
            min={0}
            step={0.5}
            defaultValue={defaults.sizeM2 ?? ""}
            className="tabular-nums"
          />
        </Field>
      </div>

      <Field label="Descripción" htmlFor="description">
        <Textarea
          id="description"
          name="description"
          rows={2}
          defaultValue={defaults.description ?? ""}
          placeholder="Amueblado, baño propio, ventana a la calle…"
        />
      </Field>
    </div>
  );
}
