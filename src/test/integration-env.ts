import { testDatabaseUrl } from "./test-database";

// Corre antes de importar cualquier módulo de la prueba: así el cliente de
// Prisma (src/lib/prisma.ts) se conecta a la base de pruebas.
const url = testDatabaseUrl();
process.env.DATABASE_URL = url;
process.env.DIRECT_URL = url;
process.env.AUTH_SECRET ??= "secreto-de-pruebas-de-integracion-0123456789";
