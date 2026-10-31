import "./prisma/env";
import { defineConfig } from "prisma/config";

/**
 * Prisma 7 lee las URLs de conexión desde aquí (ya no desde schema.prisma).
 * Para migrar se prefiere DIRECT_URL: si la app pasa por un pooler de
 * conexiones, las migraciones necesitan una conexión directa a PostgreSQL.
 *
 * `migrate dev` necesita una base auxiliar vacía (shadow) para calcular
 * diferencias; solo se usa en desarrollo.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"],
    shadowDatabaseUrl: process.env["SHADOW_DATABASE_URL"],
  },
});
