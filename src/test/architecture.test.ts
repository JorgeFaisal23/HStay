import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { ModelName } from "@/generated/prisma/internal/prismaNamespace";
import { PLATFORM_MODELS, TENANT_MODELS } from "@/lib/db/scope";

/**
 * Reglas de arquitectura que sostienen el aislamiento entre arrendadoras.
 * No prueban comportamiento: fallan cuando alguien rompe la convención.
 */

const ROOT = join(__dirname, "..", "..");
const SRC = join(ROOT, "src");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      return name === "generated" ? [] : walk(full);
    }
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

const rel = (file: string) => relative(ROOT, file).split(sep).join("/");

/** Mismos módulos de plataforma que la regla de ESLint (eslint.config.mjs). */
const PLATFORM_PREFIXES = [
  "src/lib/prisma.ts",
  "src/lib/db/",
  "src/lib/auth/",
  "src/lib/org.ts",
  "src/app/login/",
  "src/server/auth/",
  "src/server/superadmin/",
  "src/test/",
];

describe("aislamiento entre arrendadoras", () => {
  it("cada modelo está clasificado", () => {
    const classified = new Set<string>([
      "Organization",
      ...TENANT_MODELS,
      ...PLATFORM_MODELS,
    ]);
    expect([...classified].sort()).toEqual(Object.values(ModelName).sort());
  });

  it("solo la plataforma escribe los usuarios contratados", () => {
    // Fuera de src/server/superadmin/ el campo solo se lee (`maxUsers: true`).
    const offenders = walk(join(SRC, "server"))
      .concat(walk(join(SRC, "app")).filter((file) => /actions\.ts$/.test(file)))
      .map(rel)
      .filter((file) => !file.startsWith("src/server/superadmin/"))
      .filter((file) => /maxUsers\s*:(?!\s*true\b)/.test(readFileSync(join(ROOT, file), "utf8")));
    expect(offenders).toEqual([]);
  });

  it("solo los módulos de plataforma importan el cliente sin alcance", () => {
    const offenders = walk(SRC)
      .map(rel)
      .filter((file) => !PLATFORM_PREFIXES.some((prefix) => file.startsWith(prefix)))
      .filter((file) =>
        /from\s+["'](@\/lib\/prisma|.*\/lib\/prisma)["']/.test(
          readFileSync(join(ROOT, file), "utf8"),
        ),
      );
    expect(offenders).toEqual([]);
  });

  it("toda server action exportada exige sesión antes de hacer nada", () => {
    // Las únicas acciones públicas: se usan sin sesión por definición.
    const PUBLIC_ACTIONS = new Set([
      "public-actions.ts: requestPasswordReset",
      "public-actions.ts: completePasswordLink",
    ]);
    const missing: string[] = [];
    const dirs = ["actions", "superadmin", "auth"].map((d) => join(SRC, "server", d));

    for (const dir of dirs) {
      for (const name of readdirSync(dir)) {
        const source = readFileSync(join(dir, name), "utf8");
        if (!source.startsWith('"use server"')) continue;

        const chunks = source.split(/^export async function /m).slice(1);
        for (const chunk of chunks) {
          const fn = `${name}: ${chunk.slice(0, chunk.indexOf("("))}`;
          if (PUBLIC_ACTIONS.has(fn)) continue;
          if (!/await require\w*Action\(/.test(chunk)) missing.push(fn);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("las acciones públicas siguen siendo solo esas", () => {
    const source = readFileSync(join(SRC, "server", "auth", "public-actions.ts"), "utf8");
    const exported = [...source.matchAll(/^export async function (\w+)/gm)].map((m) => m[1]);
    expect(exported.sort()).toEqual(["completePasswordLink", "requestPasswordReset"]);
  });

  it("las acciones de plataforma exigen superadministrador", () => {
    const source = readFileSync(join(SRC, "server", "superadmin", "actions.ts"), "utf8");
    const chunks = source.split(/^export async function /m).slice(1);
    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) {
      expect(chunk).toMatch(/await requireSuperadminAction\(/);
    }
  });
});
