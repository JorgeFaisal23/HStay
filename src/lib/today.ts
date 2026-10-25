import type { Tone } from "@/lib/labels";
import { startOfToday } from "@/lib/payments";
import { daysBetween } from "@/lib/format";

/**
 * "Hoy": lo que necesita atención, armado a partir de los datos.
 *
 * No hay tabla de tareas: cada pendiente se deriva en cada carga de un dato de
 * origen (un cargo vencido, una reserva, un contrato…). Resolverlo es cambiar
 * ese dato, y entonces el pendiente desaparece solo. Así nada se captura dos
 * veces y nada se queda desactualizado: si una reserva cambia de fecha o se
 * cancela, su llegada y su limpieza cambian o desaparecen con ella.
 *
 * Este módulo es puro (sin base de datos) para poder probarlo; la consulta
 * vive en src/lib/queries/today.ts.
 */

/** Cuántos días hacia adelante se muestran llegadas, salidas y entregas. */
export const LOOKAHEAD_DAYS = 7;
/** Contratos por vencer: los mismos 60 días que avisa el resumen. */
export const LEASE_WARNING_DAYS = 60;
/** A partir de cuántos días un contrato por vencer pasa a urgente. */
const LEASE_URGENT_DAYS = 30;

export type TodayGroup = "cobros" | "estancias" | "contratos" | "servicios";

export const TODAY_GROUPS: { id: TodayGroup; title: string; description: string }[] = [
  { id: "cobros", title: "Cobros", description: "Rentas vencidas y cargos del mes por generar." },
  {
    id: "estancias",
    title: "Llegadas, salidas y limpieza",
    description: `Lo que pasa en tus unidades en los próximos ${LOOKAHEAD_DAYS} días.`,
  },
  { id: "contratos", title: "Contratos", description: "Contratos que vencen pronto: renueva o prepara la salida." },
  { id: "servicios", title: "Servicios", description: "Recibos del mes que aún no tienen monto." },
];

export type TodayAction =
  | { kind: "payment"; chargeId: string; tenantName: string; amount: number; paidAmount: number }
  | { kind: "generate"; period: string; count: number }
  | { kind: "link"; href: string; label: string };

export type TodayItem = {
  /** Estable entre cargas: el tipo y el id del dato de origen. */
  key: string;
  group: TodayGroup;
  tone: Tone;
  status: string;
  title: string;
  /** Propiedad y unidad. */
  place: string;
  /** Con quién es el asunto: inquilino, huésped… */
  person: { role: string; name: string } | null;
  /** La fecha del asunto, o null si es de todo el periodo. */
  date: Date | null;
  /** Días de hoy a `date` (negativo: ya pasó). */
  days: number;
  /** Texto de la fecha cuando no hay una concreta (p. ej. el periodo). */
  when?: string;
  /** Monto en juego (lo que falta por cobrar). */
  amount?: number;
  note?: string;
  action: TodayAction;
};

type Place = { unitId: string; unitCode: string; buildingName: string };

export type TodayInput = {
  /** Periodo en curso, "YYYY-MM". */
  period: string;
  periodName: string;
  /** Cargos sin liquidar cuya fecha de pago ya pasó. */
  overdueCharges: (Place & {
    id: string;
    periodName: string;
    dueDate: Date;
    amount: number;
    paidAmount: number;
    tenantId: string;
    tenantName: string;
  })[];
  /** Contratos vigentes sin cargo del periodo (ver chargeableLeasesWhere). */
  missingCharges: (Place & { tenantName: string; dueDate: Date })[];
  /** Reservas confirmadas que entran o salen en la ventana. */
  bookings: (Place & {
    id: string;
    guestName: string;
    guests: number;
    checkIn: Date;
    checkOut: Date;
  })[];
  /** Contratos vigentes que empiezan en la ventana (entrega de la unidad). */
  moveIns: (Place & { id: string; tenantId: string; tenantName: string; startDate: Date })[];
  /** Contratos vigentes que vencen dentro de LEASE_WARNING_DAYS. */
  expiringLeases: (Place & { id: string; tenantId: string; tenantName: string; endDate: Date })[];
  /** Cuentas de servicio activas sin monto del periodo, por propiedad. */
  servicesMissing: { buildingId: string; buildingName: string; count: number }[];
};

