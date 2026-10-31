import { describe, expect, it } from "vitest";
import { safeRedirect } from "@/lib/redirect";

describe("safeRedirect", () => {
  it("acepta rutas internas permitidas para el rol", () => {
    expect(safeRedirect("/pagos?mes=2026-08", "ADMIN")).toBe("/pagos?mes=2026-08");
    expect(safeRedirect("/portal/pagos", "TENANT")).toBe("/portal/pagos");
  });

  it("manda a inicio si no hay destino", () => {
    expect(safeRedirect(undefined, "OWNER")).toBe("/hoy");
    expect(safeRedirect(undefined, "VIEWER")).toBe("/dashboard");
    expect(safeRedirect("", "TENANT")).toBe("/portal");
  });

  it.each([
    "//evil.com",
    "/\\evil.com",
    "https://evil.com",
    "evil.com",
    "/\\/evil.com",
    "/pagos\\..\\x",
    "/%0a//evil.com\n",
  ])("rechaza %s", (target) => {
    expect(safeRedirect(target, "OWNER")).toBe("/hoy");
  });

  it("rechaza rutas que el rol no puede abrir", () => {
    expect(safeRedirect("/dashboard", "TENANT")).toBe("/portal");
    expect(safeRedirect("/pagos", "VIEWER")).toBe("/dashboard");
    expect(safeRedirect("/configuracion/marca", "ADMIN")).toBe("/hoy");
    expect(safeRedirect("/hoy", "VIEWER")).toBe("/dashboard");
  });
});
