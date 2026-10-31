import { describe, expect, it } from "vitest";
import packageJson from "../../package.json";
import { APP } from "./app";

describe("versión visible", () => {
  it("coincide con la de package.json", () => {
    expect(APP.version).toBe(packageJson.version);
  });
});
