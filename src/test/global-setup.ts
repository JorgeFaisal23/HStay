import { execSync } from "node:child_process";
import { testDatabaseUrl } from "./test-database";

/**
 * Antes de las pruebas de integración: aplica las migraciones pendientes a la
 * base de pruebas con `migrate deploy`, la misma ruta que sigue producción.
 *
 * No se borra la base: cada prueba crea sus propias arrendadoras con
 * identificadores únicos y las elimina al terminar (src/test/fixtures.ts). Así
 * ni una configuración equivocada puede vaciar una base con datos.
 */
export default function setup() {
  const url = testDatabaseUrl();
  execSync("npx prisma migrate deploy", {
    stdio: "pipe",
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
  });
}
