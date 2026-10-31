import type { OrgDb } from "@/lib/db/scoped";
import type { Currency } from "@/lib/currency";
import { periodKey, periodLabel, toNumber } from "@/lib/format";
import { chargeDueDate, chargeableLeasesWhere, remainingOf, startOfToday } from "@/lib/payments";
import { buildTodayItems, LEASE_WARNING_DAYS, LOOKAHEAD_DAYS } from "@/lib/today";

/**
 * Datos de "Hoy" y de la guía de primeros pasos. Todo pasa por el cliente con
 * alcance de la arrendadora; los pendientes se arman en src/lib/today.ts.
 */

const unitSelect = { id: true, code: true, building: { select: { name: true, currency: true } } } as const;

function place(unit: { id: string; code: string; building: { name: string; currency: Currency } }) {
  return {
    unitId: unit.id,
    unitCode: unit.code,
    buildingName: unit.building.name,
    currency: unit.building.currency,
  };
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export async function getTodayData(db: OrgDb, now = new Date()) {
  const today = startOfToday(now);
  const windowEnd = addDays(today, LOOKAHEAD_DAYS);
  const period = periodKey(now);

  const [tasks, expenses] = await Promise.all([
    // Tareas abiertas (y las limpiezas de reservas de la ventana, aunque ya se
    // hayan hecho, para no volver a pedirlas).
    db.task.findMany({
      where: {
        OR: [{ status: "OPEN" }, { kind: "CLEANING", booking: { checkOut: { gte: today, lt: windowEnd } } }],
      },
      select: {
        id: true,
        kind: true,
        status: true,
        title: true,
        bookingId: true,
        dueDate: true,
        createdAt: true,
        assignee: { select: { id: true, name: true } },
        reportedBy: { select: { name: true, role: true } },
        unit: { select: unitSelect },
      },
    }),
    db.expense.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        concept: true,
        amount: true,
        spentOn: true,
        receiptUrl: true,
        createdBy: { select: { name: true } },
        unit: { select: unitSelect },
        task: { select: { id: true, doneNotes: true, donePhotoUrl: true } },
      },
    }),
  ]);

  const [proofs, overdue, missing, bookings, moveIns, expiring, serviceAccounts, counts] = await Promise.all([
    // Sin la imagen: el diálogo de revisión la pide a /comprobantes/{id}/imagen.
    db.paymentProof.findMany({
      where: { status: "SUBMITTED" },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        rentChargeId: true,
        amount: true,
        method: true,
        reference: true,
        paidOn: true,
        createdAt: true,
        submittedBy: { select: { name: true } },
        rentCharge: {
          select: { period: true, amount: true, paidAmount: true, lease: { select: { unit: { select: unitSelect } } } },
        },
      },
    }),
    // Por fecha y no por estado: un cargo atrasado aparece aunque el barrido
    // de vencimientos todavía no lo haya marcado.
    db.rentCharge.findMany({
      where: { status: { not: "PAID" }, dueDate: { lt: today } },
      orderBy: { dueDate: "asc" },
      select: {
        id: true,
        period: true,
        dueDate: true,
        amount: true,
        paidAmount: true,
        lease: { select: { tenant: { select: { id: true, name: true } }, unit: { select: unitSelect } } },
      },
    }),
    db.lease.findMany({
      where: chargeableLeasesWhere(period),
      select: { paymentDay: true, tenant: { select: { name: true } }, unit: { select: unitSelect } },
    }),
    db.booking.findMany({
      where: {
        status: "CONFIRMED",
        OR: [
          { checkIn: { gte: today, lt: windowEnd } },
          { checkOut: { gte: today, lt: windowEnd } },
        ],
      },
      orderBy: { checkIn: "asc" },
      select: { id: true, guestName: true, guests: true, checkIn: true, checkOut: true, unit: { select: unitSelect } },
    }),
    db.lease.findMany({
      where: { status: "ACTIVE", startDate: { gte: today, lt: windowEnd } },
      select: { id: true, startDate: true, tenant: { select: { id: true, name: true } }, unit: { select: unitSelect } },
    }),
    db.lease.findMany({
      where: { status: "ACTIVE", endDate: { gte: today, lte: addDays(today, LEASE_WARNING_DAYS) } },
      select: { id: true, endDate: true, tenant: { select: { id: true, name: true } }, unit: { select: unitSelect } },
    }),
    db.serviceAccount.findMany({
      where: { active: true, charges: { none: { period } } },
      select: {
        building: { select: { id: true, name: true } },
        unit: { select: { building: { select: { id: true, name: true } } } },
      },
    }),
    Promise.all([
      db.building.count(),
      db.unit.count(),
      db.lease.count(),
      db.booking.count(),
      db.rentCharge.count(),
    ]),
  ]);

  const servicesByBuilding = new Map<string, { buildingId: string; buildingName: string; count: number }>();
  for (const account of serviceAccounts) {
    const building = account.building ?? account.unit?.building;
    if (!building) continue;
    const entry = servicesByBuilding.get(building.id) ?? { buildingId: building.id, buildingName: building.name, count: 0 };
    entry.count += 1;
    servicesByBuilding.set(building.id, entry);
  }

  const items = buildTodayItems(
    {
      period,
      periodName: periodLabel(period),
      proofs: proofs.map((p) => ({
        ...place(p.rentCharge.lease.unit),
        id: p.id,
        chargeId: p.rentChargeId,
        periodName: periodLabel(p.rentCharge.period),
        tenantName: p.submittedBy.name,
        amount: toNumber(p.amount),
        method: p.method,
        reference: p.reference,
        paidOn: p.paidOn,
        submittedAt: p.createdAt,
        remaining: remainingOf(toNumber(p.rentCharge.amount), toNumber(p.rentCharge.paidAmount)),
      })),
      overdueCharges: overdue.map((c) => ({
        ...place(c.lease.unit),
        id: c.id,
        periodName: periodLabel(c.period),
        dueDate: c.dueDate,
        amount: toNumber(c.amount),
        paidAmount: toNumber(c.paidAmount),
        tenantId: c.lease.tenant.id,
        tenantName: c.lease.tenant.name,
      })),
      missingCharges: missing.map((l) => ({
        ...place(l.unit),
        tenantName: l.tenant.name,
        dueDate: chargeDueDate(period, l.paymentDay),
      })),
      cleaningTasks: tasks
        .filter((t) => t.kind === "CLEANING" && t.bookingId)
        .map((t) => ({
          bookingId: t.bookingId!,
          status: t.status,
          assigneeId: t.assignee?.id ?? null,
          assigneeName: t.assignee?.name ?? null,
        })),
      lateCleanings: tasks
        .filter((t) => t.kind === "CLEANING" && t.status === "OPEN" && t.dueDate && t.dueDate < today)
        .map((t) => ({
          ...place(t.unit),
          id: t.id,
          title: t.title,
          dueDate: t.dueDate!,
          assigneeId: t.assignee?.id ?? null,
          assigneeName: t.assignee?.name ?? null,
        })),
      repairs: tasks
        .filter((t) => t.kind === "REPAIR" && t.status === "OPEN")
        .map((t) => ({
          ...place(t.unit),
          id: t.id,
          title: t.title,
          reportedAt: t.createdAt,
          reporterName: t.reportedBy?.name ?? null,
          reporterIsTenant: t.reportedBy?.role === "TENANT",
          assigneeId: t.assignee?.id ?? null,
          assigneeName: t.assignee?.name ?? null,
        })),
      pendingExpenses: expenses.map((e) => ({
        ...place(e.unit),
        id: e.id,
        concept: e.concept,
        amount: toNumber(e.amount),
        spentOn: e.spentOn,
        createdByName: e.createdBy?.name ?? null,
        hasReceipt: e.receiptUrl !== null,
        notes: e.task?.doneNotes ?? null,
        taskId: e.task?.id ?? null,
        hasDonePhoto: Boolean(e.task?.donePhotoUrl),
      })),
      bookings: bookings.map((b) => ({
        ...place(b.unit),
        id: b.id,
        guestName: b.guestName,
        guests: b.guests,
        checkIn: b.checkIn,
        checkOut: b.checkOut,
      })),
      moveIns: moveIns.map((l) => ({
        ...place(l.unit),
        id: l.id,
        tenantId: l.tenant.id,
        tenantName: l.tenant.name,
        startDate: l.startDate,
      })),
      expiringLeases: expiring.map((l) => ({
        ...place(l.unit),
        id: l.id,
        tenantId: l.tenant.id,
        tenantName: l.tenant.name,
        endDate: l.endDate,
      })),
      servicesMissing: [...servicesByBuilding.values()],
    },
    now,
  );

  const [buildings, units, leases, bookingsTotal, charges] = counts;

  return {
    period,
    items,
    /**
     * Primeros pasos: se derivan de lo que ya existe. El de los cargos solo
     * aplica si hay contratos (quien solo renta por noche no los necesita).
     */
    setup: [
      { id: "property", done: buildings > 0 },
      { id: "unit", done: units > 0 },
      { id: "rent", done: leases > 0 || bookingsTotal > 0 },
      { id: "charges", done: leases === 0 ? bookingsTotal > 0 : charges > 0 },
    ] as const,
  };
}