function placeLabel(place: Place) {
  return `${place.buildingName} · Unidad ${place.unitCode}`;
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

/** Días enteros de hoy a la fecha, contando por día de calendario. */
function dayOffset(date: Date, today: Date) {
  return daysBetween(today, new Date(date.getFullYear(), date.getMonth(), date.getDate()));
}

function namesList(names: string[], max = 2) {
  const unique = [...new Set(names)];
  if (unique.length <= max) return unique.join(" y ");
  return `${unique.slice(0, max).join(", ")} y ${unique.length - max} más`;
}

export function buildTodayItems(input: TodayInput, now = new Date()): TodayItem[] {
  const today = startOfToday(now);
  const inWindow = (date: Date) => {
    const days = dayOffset(date, today);
    return days >= 0 && days < LOOKAHEAD_DAYS;
  };
  const items: TodayItem[] = [];

  // ---------------------------------------------------------------- cobros
  for (const charge of input.overdueCharges) {
    items.push({
      key: `charge:${charge.id}`,
      group: "cobros",
      tone: "danger",
      status: "Vencido",
      title: `Renta de ${charge.periodName.toLowerCase()} sin liquidar`,
      place: placeLabel(charge),
      person: { role: "Inquilino", name: charge.tenantName },
      date: charge.dueDate,
      days: dayOffset(charge.dueDate, today),
      amount: Math.max(0, charge.amount - charge.paidAmount),
      note: charge.paidAmount > 0 ? "Tiene un abono parcial." : undefined,
      action: {
        kind: "payment",
        chargeId: charge.id,
        tenantName: charge.tenantName,
        amount: charge.amount,
        paidAmount: charge.paidAmount,
      },
    });
  }

  if (input.missingCharges.length > 0) {
    const count = input.missingCharges.length;
    const first = input.missingCharges.reduce((min, c) => (c.dueDate < min ? c.dueDate : min), input.missingCharges[0].dueDate);
    items.push({
      key: `generate:${input.period}`,
      group: "cobros",
      tone: "warning",
      status: "Por generar",
      title:
        count === 1
          ? `Falta el cargo de renta de ${input.periodName.toLowerCase()}`
          : `Faltan ${count} cargos de renta de ${input.periodName.toLowerCase()}`,
      place: namesList(input.missingCharges.map((c) => c.buildingName)),
      person: { role: count === 1 ? "Inquilino" : "Inquilinos", name: namesList(input.missingCharges.map((c) => c.tenantName)) },
      date: first,
      days: dayOffset(first, today),
      note: "Sin el cargo no se puede registrar el pago ni avisar si se atrasa.",
      action: { kind: "generate", period: input.period, count },
    });
  }

  // ---------------------------------------------------------------- estancias
  for (const booking of input.bookings) {
    if (inWindow(booking.checkIn)) {
      const nights = Math.max(1, daysBetween(booking.checkIn, booking.checkOut));
      items.push({
        key: `arrival:${booking.id}`,
        group: "estancias",
        tone: "info",
        status: "Llegada",
        title: `Llega ${booking.guestName}`,
        place: placeLabel(booking),
        person: { role: "Huésped", name: booking.guestName },
        date: booking.checkIn,
        days: dayOffset(booking.checkIn, today),
        note: `${nights === 1 ? "1 noche" : `${nights} noches`} · ${booking.guests === 1 ? "1 huésped" : `${booking.guests} huéspedes`}`,
        action: { kind: "link", href: `/unidades/${booking.unitId}`, label: "Ver unidad" },
      });
    }

    if (inWindow(booking.checkOut)) {
      // Si otro huésped entra a la misma unidad el día que este sale, la
      // limpieza no puede esperar.
      const turnover = input.bookings.some(
        (other) => other.id !== booking.id && other.unitId === booking.unitId && sameDay(other.checkIn, booking.checkOut),
      );
      items.push({
        key: `cleaning:${booking.id}`,
        group: "estancias",
        tone: turnover ? "warning" : "neutral",
        status: "Limpieza",
        title: `Sale ${booking.guestName}: prepara la unidad`,
        place: placeLabel(booking),
        person: { role: "Huésped", name: booking.guestName },
        date: booking.checkOut,
        days: dayOffset(booking.checkOut, today),
        note: turnover ? "Entra otro huésped el mismo día." : "No hay otra llegada ese día.",
        action: { kind: "link", href: `/unidades/${booking.unitId}`, label: "Ver unidad" },
      });
    }
  }

  for (const lease of input.moveIns) {
    if (!inWindow(lease.startDate)) continue;
    items.push({
      key: `move-in:${lease.id}`,
      group: "estancias",
      tone: "info",
      status: "Entrega",
      title: `Entrega de la unidad a ${lease.tenantName}`,
      place: placeLabel(lease),
      person: { role: "Inquilino", name: lease.tenantName },
      date: lease.startDate,
      days: dayOffset(lease.startDate, today),
      note: "Empieza su contrato.",
      action: { kind: "link", href: `/inquilinos/${lease.tenantId}`, label: "Ver ficha" },
    });
  }

  // ---------------------------------------------------------------- contratos
  for (const lease of input.expiringLeases) {
    const days = dayOffset(lease.endDate, today);
    if (days < 0 || days > LEASE_WARNING_DAYS) continue;
    items.push({
      key: `lease:${lease.id}`,
      group: "contratos",
      tone: days <= LEASE_URGENT_DAYS ? "danger" : "warning",
      status: "Por vencer",
      title: `Contrato de ${lease.tenantName} por vencer`,
      place: placeLabel(lease),
      person: { role: "Inquilino", name: lease.tenantName },
      date: lease.endDate,
      days,
      action: { kind: "link", href: `/inquilinos/${lease.tenantId}`, label: "Renovar o terminar" },
    });
  }

  // ---------------------------------------------------------------- servicios
  for (const building of input.servicesMissing) {
    if (building.count <= 0) continue;
    items.push({
      key: `services:${building.buildingId}:${input.period}`,
      group: "servicios",
      tone: "warning",
      status: "Sin monto",
      title:
        building.count === 1
          ? "1 servicio sin monto este mes"
          : `${building.count} servicios sin monto este mes`,
      place: building.buildingName,
      person: null,
      date: null,
      days: 0,
      when: input.periodName,
      note: "Puedes copiar los montos del mes anterior.",
      action: { kind: "link", href: "/servicios", label: "Capturar" },
    });
  }

  // Dentro de cada grupo, lo más antiguo o próximo primero; lo que no tiene
  // fecha (todo el periodo) al final.
  const groupOrder = TODAY_GROUPS.map((g) => g.id);
  const time = (item: TodayItem) => item.date?.getTime() ?? Number.POSITIVE_INFINITY;
  return items.sort(
    (a, b) => groupOrder.indexOf(a.group) - groupOrder.indexOf(b.group) || time(a) - time(b) || 0,
  );
}
