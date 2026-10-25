import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { createOrgFixture, deleteOrgFixtures, type OrgFixture } from "@/test/fixtures";

/** Descargas CSV: solo Premium, solo la arrendadora propia y con bitácora. */

const actor = vi.hoisted(() => ({ orgId: "", userId: "" }));

vi.mock("@/lib/auth/session", async () => {
  const { createOrgDb } = await import("@/lib/db/scoped");
  return {
    requireOrgUser: async () => ({
      session: { sub: actor.userId, role: "OWNER", orgId: actor.orgId },
      orgId: actor.orgId,
      db: createOrgDb(actor.orgId),
    }),
  };
});
vi.mock("@/lib/org", async () => {
  const { prisma } = await import("@/lib/prisma");
  return {
    requireCurrentOrg: async () => prisma.organization.findUniqueOrThrow({ where: { id: actor.orgId } }),
  };
});

const { GET } = await import("@/app/(dashboard)/reportes/exportar/[tipo]/route");

let a: OrgFixture;
let b: OrgFixture;

const download = (tipo: string, query = "") =>
  GET(new NextRequest(`http://localhost/reportes/exportar/${tipo}${query}`), {
    params: Promise.resolve({ tipo }),
  });

beforeAll(async () => {
  a = await createOrgFixture("export-a");
  b = await createOrgFixture("export-b");
  actor.orgId = a.organizationId;
  actor.userId = a.owner.id;
});

afterAll(async () => {
  await deleteOrgFixtures(a, b);
});

describe("exportar reportes", () => {
  it("en el plan gratuito no descarga nada", async () => {
    const response = await download("cobros", "?mes=2026-09");
    expect(response.status).toBe(403);
  });

  it("en Premium descarga los cobros del mes de su arrendadora", async () => {
    await prisma.organization.update({ where: { id: a.organizationId }, data: { plan: "PREMIUM" } });

    const response = await download("cobros", "?mes=2026-09");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/text\/csv/);
    expect(response.headers.get("content-disposition")).toContain(`${a.org.slug}-cobros-2026-09.csv`);

    // El archivo empieza con el BOM de UTF-8 (Excel lo necesita para los acentos).
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const csv = new TextDecoder().decode(bytes);
    const lines = csv.trim().split("\r\n");
    expect(lines).toHaveLength(2); // encabezado + el cargo de septiembre
    expect(lines[1]).toContain("Inquilino export-a");
    expect(csv).not.toContain("export-b");

    const log = await prisma.auditLog.findFirst({
      where: { organizationId: a.organizationId, action: "Exportación de reporte" },
    });
    expect(log?.detail).toBe("Cobros del mes · 2026-09");
  });

  it("gastos y pendientes también salen; un tipo desconocido no", async () => {
    const gastos = await (await download("gastos", "?mes=2026-08")).text();
    expect(gastos).toContain("Luz");
    expect(gastos.trim().split("\r\n")).toHaveLength(2);

    expect((await download("pendientes")).status).toBe(200);
    expect((await download("usuarios")).status).toBe(404);
  });
});
