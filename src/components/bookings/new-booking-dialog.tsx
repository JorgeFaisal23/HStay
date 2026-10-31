"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Pencil } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { Field, FormError, NativeSelect } from "@/components/shared/form-field";
import { localDateInput } from "@/components/leases/lease-terms-fields";
import { useFormAction } from "@/hooks/use-form-action";
import { createBooking, updateBooking } from "@/server/actions/bookings";
import { money } from "@/lib/format";
import type { Currency } from "@/lib/currency";
import { quoteLabel, quoteStay, type StayRates } from "@/lib/rates";

export type BookableUnit = {
  id: string;
  label: string;
  /** Tarifas de estancia, para sugerir el total (ver src/lib/rates.ts). */
  rates: StayRates;
  /** Moneda de la propiedad: la del total y las tarifas. */
  currency: Currency;
};

/** Datos de una reserva existente para el diálogo de edición. */
export type EditableBooking = {
  id: string;
  unitId: string;
  source: "MANUAL" | "DIRECT";
  guestName: string;
  guestEmail: string | null;
  guestPhone: string | null;
  /** AAAA-MM-DD */
  checkIn: string;
  checkOut: string;
  guests: number;
  totalAmount: number;
  notes: string | null;
};

function nightsBetween(checkIn: string, checkOut: string) {
  const start = new Date(`${checkIn}T12:00:00`).getTime();
  const end = new Date(`${checkOut}T12:00:00`).getTime();
  const nights = Math.round((end - start) / 86_400_000);
  return Number.isFinite(nights) && nights > 0 ? nights : 0;
}

/**
 * Captura de una estancia corta (directa o registrada a mano). Con `unitId`
 * la unidad queda fija; si no, se elige de la lista.
 */
export function NewBookingDialog({
  units,
  unitId,
  variant = "outline",
}: {
  units: BookableUnit[];
  unitId?: string;
  variant?: "default" | "outline";
}) {
  return (
    <BookingDialog
      units={units}
      fixedUnitId={unitId}
      trigger={
        <Button variant={variant} size={variant === "outline" ? "sm" : "default"}>
          <CalendarPlus className="size-4" aria-hidden />
          Nueva reserva
        </Button>
      }
    />
  );
}

/** Corrige una reserva: huésped, fechas, unidad, total o notas. */
export function EditBookingDialog({
  units,
  booking,
  size = "sm",
}: {
  units: BookableUnit[];
  booking: EditableBooking;
  size?: "sm" | "default";
}) {
  return (
    <BookingDialog
      units={units}
      booking={booking}
      trigger={
        <Button variant="outline" size={size}>
          <Pencil className="size-4" aria-hidden />
          Editar
        </Button>
      }
    />
  );
}

