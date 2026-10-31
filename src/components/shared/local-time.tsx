"use client";

import { useSyncExternalStore } from "react";

const FORMATS = {
  /** "14:15" */
  time: { hour: "2-digit", minute: "2-digit" },
  /** "31 oct, 14:15" */
  dateTime: { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" },
} satisfies Record<string, Intl.DateTimeFormatOptions>;

const subscribe = () => () => {};

/**
 * Hora en la zona del navegador. El servidor corre en UTC, así que una hora
 * formateada allá saldría corrida; esta se pinta en el cliente (en el render
 * del servidor muestra la de UTC y se corrige al hidratar).
 */
export function LocalTime({
  value,
  format = "time",
}: {
  value: Date | string;
  format?: keyof typeof FORMATS;
}) {
  const date = typeof value === "string" ? new Date(value) : value;
  const isClient = useSyncExternalStore(subscribe, () => true, () => false);
  const text = new Intl.DateTimeFormat("es-MX", {
    ...FORMATS[format],
    ...(isClient ? {} : { timeZone: "UTC" }),
  }).format(date);

  return (
    <time dateTime={date.toISOString()} className="tabular-nums">
      {text}
    </time>
  );
}
