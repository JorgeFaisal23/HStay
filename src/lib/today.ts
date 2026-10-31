import type { Tone } from "@/lib/labels";
import { startOfToday } from "@/lib/payments";
import { daysBetween } from "@/lib/format";
import type { Currency } from "@/lib/currency";

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

export type TodayGroup = "cobros" | "estancias" | "mantenimiento" | "contratos" | "servicios";

export const TODAY_GROUPS: { id: TodayGroup; title: string; description: string }[] = [
  { id: "cobros", title: "Cobros", description: "Comprobantes por revisar, rentas vencidas y cargos del mes por generar." },
  {
    id: "estancias",
    title: "Llegadas, salidas y limpieza",
    description: `Lo que pasa en tus unidades en los próximos ${LOOKAHEAD_DAYS} días.`,
  },
  {
    id: "mantenimiento",
    title: "Mantenimiento",
    description: "Reparaciones por asignar o en curso, limpiezas atrasadas y gastos por aprobar.",
  },
  { id: "contratos", title: "Contratos", description: "Contratos que vencen pronto: renueva o prepara la salida." },
  { id: "servicios", title: "Servicios", description: "Recibos del mes que aún no tienen monto." },
];

/** Lo que necesita el diálogo de revisión de un comprobante. */
export type ProofToReview = {
  id: string;
  tenantName: string;
  periodName: string;
  place: string;
  amount: number;
  method: string;
  reference: string | null;
  paidOn: Date;
  /** Lo que falta por pagar del cargo: tope del monto a aprobar. */
  remaining: number;
  /** Moneda de la propiedad del cargo. */
  currency?: Currency;
};

/** Lo que necesita el diálogo de aprobación de un gasto. */
export type ExpenseToReview = {
  id: string;
  concept: string;
  place: string;
  amount: number;
  spentOn: Date;
  createdByName: string | null;
  hasReceipt: boolean;
  notes: string | null;
  taskId: string | null;
  hasDonePhoto: boolean;
  /** Moneda de la propiedad del gasto. */
  currency?: Currency;
};

/** A qué se le asigna responsable: una tarea que ya existe o la limpieza de una reserva. */
export type AssignTarget =
  | { type: "task"; taskId: string; title: string; assigneeId: string | null }
  | { type: "cleaning"; bookingId: string; title: string; assigneeId: string | null };

export type TodayAction =
  | { kind: "payment"; chargeId: string; tenantName: string; amount: number; paidAmount: number; currency?: Currency }
  | { kind: "review"; proof: ProofToReview }
  | { kind: "assign"; target: AssignTarget }
  | { kind: "expense"; expense: ExpenseToReview }
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
  /**
   * Responsable de hacerlo, en las tareas de operación: su nombre, null si
   * aún no tiene, o undefined si el asunto no es una tarea.
   */
  assignee?: string | null;
  /** La fecha del asunto, o null si es de todo el periodo. */
  date: Date | null;
  /** Días de hoy a `date` (negativo: ya pasó). */
  days: number;
  /**
   * Cómo leer la fecha: un plazo ("venció hace 3 días") o un suceso ("hoy",
   * "hace 2 días"). `datePrefix` lo nombra cuando hace falta ("Enviado").
   */
  dateKind: "deadline" | "event";
  datePrefix?: string;
  /** Texto de la fecha cuando no hay una concreta (p. ej. el periodo). */
  when?: string;
  /** Monto en juego (lo que falta por cobrar, o lo que declara un comprobante). */
  amount?: number;
  /** Moneda de `amount`: la de la propiedad. */
  currency?: Currency;
  amountLabel?: string;
  note?: string;
  action: TodayAction;
};

