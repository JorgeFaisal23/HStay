import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Dos proyectos de pruebas:
 *
 * - unit: funciones puras y reglas de arquitectura. Sin base de datos.
 * - integration (*.int.test.ts): contra TEST_DATABASE_URL, que se reinicia
 *   con las migraciones al empezar (src/test/global-setup.ts). Nunca apunta a
 *   la base de desarrollo ni a producción.
 *
 * `server-only` lanza fuera de un React Server Component; en las pruebas se
 * sustituye por un módulo vacío para poder importar el código del servidor.
 * Los alias `@/` salen del tsconfig (Vite los resuelve de forma nativa).
 */
const shared = {
  resolve: {
    tsconfigPaths: true,
    alias: {
      "server-only": fileURLToPath(
        new URL("./src/test/empty-module.ts", import.meta.url),
      ),
    },
  },
};

export default defineConfig({
  test: {
    projects: [
      {
        ...shared,
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.int.test.ts"],
        },
      },
      {
        ...shared,
        test: {
          name: "integration",
          environment: "node",
          include: ["src/**/*.int.test.ts"],
          globalSetup: ["./src/test/global-setup.ts"],
          setupFiles: ["./src/test/integration-env.ts"],
          // Comparten una base: en serie para que no se pisen.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
