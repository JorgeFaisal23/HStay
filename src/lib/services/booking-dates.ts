import { differenceInCalendarDays, parseISO } from "date-fns";

/**
 * Reglas de fechas de una reserva de corta estancia.
 *
 * Una estancia ocupa las noches de `checkIn` a `checkOut`, sin incluir el día
 * de salida: ese día la unidad ya se puede volver a rentar. Por eso dos
 * reservas en las que una sale el mismo día que llega la otra no chocan.
 *
 * Las fechas van como "AAAA-MM-DD" para no depender de la zona horaria.
 */

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDay(value: string) {
  return ISO_DAY.test(value) && !Number.isNaN(parseISO(value).getTime());
}

/** Noches entre la entrada y la salida. 0 o negativo si las fechas no sirven. */
export function nightsBetween(checkIn: string, checkOut: string) {
  return differenceInCalendarDays(parseISO(checkOut), parseISO(checkIn));
}

/**
 * Dos estancias chocan si comparten al menos una noche. Ambas se tratan como
 * intervalos [inicio, fin): el día de salida no cuenta como ocupado.
 */
export function staysOverlap(
  a: { start: string; end: string },
  b: { start: string; end: string },
) {
  return a.start < b.end && b.start < a.end;
}
