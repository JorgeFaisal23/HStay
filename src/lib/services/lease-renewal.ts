import { addMonths, differenceInCalendarMonths, format, parseISO } from "date-fns";

/**
 * Propuesta de fechas para renovar un contrato. Es solo un valor inicial del
 * formulario: el usuario puede cambiarlo antes de guardar.
 *
 * - El nuevo periodo empieza donde terminó el anterior y dura lo mismo
 *   (entre 1 y 12 meses).
 * - Si el contrato venció hace tiempo, los periodos se recorren hasta llegar
 *   al que incluye la fecha de hoy: es el caso de contratos que se renovaron
 *   de palabra y nunca se actualizaron en el sistema.
 *
 * Todas las fechas van y vienen como "AAAA-MM-DD" para no depender de la zona
 * horaria del servidor.
 */
export function suggestRenewal(
  previousStart: string,
  previousEnd: string,
  today: string,
): { startDate: string; endDate: string; months: number } {
  const start = parseISO(previousStart);
  const end = parseISO(previousEnd);
  const now = parseISO(today);

  const months = Math.min(12, Math.max(1, differenceInCalendarMonths(end, start)));

  // Se calcula siempre desde el fin original (end + n·meses) para que un 31
  // no se convierta en 28 y se quede así en los periodos siguientes.
  let step = 0;
  let nextStart = end;
  let nextEnd = addMonths(end, months);
  while (nextEnd <= now && step < 240) {
    step++;
    nextStart = addMonths(end, months * step);
    nextEnd = addMonths(end, months * (step + 1));
  }

  return {
    startDate: format(nextStart, "yyyy-MM-dd"),
    endDate: format(nextEnd, "yyyy-MM-dd"),
    months,
  };
}

/** Día calendario (UTC) de una fecha guardada en la base, como "AAAA-MM-DD". */
export function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Fecha de formulario a Date; mediodía UTC para que no cambie de día. */
export function dayToDate(day: string): Date {
  return new Date(`${day}T12:00:00Z`);
}
