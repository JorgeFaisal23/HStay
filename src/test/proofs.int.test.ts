import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createOrgDb } from "@/lib/db/scoped";
import { getTodayData } from "@/lib/queries/today";
import { createOrgFixture, deleteOrgFixtures, type OrgFixture } from "@/test/fixtures";

/** Comprobantes del inquilino: enviar no paga; el equipo aprueba o rechaza. */

const actor = vi.hoisted(() => ({ orgId: "", userId: "", role: "TENANT" }));

vi.mock("@/lib/auth/session", async () => {
  const { createOrgDb } = await import("@/lib/db/scoped");
  return {
    requireOrgUserAction: async (roles?: string[]) => {
      if (roles && !roles.includes(actor.role)) throw new Error("No tienes permiso para realizar esta acción.");
      return {
        session: { sub: actor.userId, role: actor.role, orgId: actor.orgId },
        orgId: actor.orgId,
        db: createOrgDb(actor.orgId),
      };
    },
  };
});
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { submitPaymentProof, approvePaymentProof, rejectPaymentProof } = await import("@/server/actions/proofs");

let a: OrgFixture;
let b: OrgFixture;

const RECEIPT = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";

function asTenant(fixture: OrgFixture, userId = fixture.tenant.id) {
  Object.assign(actor, { orgId: fixture.organizationId, userId, role: "TENANT" });
}
function asOwner(fixture: OrgFixture) {
  Object.assign(actor, { orgId: fixture.organizationId, userId: fixture.owner.id, role: "OWNER" });
}

const proof = (chargeId: string, fields: Partial<Parameters<typeof submitPaymentProof>[0]> = {}) =>
  submitPaymentProof({
    chargeId,
    amount: 5000,
    method: "Transferencia",
    reference: "SPEI 123",
    paidOn: "2026-09-04",
    receiptUrl: RECEIPT,
    ...fields,
  });

async function chargeState(id: string) {
  const charge = await prisma.rentCharge.findUniqueOrThrow({ where: { id }, include: { payments: true } });
  return { paid: Number(charge.paidAmount), status: charge.status, payments: charge.payments.length };
}

beforeAll(async () => {
  a = await createOrgFixture("comprobantes-a");
  b = await createOrgFixture("comprobantes-b");
});

beforeEach(async () => {
  await prisma.paymentProof.deleteMany({ where: { organizationId: { in: [a.organizationId, b.organizationId] } } });
});

afterAll(async () => {
  await deleteOrgFixtures(a, b);
});

describe("enviar comprobante", () => {
  it("queda por revisar y el cargo sigue sin pagar", async () => {
    asTenant(a);
    expect(await proof(a.charge.id)).toEqual({ ok: true });

    const sent = await prisma.paymentProof.findFirstOrThrow({ where: { rentChargeId: a.charge.id } });
    expect(sent).toMatchObject({ status: "SUBMITTED", submittedById: a.tenant.id, method: "Transferencia" });
    expect(await chargeState(a.charge.id)).toEqual({ paid: 0, status: "PENDING", payments: 0 });
  });

  it("no admite un segundo comprobante mientras el primero está en revisión", async () => {
    asTenant(a);
    expect(await proof(a.charge.id)).toEqual({ ok: true });
    expect(await proof(a.charge.id)).toEqual({ error: expect.stringMatching(/espera a que lo revisen/) });
  });

  it("dos envíos simultáneos: solo uno queda por revisar", async () => {
    asTenant(a);
    const results = await Promise.all([proof(a.charge.id), proof(a.charge.id), proof(a.charge.id)]);
    expect(results.filter((r) => "ok" in r)).toHaveLength(1);
    expect(await prisma.paymentProof.count({ where: { rentChargeId: a.charge.id, status: "SUBMITTED" } })).toBe(1);
  });

  it("solo para sus propios cargos", async () => {
    // Otro inquilino de la misma arrendadora.
    const other = await prisma.user.create({
      data: { organizationId: a.organizationId, email: `otro-${randomUUID().slice(0, 8)}@test.mx`, name: "Otro", role: "TENANT", passwordHash: "x" },
    });
    asTenant(a, other.id);
    expect(await proof(a.charge.id)).toEqual({ error: "No se encontró el cargo." });

    // Un cargo de otra arrendadora.
    asTenant(a);
    expect(await proof(b.charge.id)).toEqual({ error: "No se encontró el cargo." });
    expect(await prisma.paymentProof.count({ where: { rentChargeId: b.charge.id } })).toBe(0);
  });

  it("exige foto válida, monto que quepa, forma de pago conocida y fecha no futura", async () => {
    asTenant(a);
    expect(await proof(a.charge.id, { receiptUrl: "" })).toHaveProperty("error");
    expect(await proof(a.charge.id, { receiptUrl: "data:text/html;base64,PHNjcmlwdD4=" })).toEqual({
      error: "El comprobante debe ser una imagen.",
    });
    expect(await proof(a.charge.id, { amount: 5000.01 })).toEqual({ error: expect.stringMatching(/mayor a lo que falta/) });
    expect(await proof(a.charge.id, { method: "Bitcoin" })).toHaveProperty("error");
    expect(await proof(a.charge.id, { paidOn: "2099-01-01" })).toEqual({ error: "La fecha de pago no puede ser futura." });
    expect(await proof(a.paidCharge.id)).toEqual({ error: "Este cargo ya está pagado." });
    expect(await prisma.paymentProof.count({ where: { organizationId: a.organizationId } })).toBe(0);
  });

  it("el equipo no envía comprobantes y el inquilino no aprueba", async () => {
    asOwner(a);
    await expect(proof(a.charge.id)).rejects.toThrow(/permiso/);
    asTenant(a);
    expect(await proof(a.charge.id)).toEqual({ ok: true });
    const sent = await prisma.paymentProof.findFirstOrThrow({ where: { rentChargeId: a.charge.id } });
    await expect(approvePaymentProof(sent.id)).rejects.toThrow(/permiso/);
  });
});

