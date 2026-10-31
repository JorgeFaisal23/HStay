"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { setServiceAmount } from "@/server/actions/services";

/**
 * Captura manual del monto de un servicio.
 *
 * Guarda al salir del campo (o con Enter), muestra el valor nuevo de inmediato
 * y revierte si el servidor rechaza el cambio. Dejar el campo vacío borra la
 * captura, que es la forma natural de deshacer.
 */
export function AmountInput({
  accountId,
  period,
  initialAmount,
  label,
  editable,
}: {
  accountId: string;
  period: string;
  initialAmount: number | null;
  label: string;
  editable: boolean;
}) {
  const fromServer = initialAmount === null ? "" : String(initialAmount);

  const [value, setValue] = useState(fromServer);
  /** Último valor confirmado; sirve para no reenviar si nada cambió. */
  const [saved, setSaved] = useState(fromServer);
  const [lastSeen, setLastSeen] = useState(fromServer);
  const [pending, startTransition] = useTransition();

  // Si el servidor manda un valor distinto (por ejemplo tras copiar los montos
  // del mes anterior), el campo debe reflejarlo. Se ajusta durante el render
  // comparando contra el último valor recibido: es la forma recomendada de
  // sincronizar estado con una prop, sin pasar por un efecto.
  if (lastSeen !== fromServer) {
    setLastSeen(fromServer);
    setValue(fromServer);
    setSaved(fromServer);
  }

  if (!editable) {
    return (
      <span className="block text-right text-sm tabular-nums">
        {initialAmount === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          initialAmount.toLocaleString("es-MX", { minimumFractionDigits: 2 })
        )}
      </span>
    );
  }

  const commit = () => {
    const trimmed = value.trim();
    if (trimmed === saved) return;

    const amount = trimmed === "" ? null : Number(trimmed);
    if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
      toast.error("Escribe un monto válido.");
      setValue(saved);
      return;
    }

    const previous = saved;
    setSaved(trimmed);

    startTransition(async () => {
      const result = await setServiceAmount({ accountId, period, amount });
      if (result.error) {
        toast.error(result.error);
        setSaved(previous);
        setValue(previous);
      }
    });
  };

  return (
    <input
      type="number"
      inputMode="decimal"
      min={0}
      step={1}
      value={value}
      aria-label={label}
      placeholder="—"
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
        if (e.key === "Escape") {
          setValue(saved);
          e.currentTarget.blur();
        }
      }}
      className={cn(
        "h-8 w-full min-w-20 rounded-lg border border-transparent bg-transparent px-2 text-right text-sm tabular-nums transition-colors",
        "hover:border-input focus:border-ring focus:ring-ring/40 focus:bg-popover focus:ring-3 focus:outline-none",
        "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
        value === "" && "text-muted-foreground",
        pending && "opacity-60",
      )}
    />
  );
}
