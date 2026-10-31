import { describe, expect, it } from "vitest";
import { generateTempPassword } from "@/lib/passwords";

describe("generateTempPassword", () => {
  it("tiene tres grupos de cuatro sin caracteres ambiguos", () => {
    for (let i = 0; i < 200; i++) {
      const password = generateTempPassword();
      expect(password).toMatch(/^[a-km-zA-HJ-NP-Z2-9]{4}-[a-km-zA-HJ-NP-Z2-9]{4}-[a-km-zA-HJ-NP-Z2-9]{4}$/);
      expect(password).not.toMatch(/[01lIoO]/);
    }
  });

  it("no se repite", () => {
    const seen = new Set(Array.from({ length: 500 }, generateTempPassword));
    expect(seen.size).toBe(500);
  });
});
