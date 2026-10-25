import { describe, expect, it } from "vitest";
import { buildTodayItems, type TodayInput } from "@/lib/today";
import { relativeDay } from "@/lib/format";

const now = new Date(2026, 9, 15, 10); // 15 oct 2026, 10:00
const day = (d: number, month = 9) => new Date(2026, month, d, 12);
const place = { unitId: "u1", unitCode: "101", buildingName: "Torre Norte" };

const empty: TodayInput = {
  period: "2026-10",
  periodName: "Octubre 2026",
  overdueCharges: [],
  proofs: [],
  missingCharges: [],
  bookings: [],
  moveIns: [],
  expiringLeases: [],
  servicesMissing: [],
};

describe("buildTodayItems", () => {
  it("sin datos no hay pendientes", () => {
    expect(buildTodayItems(empty, now)).toEqual([]);
  });

  it("un cobro vencido lleva propiedad, inquilino, fecha, lo que falta y el botón de pago", () => {
    const [item] = buildTodayItems(
      {
        ...empty,
        overdueCharges: [
          { ...place, id: "c1", periodName: "Octubre 2026", dueDate: day(5), amount: 6500, paidAmount: 1500, tenantId: "t1", tenantName: "Ana López" },
        ],
      },
      now,
    );
    expect(item).toMatchObject({
      group: "cobros",
      tone: "danger",
      place: "Torre Norte · Unidad 101",
      person: { role: "Inquilino", name: "Ana López" },
      days: -10,
      amount: 5000,
      action: { kind: "payment", chargeId: "c1", amount: 6500, paidAmount: 1500 },
    });
  });

  it("los cargos por generar se juntan en un solo asunto con su botón", () => {
    const items = buildTodayItems(
      {
        ...empty,
        missingCharges: [
          { ...place, tenantName: "Ana", dueDate: day(10) },
          { ...place, unitCode: "102", tenantName: "Luis", dueDate: day(1) },
          { ...place, buildingName: "Casa Sur", tenantName: "Eva", dueDate: day(5) },
        ],
      },
      now,
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      title: "Faltan 3 cargos de renta de octubre 2026",
      place: "Torre Norte y Casa Sur",
      person: { role: "Inquilinos", name: "Ana, Luis y 1 más" },
      date: day(1),
      action: { kind: "generate", period: "2026-10", count: 3 },
    });
  });

  it("una reserva da su llegada y su limpieza; la limpieza es urgente si entra otro huésped ese día", () => {
    const items = buildTodayItems(
      {
        ...empty,
        bookings: [
          { ...place, id: "b1", guestName: "Rita", guests: 2, checkIn: day(14), checkOut: day(16) },
          { ...place, id: "b2", guestName: "Omar", guests: 1, checkIn: day(16), checkOut: day(30) },
        ],
      },
      now,
    );
    // b1 ya llegó (ayer): solo su salida. b2 llega dentro de la ventana; su salida queda fuera.
    expect(items.map((i) => i.key)).toEqual(["cleaning:b1", "arrival:b2"]);
    expect(items[0]).toMatchObject({ tone: "warning", note: "Entra otro huésped el mismo día.", days: 1 });
    expect(items[1]).toMatchObject({ person: { role: "Huésped", name: "Omar" }, note: "14 noches · 1 huésped" });
  });

  it("si la reserva cambia, la limpieza la sigue (sin otra llegada ya no es urgente)", () => {
    const items = buildTodayItems(
      {
        ...empty,
        bookings: [
          { ...place, id: "b1", guestName: "Rita", guests: 2, checkIn: day(14), checkOut: day(17) },
          { ...place, id: "b2", guestName: "Omar", guests: 1, checkIn: day(16, 10), checkOut: day(20, 10) },
        ],
      },
      now,
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ key: "cleaning:b1", tone: "neutral", date: day(17) });
  });

  it("contratos: urgentes a 30 días o menos, avisos hasta 60, nada después", () => {
    const lease = (id: string, endDate: Date) => ({ ...place, id, tenantId: id, tenantName: id, endDate });
    const items = buildTodayItems(
      { ...empty, expiringLeases: [lease("pronto", day(30)), lease("luego", day(10, 11)), lease("lejos", day(20, 11))] },
      now,
    );
    expect(items.map((i) => [i.key, i.tone])).toEqual([
      ["lease:pronto", "danger"],
      ["lease:luego", "warning"],
    ]);
  });

  it("ordena por grupo y, dentro de cada uno, por fecha", () => {
    const items = buildTodayItems(
      {
        ...empty,
        servicesMissing: [{ buildingId: "b", buildingName: "Torre Norte", count: 2 }],
        bookings: [{ ...place, id: "b1", guestName: "Rita", guests: 1, checkIn: day(18), checkOut: day(25) }],
        overdueCharges: [
          { ...place, id: "c2", periodName: "Octubre 2026", dueDate: day(5), amount: 1, paidAmount: 0, tenantId: "t", tenantName: "T" },
          { ...place, id: "c1", periodName: "Septiembre 2026", dueDate: day(5, 8), amount: 1, paidAmount: 0, tenantId: "t", tenantName: "T" },
        ],
      },
      now,
    );
    expect(items.map((i) => i.key)).toEqual(["charge:c1", "charge:c2", "arrival:b1", "services:b:2026-10"]);
  });
});

describe("comprobantes por revisar", () => {
  const sent = {
    ...place,
    id: "p1",
    chargeId: "c1",
    periodName: "Octubre 2026",
    tenantName: "Ana López",
    amount: 6500,
    method: "Transferencia",
    reference: "SPEI 99",
    paidOn: day(14),
    submittedAt: new Date(2026, 9, 14, 18),
    remaining: 6500,
  };
  const overdue = { ...place, id: "c1", periodName: "Octubre 2026", dueDate: day(5), amount: 6500, paidAmount: 0, tenantId: "t1", tenantName: "Ana López" };

  it("van primero en Cobros, como suceso ('ayer') y con lo que declara", () => {
    const items = buildTodayItems({ ...empty, proofs: [sent], overdueCharges: [overdue] }, now);
    expect(items.map((i) => i.key)).toEqual(["proof:p1", "charge:c1"]);
    expect(items[0]).toMatchObject({
      status: "Por revisar",
      dateKind: "event",
      datePrefix: "Enviado",
      days: -1,
      amount: 6500,
      amountLabel: "Declara",
      action: { kind: "review", proof: { id: "p1", remaining: 6500, place: "Torre Norte · Unidad 101" } },
    });
  });

  it("el cargo vencido avisa que ya hay un comprobante", () => {
    const [, charge] = buildTodayItems({ ...empty, proofs: [sent], overdueCharges: [overdue] }, now);
    expect(charge.note).toMatch(/Envió un comprobante/);
    const [alone] = buildTodayItems({ ...empty, overdueCharges: [overdue] }, now);
    expect(alone.note).toBeUndefined();
  });
});

describe("relativeDay", () => {
  it("habla como persona", () => {
    expect([0, 1, -1, 3, -4].map(relativeDay)).toEqual(["hoy", "mañana", "ayer", "en 3 días", "hace 4 días"]);
  });
});
