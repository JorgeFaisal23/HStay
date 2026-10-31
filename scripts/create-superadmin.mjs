// Crea una cuenta de superadministrador. Es la forma de dar de alta al primero
// en producción, donde el seed (datos de demostración) nunca se corre.
//
//   Local:   node scripts/create-superadmin.mjs correo@ejemplo.com "Nombre Apellido"
//   Docker:  docker compose run --rm app create-superadmin correo@ejemplo.com "Nombre"
//
// Imprime una contraseña temporal una sola vez. Usa DIRECT_URL (o
// DATABASE_URL) del entorno: revisa a qué base apunta antes de correrlo.
//
// Es JavaScript plano con `pg` (sin el cliente de Prisma) para poder correrlo
// dentro de la imagen de producción, que no lleva el código fuente.

import { randomInt, randomUUID } from "node:crypto";
import { config } from "dotenv";
import bcrypt from "bcryptjs";
import pg from "pg";

config({ path: [".env.local", ".env"], quiet: true });

const ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function tempPassword() {
  const chars = Array.from({ length: 12 }, () => ALPHABET[randomInt(ALPHABET.length)]);
  return [chars.slice(0, 4), chars.slice(4, 8), chars.slice(8)].map((g) => g.join("")).join("-");
}

const [emailArg, ...nameParts] = process.argv.slice(2);
const email = emailArg?.trim().toLowerCase();
const name = nameParts.join(" ").trim() || "Administración de la plataforma";

if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error('Uso: create-superadmin correo@ejemplo.com "Nombre"');
  process.exit(1);
}

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DIRECT_URL o DATABASE_URL.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const existing = await client.query('SELECT role FROM "User" WHERE email = $1', [email]);
  if (existing.rowCount > 0) {
    console.error(`Ya existe una cuenta con ${email} (rol ${existing.rows[0].role}). No se modificó nada.`);
    process.exitCode = 1;
  } else {
    const password = tempPassword();
    await client.query(
      `INSERT INTO "User" ("id", "email", "passwordHash", "name", "role", "mustChangePassword", "updatedAt")
       VALUES ($1, $2, $3, $4, 'SUPERADMIN', true, CURRENT_TIMESTAMP)`,
      [randomUUID(), email, await bcrypt.hash(password, 10), name],
    );
    console.log(`Superadministrador creado en ${new URL(url).host}`);
    console.log(`  Correo:     ${email}`);
    console.log(`  Contraseña: ${password}   (temporal; no se volverá a mostrar)`);
    console.log("Entra por /login; al entrar se te pedirá elegir una contraseña propia.");
  }
} finally {
  await client.end();
}
