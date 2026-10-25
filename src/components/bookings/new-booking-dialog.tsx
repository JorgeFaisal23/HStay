"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus } from "lucide-react";
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
import { createBooking } from "@/server/actions/bookings";
import { money } from "@/lib/format";
import { quoteLabel, quoteStay, type StayRates } from "@/lib/rates";

export type BookableUnit = {
  id: string;
  label: string;
  /** Tarifas de estancia, para sugerir el total (ver src/lib/rates.ts). */
  rates: StayRates;
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
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const [selected, setSelected] = useState(unitId ?? "");
  const [checkIn, setCheckIn] = useState(() => localDateInput());
  const [checkOut, setCheckOut] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return localDateInput(0, tomorrow);
  });
  // El total se sugiere con noches × tarifa hasta que alguien lo escribe.
  const [total, setTotal] = useState<string | null>(null);

  const unit = units.find((u) => u.id === selected);
  const nights = nightsBetween(checkIn, checkOut);
  const quote = unit ? quoteStay(nights, unit.rates) : null;
  const suggested = quote ? String(quote.total) : "";

  function reset() {
    setError(undefined);
    setTotal(null);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger
        render={
          <Button variant={variant} size={variant === "outline" ? "sm" : "default"}>
            <CalendarPlus className="size-4" aria-hidden />
            Nueva reserva
          </Button>
        }
      />
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <form
          action={(formData) =>
            startTransition(async () => {
              const result = await createBooking({}, formData);
              if (result.error) {
                setError(result.error);
                return;
              }
              setOpen(false);
              reset();
              toast.success("Reserva registrada.");
              router.refresh();
            })
          }
        >
          <DialogHeader>
            <DialogTitle>Nueva reserva</DialogTitle>
            <DialogDescription>
              Una estancia corta acordada directamente o que quieres apartar en
              el calendario. Se rechaza si se cruza con otra reserva o con un
              contrato.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {unitId ? (
              <input type="hidden" name="unitId" value={unitId} />
            ) : (
              <Field label="Unidad" htmlFor="booking-unit" required>
                <NativeSelect
                  id="booking-unit"
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

            <Field label="Huésped" htmlFor="guestName" required>
              <Input id="guestName" name="guestName" required placeholder="Nombre completo" />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Correo" htmlFor="guestEmail">
                <Input id="guestEmail" name="guestEmail" type="email" placeholder="huesped@correo.com" />
              </Field>
              <Field label="Teléfono" htmlFor="guestPhone">
                <Input id="guestPhone" name="guestPhone" type="tel" placeholder="55 1234 5678" />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Llegada" htmlFor="checkIn" required>
                <Input
                  id="checkIn"
                  name="checkIn"
                  type="date"
                  required
                  value={checkIn}
                  onChange={(e) => setCheckIn(e.target.value)}
                />
              </Field>
              <Field label="Salida" htmlFor="checkOut" required>
                <Input
                  id="checkOut"
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
              <Field label="Huéspedes" htmlFor="guests" required>
                <Input id="guests" name="guests" type="number" min={1} max={50} defaultValue={1} required className="tabular-nums" />
              </Field>
              <Field
                label="Total de la estancia"
                htmlFor="totalAmount"
                required
                hint={
                  nights === 0
                    ? undefined
                    : quote
                      ? `${nights} ${nights === 1 ? "noche" : "noches"}: ${quoteLabel(quote)} = ${money(quote.total)}.`
                      : `${nights} ${nights === 1 ? "noche" : "noches"}. La unidad no tiene tarifas de estancia: escribe el total.`
                }
              >
                <Input
                  id="totalAmount"
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

            <Field label="Origen" htmlFor="source">
              <NativeSelect id="source" name="source" defaultValue="DIRECT">
                <option value="DIRECT">Reserva directa</option>
                <option value="MANUAL">Registro manual</option>
              </NativeSelect>
            </Field>

            <Field label="Notas" htmlFor="booking-notes">
              <Textarea id="booking-notes" name="notes" rows={2} maxLength={500} />
            </Field>

            <FormError message={error} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : "Registrar reserva"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
