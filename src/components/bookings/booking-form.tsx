"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { ButtonLink } from "@/components/shared/button-link";
import { Field, FormError, NativeSelect } from "@/components/shared/form-field";
import { useFormAction } from "@/hooks/use-form-action";
import { createBooking, updateBooking } from "@/server/actions/bookings";
import { money } from "@/lib/format";
import { BOOKING_SOURCE_LABELS } from "@/lib/labels";
import { nightsBetween } from "@/lib/services/booking-dates";
import type { BookableUnit, BookingDetail } from "@/lib/queries/bookings";

const SOURCES = ["MANUAL", "DIRECT", "AIRBNB"] as const;

/** Mañana y pasado mañana en AAAA-MM-DD, como valores iniciales. */
function isoDaysFromToday(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Tarifas de referencia de la unidad, en una línea. */
function rateHint(unit: BookableUnit | undefined) {
  if (!unit) return undefined;
  const parts = [
    unit.nightlyPrice !== null ? `${money(unit.nightlyPrice, unit.currency)} noche` : null,
    unit.weeklyPrice !== null ? `${money(unit.weeklyPrice, unit.currency)} semana` : null,
    unit.monthlyPrice !== null ? `${money(unit.monthlyPrice, unit.currency)} mes` : null,
  ].filter(Boolean);
  const base = `Monto total de la estancia, en ${unit.currency}.`;
  return parts.length ? `${base} Tarifas de la unidad: ${parts.join(" · ")}.` : base;
}

export function BookingForm({
  units,
  booking,
  defaultUnitId,
}: {
  units: BookableUnit[];
  /** Si viene, el formulario edita esa reserva. */
  booking?: BookingDetail;
  defaultUnitId?: string;
}) {
  const router = useRouter();
  const editing = Boolean(booking);
  const { onSubmit, pending, error } = useFormAction(
    editing ? updateBooking : createBooking,
    {
      onSuccess: () => {
        if (editing) {
          toast.success("Reserva actualizada.");
          router.refresh();
        }
      },
    },
  );

  const [unitId, setUnitId] = useState(booking?.unitId ?? defaultUnitId ?? "");
  const [checkIn, setCheckIn] = useState(booking?.checkIn ?? isoDaysFromToday(1));
  const [checkOut, setCheckOut] = useState(booking?.checkOut ?? isoDaysFromToday(2));

  const selectedUnit = units.find((u) => u.id === unitId);
  const nights = checkIn && checkOut ? nightsBetween(checkIn, checkOut) : 0;

  // Agrupa las unidades por propiedad para el selector.
  const groups = useMemo(() => {
    const map = new Map<string, BookableUnit[]>();
    for (const unit of units) {
      map.set(unit.buildingName, [...(map.get(unit.buildingName) ?? []), unit]);
    }
    return [...map.entries()];
  }, [units]);

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {booking ? <input type="hidden" name="bookingId" value={booking.id} /> : null}

      {/* ------------------------------------------------------- estancia */}
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Field label="Unidad" htmlFor="unitId" required>
            <NativeSelect
              id="unitId"
              name="unitId"
              required
              value={unitId}
              onChange={(e) => setUnitId(e.target.value)}
            >
              <option value="" disabled>
                Elige la unidad…
              </option>
              {groups.map(([buildingName, list]) => (
                <optgroup key={buildingName} label={buildingName}>
                  {list.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {buildingName} · {unit.code} ({unit.currency})
                    </option>
                  ))}
                </optgroup>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Origen" htmlFor="source">
            <NativeSelect id="source" name="source" defaultValue={booking?.source ?? "MANUAL"}>
              {SOURCES.map((source) => (
                <option key={source} value={source}>
                  {BOOKING_SOURCE_LABELS[source]}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Entrada" htmlFor="checkIn" required>
            <Input
              id="checkIn"
              name="checkIn"
              type="date"
              required
              value={checkIn}
              onChange={(e) => setCheckIn(e.target.value)}
            />
          </Field>
          <Field
            label="Salida"
            htmlFor="checkOut"
            required
            hint={nights >= 1 ? `${nights} ${nights === 1 ? "noche" : "noches"}.` : undefined}
          >
            <Input
              id="checkOut"
              name="checkOut"
              type="date"
              required
              min={checkIn || undefined}
              value={checkOut}
              onChange={(e) => setCheckOut(e.target.value)}
            />
          </Field>
          <Field label="Huéspedes" htmlFor="guests" required>
            <Input
              id="guests"
              name="guests"
              type="number"
              min={1}
              max={50}
              required
              defaultValue={booking?.guests ?? 1}
              className="tabular-nums"
            />
          </Field>
        </div>

        <Field
          label={`Monto total${selectedUnit ? ` (${selectedUnit.currency})` : ""}`}
          htmlFor="totalAmount"
          required
          hint={rateHint(selectedUnit)}
        >
          <Input
            id="totalAmount"
            name="totalAmount"
            type="number"
            min={0}
            step="0.01"
            required
            defaultValue={booking?.totalAmount}
            className="tabular-nums sm:max-w-60"
          />
        </Field>
      </div>

      <Separator />

      {/* -------------------------------------------------------- huésped */}
      <div className="space-y-4">
        <h2 className="font-medium">Huésped</h2>
        <Field label="Nombre completo" htmlFor="guestName" required>
          <Input
            id="guestName"
            name="guestName"
            required
            defaultValue={booking?.guestName}
            placeholder="Nombre de quien reserva"
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Correo" htmlFor="guestEmail" hint="Opcional.">
            <Input
              id="guestEmail"
              name="guestEmail"
              type="email"
              defaultValue={booking?.guestEmail ?? ""}
            />
          </Field>
          <Field label="Teléfono" htmlFor="guestPhone" hint="Opcional.">
            <Input id="guestPhone" name="guestPhone" defaultValue={booking?.guestPhone ?? ""} />
          </Field>
        </div>
        <Field label="Notas" htmlFor="notes">
          <Textarea id="notes" name="notes" rows={2} defaultValue={booking?.notes ?? ""} />
        </Field>
      </div>

      <FormError message={error} />

      <div className="flex flex-wrap justify-end gap-2">
        <ButtonLink href="/reservas" variant="outline">
          {editing ? "Volver" : "Cancelar"}
        </ButtonLink>
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : editing ? "Guardar cambios" : "Guardar reserva"}
        </Button>
      </div>
    </form>
  );
}
