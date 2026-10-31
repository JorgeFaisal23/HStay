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

  it("el propietario solo ve su vista y nadie más entra a ella", () => {
    expect(canAccessPath("PROPERTY_OWNER", "/propietario")).toBe(true);
    expect(canAccessPath("PROPERTY_OWNER", "/propietario/cuenta")).toBe(true);
    expect(canAccessPath("PROPERTY_OWNER", "/propietario/entregas/x/comprobante")).toBe(true);
    expect(canAccessPath("PROPERTY_OWNER", "/cambiar-contrasena")).toBe(true);
    for (const path of ["/hoy", "/dashboard", "/pagos", "/inquilinos", "/propietarios", "/edificios/x", "/portal", "/operacion", "/reportes/exportar/cobros", "/superadmin"]) {
      expect(canAccessPath("PROPERTY_OWNER", path), path).toBe(false);
    }
    for (const role of ["OWNER", "ADMIN", "VIEWER", "OPERATIONS", "TENANT"] as const) {
      expect(canAccessPath(role, "/propietario"), role).toBe(false);
    }
    // La administración de propietarios es del equipo, no del propietario.
    expect(canAccessPath("ADMIN", "/propietarios")).toBe(true);
    expect(canAccessPath("VIEWER", "/propietarios")).toBe(false);
  });

  it("Captura solo entra a su vista y nadie más entra a ella", () => {
    expect(canAccessPath("CAPTURE", "/captura")).toBe(true);
    expect(canAccessPath("CAPTURE", "/captura/cuenta")).toBe(true);
    expect(canAccessPath("CAPTURE", "/cambiar-contrasena")).toBe(true);
    for (const path of ["/hoy", "/dashboard", "/calendario", "/reservas", "/pagos", "/inquilinos", "/edificios/x", "/unidades/x", "/equipo", "/reportes/exportar/cobros", "/portal", "/operacion", "/propietario", "/superadmin", "/capturas"]) {
      expect(canAccessPath("CAPTURE", path), path).toBe(false);
    }
    for (const role of ["OWNER", "ADMIN", "VIEWER", "OPERATIONS", "PROPERTY_OWNER", "TENANT"] as const) {
      expect(canAccessPath(role, "/captura"), role).toBe(false);
    }
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
    expect(homePathFor("PROPERTY_OWNER")).toBe("/propietario");
    expect(homePathFor("CAPTURE")).toBe("/captura");
    expect(homePathFor("SUPERADMIN")).toBe("/superadmin");
  });
});

describe("modo soporte", () => {
  const support = { support: true };

  it("navega como Administrativo", () => {
    for (const path of ["/dashboard", "/hoy", "/pagos", "/contratos", "/inquilinos", "/calendario"]) {
      expect(canAccessPath("ADMIN", path, support), path).toBe(true);
    }
  });

  it("no entra a configuración, cuenta personal, portales ni plataforma", () => {
    for (const path of ["/configuracion", "/configuracion/marca", "/cuenta", "/cambiar-contrasena", "/superadmin", "/portal", "/propietario", "/captura"]) {
      expect(canAccessPath("ADMIN", path, support), path).toBe(false);
    }
  });

  it("fuera de soporte, el Administrativo sí ve su cuenta", () => {
    expect(canAccessPath("ADMIN", "/cuenta")).toBe(true);
  });
});
