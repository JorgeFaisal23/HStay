import { describe, expect, it } from "vitest";
import { ScopeError, scopeArgs } from "@/lib/db/scope";

const ORG = "org_a";

describe("scopeArgs", () => {
  it.each([
    "findUnique",
    "findUniqueOrThrow",
    "findFirst",
    "findMany",
    "count",
    "aggregate",
    "groupBy",
    "update",
    "updateMany",
    "delete",
    "deleteMany",
  ])("%s filtra por la arrendadora", (operation) => {
    const args = scopeArgs("Unit", operation, { where: { id: "u1" } }, ORG);
    expect(args.where).toEqual({ id: "u1", organizationId: ORG });
  });

  it("agrega el filtro aunque no venga where", () => {
    expect(scopeArgs("Building", "findMany", undefined, ORG).where).toEqual({
      organizationId: ORG,
    });
  });

  it("pisa un organizationId distinto en el where", () => {
    const args = scopeArgs("Unit", "findMany", { where: { organizationId: "org_b" } }, ORG);
    expect(args.where).toEqual({ organizationId: ORG });
  });

  it("estampa la arrendadora en create, pisando lo que venga", () => {
    const args = scopeArgs("Building", "create", { data: { name: "X", organizationId: "org_b" } }, ORG);
    expect(args.data).toEqual({ name: "X", organizationId: ORG });
  });

  it("estampa cada fila de createMany", () => {
    const args = scopeArgs(
      "RentCharge",
      "createMany",
      { data: [{ period: "2026-01" }, { period: "2026-02" }] },
      ORG,
    );
    expect(args.data).toEqual([
      { period: "2026-01", organizationId: ORG },
      { period: "2026-02", organizationId: ORG },
    ]);
  });

  it("en upsert filtra el where y estampa el create", () => {
    const args = scopeArgs(
      "ServiceCharge",
      "upsert",
      { where: { id: "c1" }, create: { amount: 1 }, update: { amount: 2 } },
      ORG,
    );
    expect(args.where).toEqual({ id: "c1", organizationId: ORG });
    expect(args.create).toEqual({ amount: 1, organizationId: ORG });
    expect(args.update).toEqual({ amount: 2 });
  });

  it("rechaza asignar la arrendadora como relación", () => {
    expect(() =>
      scopeArgs("Building", "create", { data: { organization: { connect: { id: "org_b" } } } }, ORG),
    ).toThrow(ScopeError);
  });

  it("solo deja leer y actualizar la propia arrendadora", () => {
    const args = scopeArgs("Organization", "update", { where: { id: "org_b" }, data: { brandName: "X" } }, ORG);
    expect(args.where).toEqual({ id: ORG });
    expect(() => scopeArgs("Organization", "findMany", {}, ORG)).toThrow(ScopeError);
    expect(() => scopeArgs("Organization", "delete", { where: { id: ORG } }, ORG)).toThrow(ScopeError);
  });

  it.each(["plan", "status", "slug", "id"])(
    "no deja que la arrendadora cambie su %s",
    (field) => {
      expect(() =>
        scopeArgs("Organization", "update", { where: {}, data: { [field]: "x" } }, ORG),
      ).toThrow(ScopeError);
    },
  );

  it("rechaza modelos y operaciones no clasificados", () => {
    expect(() => scopeArgs("Desconocido", "findMany", {}, ORG)).toThrow(ScopeError);
    expect(() => scopeArgs("Unit", "operacionNueva", {}, ORG)).toThrow(ScopeError);
  });
});
