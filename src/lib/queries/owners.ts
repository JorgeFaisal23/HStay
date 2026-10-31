import type { OrgDb } from "@/lib/db/scoped";
import { totalByCurrency, type Currency } from "@/lib/currency";
import { periodKey, periodToDate, shiftPeriod, toNumber } from "@/lib/format";
import { buildOwnerStatement, type StatementMovement } from "@/lib/owner-statement";

/**
 * Cuentas de los propietarios (B-05). Las mismas consultas sirven al equipo
 * (OWNER/ADMIN) y a la vista del propietario; esta última solo pasa los ids
 * de sus propias propiedades y nunca recibe nombres de inquilinos ni huéspedes.
 */

type StatementBuilding = { id: string; ownerId: string; ownerSince: Date };

/** Lo que lee el estado de cuenta: sirve el cliente con alcance o una transacción suya. */
type StatementDb = Pick<OrgDb, "rentPayment" | "booking" | "expense" | "serviceCharge" | "ownerPayout">;

/** Estado de cuenta de una propiedad con propietario, hasta el mes en curso. */
export async function statementForBuilding(db: StatementDb, building: StatementBuilding, now = new Date()) {
  const since = periodKey(building.ownerSince);
  const until = periodKey(now);
  const from = periodToDate(since);
  const unit = { buildingId: building.id };

  const [payments, bookings, repairs, services, payouts] = await Promise.all([
    db.rentPayment.findMany({
      where: { paidAt: { gte: from }, rentCharge: { lease: { unit } } },
      select: { amount: true, paidAt: true },
    }),
    // Cuenta al terminar la estancia: salida ya ocurrida y reserva no cancelada.
    db.booking.findMany({
      where: { unit, status: { in: ["CONFIRMED", "COMPLETED"] }, checkOut: { gte: from, lte: now } },
      select: { totalAmount: true, checkOut: true },
    }),
    db.expense.findMany({
      where: { unit, status: "APPROVED", spentOn: { gte: from } },
      select: { amount: true, spentOn: true },
    }),
    // Solo los servicios que paga la arrendadora (incluidos en la renta).
    db.serviceCharge.findMany({
      where: {
        period: { gte: since },
        serviceAccount: { includedInRent: true, OR: [{ buildingId: building.id }, { unit }] },
      },
      select: { amount: true, period: true },
    }),
    db.ownerPayout.findMany({
      where: { buildingId: building.id, ownerId: building.ownerId, paidOn: { gte: from } },
      orderBy: [{ paidOn: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        amount: true,
        paidOn: true,
        method: true,
        reference: true,
        notes: true,
        receiptUrl: true,
      },
    }),
  ]);

  const movements: StatementMovement[] = [
    ...payments.map((p) => ({ kind: "rent" as const, amount: toNumber(p.amount), date: p.paidAt })),
    ...bookings.map((b) => ({ kind: "booking" as const, amount: toNumber(b.totalAmount), date: b.checkOut })),
    ...repairs.map((e) => ({ kind: "repair" as const, amount: toNumber(e.amount), date: e.spentOn })),
    ...services.map((s) => ({ kind: "service" as const, amount: toNumber(s.amount), period: s.period })),
    ...payouts.map((p) => ({ kind: "payout" as const, amount: toNumber(p.amount), date: p.paidOn })),
  ];

  return {
    ...buildOwnerStatement({ since, until, movements }),
    since,
    payouts: payouts.map(({ receiptUrl, ...p }) => ({
      ...p,
      amount: toNumber(p.amount),
      hasReceipt: receiptUrl !== null,
    })),
  };
}

export type BuildingStatement = Awaited<ReturnType<typeof statementForBuilding>>;

const buildingSelect = {
  id: true,
  name: true,
  address: true,
  city: true,
  currency: true,
  ownerId: true,
  ownerSince: true,
  _count: { select: { units: true } },
} as const;

type OwnedBuilding = {
  id: string;
  name: string;
  address: string;
  city: string | null;
  currency: Currency;
  ownerId: string | null;
  ownerSince: Date | null;
  _count: { units: number };
};

async function withStatements(db: OrgDb, buildings: OwnedBuilding[]) {
  return Promise.all(
    buildings.map(async ({ _count, ...b }) => ({
      ...b,
      units: _count.units,
      statement:
        b.ownerId && b.ownerSince
          ? await statementForBuilding(db, { id: b.id, ownerId: b.ownerId, ownerSince: b.ownerSince })
          : null,
    })),
  );
}

/** Propietarios de la arrendadora con sus propiedades y lo pendiente de cada una. */
export async function getOwnersBoard(db: OrgDb) {
  const owners = await db.user.findMany({
    where: { role: "PROPERTY_OWNER" },
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      active: true,
      ownedBuildings: { select: buildingSelect, orderBy: { name: "asc" } },
    },
  });

  return Promise.all(
    owners.map(async ({ ownedBuildings, ...owner }) => {
      const buildings = await withStatements(db, ownedBuildings);
      // Cada propiedad rinde cuentas en su moneda: el total se lleva por moneda.
      const pending = totalByCurrency(buildings, (b) => b.currency, (b) => b.statement?.pending ?? 0);
      return { ...owner, buildings, pending };
    }),
  );
}

/** Un propietario con el estado de cuenta de cada propiedad suya. */
export async function getOwnerDetail(db: OrgDb, ownerId: string) {
  const owner = await db.user.findFirst({
    where: { id: ownerId, role: "PROPERTY_OWNER" },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      active: true,
      ownedBuildings: { select: buildingSelect, orderBy: { name: "asc" } },
    },
  });
  if (!owner) return null;
  const { ownedBuildings, ...rest } = owner;
  return { ...rest, buildings: await withStatements(db, ownedBuildings) };
}

/** Lo que ve el propietario: solo las propiedades a su nombre. */
export async function getMyOwnerAccount(db: OrgDb, userId: string) {
  const buildings = await db.building.findMany({
    where: { ownerId: userId },
    orderBy: { name: "asc" },
    select: buildingSelect,
  });
  return withStatements(db, buildings);
}

/** Propietarios activos para elegir en la ficha de una propiedad. */
export async function getOwnerOptions(db: OrgDb) {
  return db.user.findMany({
    where: { role: "PROPERTY_OWNER", active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

/** Mes de inicio por defecto al asignar un propietario: el mes en curso. */
export function defaultOwnerSince(now = new Date()) {
  return periodKey(now);
}

/** Los últimos `count` meses para elegir el inicio de cuentas (incluye el actual). */
export function ownerSinceOptions(count = 24, now = new Date()) {
  const current = periodKey(now);
  return Array.from({ length: count }, (_, i) => shiftPeriod(current, -i));
}
