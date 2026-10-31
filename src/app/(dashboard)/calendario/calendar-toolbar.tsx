"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/shared/form-field";
import { periodKey, periodLabel, shiftPeriod } from "@/lib/format";

const PERIOD_PATTERN = /^\d{4}-\d{2}$/;

/**
 * Navegación del calendario: mes anterior y siguiente, salto directo a
 * cualquier mes, filtro por propiedad y búsqueda por persona o unidad.
 */
export function CalendarToolbar({
  period,
  buildings,
  buildingId,
  search,
}: {
  period: string;
  buildings: { id: string; name: string }[];
  buildingId?: string;
  search?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();

  const go = (next: Partial<{ mes: string; edificio: string; q: string }>) => {
    const query = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) query.set(key, value);
      else query.delete(key);
    }
    router.push(`/calendario?${query.toString()}`);
  };

  const currentPeriod = periodKey(new Date());

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          aria-label="Mes anterior"
          onClick={() => go({ mes: shiftPeriod(period, -1) })}
        >
          <ChevronLeft className="size-4" aria-hidden />
        </Button>
        {/* Selector de mes: también sirve para saltar directo a otro año. */}
        <Input
          type="month"
          aria-label={`Mes mostrado: ${periodLabel(period)}. Cambiar de mes`}
          value={period}
          onChange={(e) => {
            if (PERIOD_PATTERN.test(e.target.value)) go({ mes: e.target.value });
          }}
          className="w-44 font-medium"
        />
        <Button
          variant="outline"
          size="icon"
          aria-label="Mes siguiente"
          onClick={() => go({ mes: shiftPeriod(period, 1) })}
        >
          <ChevronRight className="size-4" aria-hidden />
        </Button>
      </div>

      {period !== currentPeriod ? (
        <Button variant="ghost" onClick={() => go({ mes: currentPeriod })}>
          Hoy
        </Button>
      ) : null}

      <NativeSelect
        aria-label="Filtrar por propiedad"
        value={buildingId ?? ""}
        onChange={(e) => go({ edificio: e.target.value })}
        className="w-56"
      >
        <option value="">Todas las propiedades</option>
        {buildings.map((building) => (
          <option key={building.id} value={building.id}>
            {building.name}
          </option>
        ))}
      </NativeSelect>

      <form
        // key: si la búsqueda cambia por fuera (p. ej. al quitarla), el campo se reinicia.
        key={search ?? ""}
        role="search"
        className="flex items-center gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          const value = new FormData(e.currentTarget).get("q");
          go({ q: typeof value === "string" ? value.trim() : "" });
        }}
      >
        <Input
          name="q"
          type="search"
          aria-label="Buscar persona o unidad"
          placeholder="Persona o unidad"
          defaultValue={search}
          className="w-44"
        />
        <Button type="submit" variant="outline" size="icon" aria-label="Buscar">
          <Search className="size-4" aria-hidden />
        </Button>
        {search ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Quitar búsqueda"
            onClick={() => go({ q: "" })}
          >
            <X className="size-4" aria-hidden />
          </Button>
        ) : null}
      </form>
    </div>
  );
}