function BookingDialog({
  units,
  fixedUnitId,
  booking,
  trigger,
}: {
  units: BookableUnit[];
  fixedUnitId?: string;
  booking?: EditableBooking;
  trigger: React.ReactElement;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const editing = Boolean(booking);

  const initialCheckIn = () => booking?.checkIn ?? localDateInput();
  const initialCheckOut = () => {
    if (booking) return booking.checkOut;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return localDateInput(0, tomorrow);
  };

  const [selected, setSelected] = useState(booking?.unitId ?? fixedUnitId ?? "");
  const [checkIn, setCheckIn] = useState(initialCheckIn);
  const [checkOut, setCheckOut] = useState(initialCheckOut);
  // El total se sugiere con noches × tarifa hasta que alguien lo escribe. Al
  // editar se parte del total guardado.
  const [total, setTotal] = useState<string | null>(
    booking ? String(booking.totalAmount) : null,
  );

  const unit = units.find((u) => u.id === selected);
  const nights = nightsBetween(checkIn, checkOut);
  const quote = unit ? quoteStay(nights, unit.rates) : null;
  const suggested = quote ? String(quote.total) : "";

  // onSubmit en vez de action: si hay un error, lo capturado no se borra.
  const { onSubmit, pending, error, clearError } = useFormAction(
    (formData) => (booking ? updateBooking(booking.id, formData) : createBooking({}, formData)),
    {
      onSuccess: () => {
        setOpen(false);
        if (!editing) reset();
        toast.success(editing ? "Reserva actualizada." : "Reserva registrada.");
        router.refresh();
      },
    },
  );

  // Al cerrar sin guardar, la próxima vez abre con los datos originales.
  function reset() {
    clearError();
    setSelected(booking?.unitId ?? fixedUnitId ?? "");
    setCheckIn(initialCheckIn());
    setCheckOut(initialCheckOut());
    setTotal(booking ? String(booking.totalAmount) : null);
  }

  // Las ids de los campos llevan el de la reserva: en una lista puede haber
  // varios diálogos montados a la vez.
  const id = (name: string) => `${booking?.id ?? "new"}-${name}`;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar reserva" : "Nueva reserva"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Corrige los datos de la estancia. Si cambias la salida, la limpieza pendiente se mueve a la nueva fecha."
                : "Una estancia corta acordada directamente o que quieres apartar en el calendario. Se rechaza si se cruza con otra reserva o con un contrato."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {fixedUnitId && !editing ? (
              <input type="hidden" name="unitId" value={fixedUnitId} />
            ) : (
              <Field label="Unidad" htmlFor={id("unit")} required>
                <NativeSelect
                  id={id("unit")}
                  name="unitId"
                  required
                  value={selected}
                  onChange={(e) => setSelected(e.target.value)}
                >
                  <option value="" disabled>
                    Elige la unidad
                  </option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            )}

            <Field label="Huésped" htmlFor={id("guestName")} required>
              <Input
                id={id("guestName")}
                name="guestName"
                required
                placeholder="Nombre completo"
                defaultValue={booking?.guestName}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Correo" htmlFor={id("guestEmail")} hint="Opcional.">
                <Input
                  id={id("guestEmail")}
                  name="guestEmail"
                  type="email"
                  placeholder="huesped@correo.com"
                  defaultValue={booking?.guestEmail ?? ""}
                />
              </Field>
              <Field label="Teléfono" htmlFor={id("guestPhone")} hint="Opcional.">
                <Input
                  id={id("guestPhone")}
                  name="guestPhone"
                  type="tel"
                  placeholder="55 1234 5678"
                  defaultValue={booking?.guestPhone ?? ""}
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Llegada" htmlFor={id("checkIn")} required>
                <Input
                  id={id("checkIn")}
                  name="checkIn"
                  type="date"
                  required
                  value={checkIn}
                  onChange={(e) => setCheckIn(e.target.value)}
                />
              </Field>
              <Field label="Salida" htmlFor={id("checkOut")} required>
                <Input
                  id={id("checkOut")}
                  name="checkOut"
                  type="date"
                  required
                  min={checkIn}
                  value={checkOut}
                  onChange={(e) => setCheckOut(e.target.value)}
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Huéspedes" htmlFor={id("guests")} required>
                <Input
                  id={id("guests")}
                  name="guests"
                  type="number"
                  min={1}
                  max={50}
                  defaultValue={booking?.guests ?? 1}
                  required
                  className="tabular-nums"
                />
              </Field>
              <Field
                label={`Total de la estancia${unit ? ` (${unit.currency})` : ""}`}
                htmlFor={id("totalAmount")}
                required
                hint={
                  nights === 0
                    ? undefined
                    : quote
                      ? `${nights} ${nights === 1 ? "noche" : "noches"}: ${quoteLabel(quote)} = ${money(quote.total, unit?.currency)}.`
                      : `${nights} ${nights === 1 ? "noche" : "noches"}. La unidad no tiene tarifas de estancia: escribe el total.`
                }
              >
                <Input
                  id={id("totalAmount")}
                  name="totalAmount"
                  type="number"
                  min={0}
                  step="0.01"
                  required
                  value={total ?? suggested}
                  onChange={(e) => setTotal(e.target.value)}
                  className="text-right tabular-nums"
                />
              </Field>
            </div>

            <Field label="Origen" htmlFor={id("source")}>
              <NativeSelect id={id("source")} name="source" defaultValue={booking?.source ?? "DIRECT"}>
                <option value="DIRECT">Reserva directa</option>
                <option value="MANUAL">Registro manual</option>
              </NativeSelect>
            </Field>

            <Field label="Notas" htmlFor={id("notes")}>
              <Textarea
                id={id("notes")}
                name="notes"
                rows={2}
                maxLength={500}
                defaultValue={booking?.notes ?? ""}
              />
            </Field>

            <FormError message={error} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Volver
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : editing ? "Guardar cambios" : "Registrar reserva"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
