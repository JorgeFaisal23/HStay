import { config } from "dotenv";

/**
 * Carga las variables de entorno para el CLI de Prisma, el seed y los scripts,
 * con la misma precedencia que Next.js: `.env.local` gana sobre `.env`.
 * dotenv no pisa una variable ya definida, así que se carga primero la local.
 */
config({ path: [".env.local", ".env"], quiet: true });
