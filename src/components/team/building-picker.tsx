"use client";

import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

/**
 * Casillas para elegir propiedades (rol Captura). La selección viaja como
 * campos ocultos `buildingIds`, uno por propiedad, para que el servidor reciba
 * siempre exactamente lo que se ve marcado.
 */
export function BuildingPicker({
  buildings,
  defaultSelected = [],
  idPrefix,
}: {
  buildings: { id: string; name: string }[];
  defaultSelected?: string[];
  /** Para que las ids de las casillas no se repitan si hay varios en la página. */
  idPrefix: string;
}) {
  const [selected, setSelected] = useState<string[]>(defaultSelected);

  const toggle = (id: string, checked: boolean) =>
    setSelected((current) => (checked ? [...new Set([...current, id])] : current.filter((x) => x !== id)));

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">
        Propiedades <span className="text-muted-foreground font-normal">(solo verá estas)</span>
      </legend>
      {buildings.length === 0 ? (
        <p className="text-muted-foreground text-sm">Registra una propiedad primero.</p>
      ) : (
        <ul className="space-y-2">
          {buildings.map((building) => {
            const id = `${idPrefix}-${building.id}`;
            return (
              <li key={building.id} className="flex items-center gap-2">
                <Checkbox
                  id={id}
                  checked={selected.includes(building.id)}
                  onCheckedChange={(checked) => toggle(building.id, checked === true)}
                />
                <Label htmlFor={id} className="font-normal">
                  {building.name}
                </Label>
              </li>
            );
          })}
        </ul>
      )}
      {selected.map((id) => (
        <input key={id} type="hidden" name="buildingIds" value={id} />
      ))}
    </fieldset>
  );
}
