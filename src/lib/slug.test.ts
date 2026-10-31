import { describe, expect, it } from "vitest";
import { slugError, slugify } from "@/lib/slug";

describe("slugify", () => {
  it("convierte nombres en slugs válidos", () => {
    expect(slugify("Rentas del Valle")).toBe("rentas-del-valle");
    expect(slugify("  Peña & Asociados, S.A.  ")).toBe("pena-asociados-s-a");
    expect(slugify("CARCAR")).toBe("carcar");
  });

  it("recorta a 40 caracteres sin dejar guion final", () => {
    const slug = slugify("a".repeat(39) + " bcd");
    expect(slug.length).toBeLessThanOrEqual(40);
    expect(slug.endsWith("-")).toBe(false);
  });
});

describe("slugError", () => {
  it.each(["carcar", "rentas-del-valle", "demo2", "abc"])("acepta %s", (slug) => {
    expect(slugError(slug)).toBeNull();
  });

  it.each(["ab", "-abc", "abc-", "a--b", "Mayus", "con espacio", "ñandu", "a".repeat(41)])(
    "rechaza %s",
    (slug) => {
      expect(slugError(slug)).not.toBeNull();
    },
  );

  it("rechaza los reservados", () => {
    expect(slugError("superadmin")).toMatch(/reservado/);
    expect(slugError("login")).toMatch(/reservado/);
  });
});
