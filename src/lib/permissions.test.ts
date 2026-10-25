import { describe, expect, it } from "vitest";
import { canAccessPath, homePathFor } from "@/lib/permissions";

describe("canAccessPath", () => {
  it("Operación solo entra a su vista", () => {
    expect(canAccessPath("OPERATIONS", "/operacion")).toBe(true);
    expect(canAccessPath("OPERATIONS", "/operacion/cuenta")).toBe(true);
    expect(canAccessPath("OPERATIONS", "/operacion/archivos/reporte/x")).toBe(true);
    for (const path of ["/hoy", "/dashboard", "/pagos", "/inquilinos", "/tareas", "/portal", "/reportes/exportar/cobros", "/comprobantes/x/imagen", "/superadmin", "/operaciones"]) {
      expect(canAccessPath("OPERATIONS", path), path).toBe(false);
    }
    expect(canAccessPath("OPERATIONS", "/cambiar-contrasena")).toBe(true);
  });

  it("el inquilino solo ve el portal y nadie más entra al portal", () => {
    expect(canAccessPath("TENANT", "/portal/reportes")).toBe(true);
    expect(canAccessPath("TENANT", "/operacion")).toBe(false);
    expect(canAccessPath("TENANT", "/tareas")).toBe(false);
    expect(canAccessPath("OWNER", "/portal")).toBe(false);
  });

  it("consulta no ve tareas ni Hoy; el equipo sí", () => {
    expect(canAccessPath("VIEWER", "/tareas")).toBe(false);
    expect(canAccessPath("VIEWER", "/hoy")).toBe(false);
    expect(canAccessPath("ADMIN", "/tareas")).toBe(true);
    expect(canAccessPath("OWNER", "/hoy")).toBe(true);
    expect(canAccessPath("ADMIN", "/configuracion/marca")).toBe(false);
  });
});

describe("homePathFor", () => {
  it("cada rol entra a lo suyo", () => {
    expect(homePathFor("OWNER")).toBe("/hoy");
    expect(homePathFor("ADMIN")).toBe("/hoy");
    expect(homePathFor("VIEWER")).toBe("/dashboard");
    expect(homePathFor("OPERATIONS")).toBe("/operacion");
    expect(homePathFor("TENANT")).toBe("/portal");
    expect(homePathFor("SUPERADMIN")).toBe("/superadmin");
  });
});
