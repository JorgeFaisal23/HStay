/**
 * Qué días de un mes ocupa una estancia corta, para dibujar su barra.
 *
 * Una reserva ocupa las noches de la llegada a la víspera de la salida: el día
 * de salida la unidad ya queda libre. Por eso una estancia que sale el día 1
 * no ocupa ninguna noche de ese mes y no debe dibujarse en él.
 */
export function stayDaysInMonth(
  checkIn: Date,
  checkOut: Date,
  year: number,
  month: number,
): { startDay: number; endDay: number; continuesBefore: boolean; continuesAfter: boolean } | null {
  const totalDays = new Date(year, month + 1, 0).getDate();
  const first = new Date(year, month, 1);
  const nextMonth = new Date(year, month + 1, 1);

  // Días calendario locales, sin la hora.
  const start = new Date(checkIn.getFullYear(), checkIn.getMonth(), checkIn.getDate());
  const out = new Date(checkOut.getFullYear(), checkOut.getMonth(), checkOut.getDate());
  // Última noche ocupada; una estancia de cero noches ocupa al menos su llegada.
  const lastNight = out > start ? new Date(out.getFullYear(), out.getMonth(), out.getDate() - 1) : start;

  if (lastNight < first || start >= nextMonth) return null;

  const continuesBefore = start < first;
  const continuesAfter = lastNight >= nextMonth;
  return {
    startDay: continuesBefore ? 1 : start.getDate(),
    endDay: continuesAfter ? totalDays : lastNight.getDate(),
    continuesBefore,
    continuesAfter,
  };
}