/** Unidad del pendiente; `currency` es la de su propiedad (pesos si falta). */
type Place = { unitId: string; unitCode: string; buildingName: string; currency?: Currency };

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
  /** Comprobantes enviados por inquilinos que nadie ha revisado. */
  proofs: (Place & {
    id: string;
    chargeId: string;
    periodName: string;
    tenantName: string;
    amount: number;
    method: string;
    reference: string | null;
    paidOn: Date;
    submittedAt: Date;
    remaining: number;
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
  /** Limpiezas programadas, por reserva: su responsable y si ya se hizo. */
  cleaningTasks: { bookingId: string; status: "OPEN" | "DONE" | "CANCELLED"; assigneeId: string | null; assigneeName: string | null }[];
  /** Limpiezas abiertas cuya salida ya pasó. */
  lateCleanings: (Place & { id: string; title: string; dueDate: Date; assigneeId: string | null; assigneeName: string | null })[];
  /** Reparaciones abiertas. */
  repairs: (Place & {
    id: string;
    title: string;
    reportedAt: Date;
    reporterName: string | null;
    reporterIsTenant: boolean;
    assigneeId: string | null;
    assigneeName: string | null;
  })[];
  /** Gastos de unidad por aprobar. */
  pendingExpenses: (Place & {
    id: string;
    concept: string;
    amount: number;
    spentOn: Date;
    createdByName: string | null;
    hasReceipt: boolean;
    notes: string | null;
    taskId: string | null;
    hasDonePhoto: boolean;
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
  const chargesWithProof = new Set(input.proofs.map((p) => p.chargeId));

  for (const proof of input.proofs) {
    items.push({
      key: `proof:${proof.id}`,
      group: "cobros",
      tone: "info",
      status: "Por revisar",
      title: `Comprobante de ${proof.tenantName}: renta de ${proof.periodName.toLowerCase()}`,
      place: placeLabel(proof),
      person: { role: "Inquilino", name: proof.tenantName },
      date: proof.submittedAt,
      days: dayOffset(proof.submittedAt, today),
      dateKind: "event",
      datePrefix: "Enviado",
      amount: proof.amount,
      currency: proof.currency,
      amountLabel: "Declara",
      note: `${proof.method}${proof.reference ? ` · ${proof.reference}` : ""}. El pago no cuenta hasta que lo apruebes.`,
      action: {
        kind: "review",
        proof: {
          id: proof.id,
          tenantName: proof.tenantName,
          periodName: proof.periodName,
          place: placeLabel(proof),
          amount: proof.amount,
          method: proof.method,
          reference: proof.reference,
          paidOn: proof.paidOn,
          remaining: proof.remaining,
          currency: proof.currency,
        },
      },
    });
  }

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
      dateKind: "deadline",
      amount: Math.max(0, charge.amount - charge.paidAmount),
      currency: charge.currency,
      amountLabel: "Por cobrar",
      note: chargesWithProof.has(charge.id)
        ? "Envió un comprobante: revísalo antes de registrar otro pago."
        : charge.paidAmount > 0
          ? "Tiene un abono parcial."
          : undefined,
      action: {
        kind: "payment",
        chargeId: charge.id,
        tenantName: charge.tenantName,
        amount: charge.amount,
        paidAmount: charge.paidAmount,
        currency: charge.currency,
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
      dateKind: "deadline",
      note: "Sin el cargo no se puede registrar el pago ni avisar si se atrasa.",
      action: { kind: "generate", period: input.period, count },
    });
  }

  // ---------------------------------------------------------------- estancias
  const cleaningByBooking = new Map(input.cleaningTasks.map((t) => [t.bookingId, t]));
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
        dateKind: "event",
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
      // Una limpieza ya hecha deja de ser asunto; si está programada, se ve
      // su responsable.
      const task = cleaningByBooking.get(booking.id);
      if (task?.status !== "DONE") {
        const planned = task?.status === "OPEN";
        items.push({
          key: `cleaning:${booking.id}`,
          group: "estancias",
          tone: turnover ? "warning" : "neutral",
          status: "Limpieza",
          title: `Sale ${booking.guestName}: prepara la unidad`,
          place: placeLabel(booking),
          person: { role: "Huésped", name: booking.guestName },
          assignee: planned ? task.assigneeName : null,
          date: booking.checkOut,
          days: dayOffset(booking.checkOut, today),
          dateKind: "event",
          note: turnover ? "Entra otro huésped el mismo día." : "No hay otra llegada ese día.",
          action: {
            kind: "assign",
            target: {
              type: "cleaning",
              bookingId: booking.id,
              title: `Limpieza tras la salida de ${booking.guestName}`,
              assigneeId: planned ? task.assigneeId : null,
            },
          },
        });
      }
    }
  }

  // ---------------------------------------------------------------- mantenimiento
  for (const expense of input.pendingExpenses) {
    items.push({
      key: `expense:${expense.id}`,
      group: "mantenimiento",
      tone: "warning",
      status: "Gasto por aprobar",
      title: expense.concept,
      place: placeLabel(expense),
      person: expense.createdByName ? { role: "Cerró", name: expense.createdByName } : null,
      date: expense.spentOn,
      days: dayOffset(expense.spentOn, today),
      dateKind: "event",
      amount: expense.amount,
      currency: expense.currency,
      amountLabel: "Costo",
      note: "No cuenta en tus gastos hasta que lo apruebes.",
      action: {
        kind: "expense",
        expense: {
          id: expense.id,
          concept: expense.concept,
          place: placeLabel(expense),
          amount: expense.amount,
          spentOn: expense.spentOn,
          createdByName: expense.createdByName,
          hasReceipt: expense.hasReceipt,
          notes: expense.notes,
          taskId: expense.taskId,
          hasDonePhoto: expense.hasDonePhoto,
          currency: expense.currency,
        },
      },
    });
  }

  for (const repair of input.repairs) {
    items.push({
      key: `repair:${repair.id}`,
      group: "mantenimiento",
      tone: repair.assigneeId ? "info" : "warning",
      status: repair.assigneeId ? "Reparación en curso" : "Reparación sin asignar",
      title: repair.title,
      place: placeLabel(repair),
      person: repair.reporterName
        ? { role: repair.reporterIsTenant ? "Reportó el inquilino" : "Reportó", name: repair.reporterName }
        : null,
      assignee: repair.assigneeName,
      date: repair.reportedAt,
      days: dayOffset(repair.reportedAt, today),
      dateKind: "event",
      datePrefix: "Reportada",
      action: {
        kind: "assign",
        target: { type: "task", taskId: repair.id, title: repair.title, assigneeId: repair.assigneeId },
      },
    });
  }

  for (const cleaning of input.lateCleanings) {
    items.push({
      key: `late-cleaning:${cleaning.id}`,
      group: "mantenimiento",
      tone: "danger",
      status: "Limpieza atrasada",
      title: cleaning.title,
      place: placeLabel(cleaning),
      person: null,
      assignee: cleaning.assigneeName,
      date: cleaning.dueDate,
      days: dayOffset(cleaning.dueDate, today),
      dateKind: "deadline",
      note: "La salida ya pasó y nadie la ha marcado como hecha.",
      action: {
        kind: "assign",
        target: { type: "task", taskId: cleaning.id, title: cleaning.title, assigneeId: cleaning.assigneeId },
      },
    });
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
      dateKind: "event",
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
      dateKind: "deadline",
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
      dateKind: "deadline",
      when: input.periodName,
      note: "Puedes copiar los montos del mes anterior.",
      action: { kind: "link", href: "/servicios", label: "Capturar" },
    });
  }

  // Dentro de cada grupo: primero los comprobantes y gastos por revisar (se
  // resuelven en un paso), después lo más antiguo o próximo; lo que no tiene fecha
  // (todo el periodo) al final.
  const groupOrder = TODAY_GROUPS.map((g) => g.id);
  const rank = (item: TodayItem) => (item.action.kind === "review" || item.action.kind === "expense" ? 0 : 1);
  const time = (item: TodayItem) => item.date?.getTime() ?? Number.POSITIVE_INFINITY;
  return items.sort(
    (a, b) =>
      groupOrder.indexOf(a.group) - groupOrder.indexOf(b.group) ||
      rank(a) - rank(b) ||
      time(a) - time(b) ||
      0,
  );
}
