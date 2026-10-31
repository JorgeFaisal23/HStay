import { config } from "dotenv";

/**
 * URL de la base de pruebas. Falla en vez de caer a DATABASE_URL: las pruebas
 * de integración borran todo y no deben poder tocar otra base por descuido.
 */
export function testDatabaseUrl() {
  config({ path: [".env.local", ".env"], quiet: true });
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      "Falta TEST_DATABASE_URL (ver .env.example). Las pruebas de integración necesitan una base propia.",
    );
  }
  if (url === process.env.DATABASE_URL || url === process.env.DIRECT_URL) {
    throw new Error("TEST_DATABASE_URL no puede ser la misma base que DATABASE_URL o DIRECT_URL.");
  }
  return url;
}
