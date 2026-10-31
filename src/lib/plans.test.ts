import { describe, expect, it } from "vitest";
import { limitError, PLAN_LIMITS, userQuotaError } from "@/lib/plans";

describe("limitError", () => {
  it("deja crear mientras no se pase del límite gratuito", () => {
    expect(limitError("FREE", "buildings", 0)).toBeNull();
    expect(limitError("FREE", "buildings", 1)).toBeNull();
    expect(limitError("FREE", "units", 19)).toBeNull();
  });

  it("bloquea al alcanzar el límite gratuito", () => {
    expect(limitError("FREE", "buildings", 2)).toMatch(/hasta 2 propiedades/);
    expect(limitError("FREE", "units", 20)).toMatch(/hasta 20 unidades/);
  });

  it("Premium no tiene límite de propiedades ni unidades", () => {
    expect(limitError("PREMIUM", "buildings", 500)).toBeNull();
    expect(limitError("PREMIUM", "units", 500)).toBeNull();
  });

  it("los planes no definen usuarios: se contratan aparte", () => {
    expect(Object.keys(PLAN_LIMITS.FREE).sort()).toEqual(["buildings", "units"]);
    expect(Object.keys(PLAN_LIMITS.PREMIUM).sort()).toEqual(["buildings", "units"]);
  });
});

describe("usuarios contratados", () => {
  it("deja dar de alta mientras quede lugar", () => {
    expect(userQuotaError(0, 1)).toBeNull();
    expect(userQuotaError(4, 5)).toBeNull();
  });

  it("bloquea al ocuparse todos y remite a la plataforma, no a Premium", () => {
    const message = userQuotaError(5, 5);
    expect(message).toMatch(/contratados 5 usuarios/);
    expect(message).toMatch(/pide a la plataforma/);
    expect(message).not.toMatch(/Premium/);
    expect(userQuotaError(1, 1)).toMatch(/contratados 1 usuario y ya está ocupado/);
  });

  it("si ya se pasó (la plataforma bajó el número) tampoco deja sumar", () => {
    expect(userQuotaError(8, 5)).not.toBeNull();
  });
});