describe("revisar comprobante", () => {
  async function submitted(amount = 5000) {
    asTenant(a);
    expect(await proof(a.charge.id, { amount })).toEqual({ ok: true });
    asOwner(a);
    return prisma.paymentProof.findFirstOrThrow({ where: { rentChargeId: a.charge.id, status: "SUBMITTED" } });
  }

  it("aprobar con monto ajustado registra el pago por ese monto, una sola vez", async () => {
    const sent = await submitted(5000);
    expect(await approvePaymentProof(sent.id, { amount: 3000 })).toEqual({ ok: true });

    const approved = await prisma.paymentProof.findUniqueOrThrow({ where: { id: sent.id }, include: { payment: true } });
    expect(approved).toMatchObject({ status: "APPROVED", reviewedById: a.owner.id });
    expect(Number(approved.amount)).toBe(5000); // lo que declaró el inquilino
    expect(Number(approved.payment?.amount)).toBe(3000); // lo que confirmó el equipo
    expect(approved.payment?.receiptUrl).toBe(RECEIPT);
    expect(await chargeState(a.charge.id)).toMatchObject({ paid: 3000, status: "PARTIAL", payments: 1 });

    expect(await approvePaymentProof(sent.id)).toEqual({ error: "Este comprobante ya se revisó." });
    expect(await chargeState(a.charge.id)).toMatchObject({ payments: 1 });

    const log = await prisma.auditLog.findFirst({
      where: { organizationId: a.organizationId, action: "Aprobación de comprobante con monto ajustado" },
    });
    expect(log).not.toBeNull();
  });

  it("no aprueba más de lo que falta; el comprobante sigue por revisar", async () => {
    const sent = await submitted(2000); // ya se pagaron 3000 de 5000
    expect(await approvePaymentProof(sent.id, { amount: 2500 })).toEqual({ error: expect.stringMatching(/mayor a lo que falta/) });
    expect((await prisma.paymentProof.findUniqueOrThrow({ where: { id: sent.id } })).status).toBe("SUBMITTED");

    expect(await approvePaymentProof(sent.id)).toEqual({ ok: true });
    expect(await chargeState(a.charge.id)).toMatchObject({ paid: 5000, status: "PAID", payments: 2 });
  });

  it("rechazar pide motivo; con motivo el inquilino puede reenviar", async () => {
    await prisma.rentPayment.deleteMany({ where: { rentChargeId: a.charge.id } });
    await prisma.rentCharge.update({ where: { id: a.charge.id }, data: { paidAmount: 0, status: "PENDING" } });

    const sent = await submitted();
    expect(await rejectPaymentProof(sent.id, " ")).toHaveProperty("error");
    expect(await rejectPaymentProof(sent.id, "La referencia no aparece en el banco.")).toEqual({ ok: true });

    const rejected = await prisma.paymentProof.findUniqueOrThrow({ where: { id: sent.id } });
    expect(rejected).toMatchObject({ status: "REJECTED", rejectionReason: "La referencia no aparece en el banco." });
    expect(await chargeState(a.charge.id)).toMatchObject({ paid: 0, payments: 0 });
    expect(await approvePaymentProof(sent.id)).toEqual({ error: "Este comprobante ya se revisó." });

    asTenant(a);
    expect(await proof(a.charge.id)).toEqual({ ok: true });
  });

  it("no se revisan comprobantes de otra arrendadora", async () => {
    asTenant(b);
    expect(await proof(b.charge.id)).toEqual({ ok: true });
    const foreign = await prisma.paymentProof.findFirstOrThrow({ where: { rentChargeId: b.charge.id } });

    asOwner(a);
    expect(await approvePaymentProof(foreign.id)).toEqual({ error: "No se encontró el comprobante." });
    expect(await rejectPaymentProof(foreign.id, "No es mío")).toEqual({ error: "No se encontró el comprobante." });
    expect((await prisma.paymentProof.findUniqueOrThrow({ where: { id: foreign.id } })).status).toBe("SUBMITTED");
  });

  it("'Hoy' lo muestra por revisar y lo quita al resolverlo", async () => {
    const sent = await submitted(1000);
    const db = createOrgDb(a.organizationId);
    const keys = async () => (await getTodayData(db)).items.map((item) => item.key);

    expect(await keys()).toContain(`proof:${sent.id}`);
    expect(await rejectPaymentProof(sent.id, "Foto ilegible")).toEqual({ ok: true });
    expect(await keys()).not.toContain(`proof:${sent.id}`);
  });
});
