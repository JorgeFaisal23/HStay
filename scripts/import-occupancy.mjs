// Importa la ocupación de unidades que ya existen: inquilinos, contratos y
// número de servicio de luz (CFE, lo paga el inquilino). Sirve para cualquier
// arrendadora que entregue su información en este formato de archivo (ver
// "Formato" abajo).
//
//   Local:   node scripts/import-occupancy.mjs archivo.json --org <slug> [--apply]
//   Docker:  docker compose run --rm -v /ruta/archivo.json:/data/ocupacion.json:ro \
//              app import-occupancy /data/ocupacion.json --org <slug> [--apply]
//
// Por defecto SIMULA: hace todo dentro de una transacción y la deshace al
// final. Solo con --apply se guardan los cambios. Es seguro correrlo dos
// veces: no duplica inquilinos, contratos ni servicios.
//
// Reglas (las mismas que la app al dar de alta un contrato):
//  - Contrato que ya venció → se guarda terminado ("Vencimiento"); la unidad
//    no cambia. Vigente → la unidad pasa a ocupada.
//  - Un contrato vigente no entra si la unidad está en mantenimiento, ya tiene
//    otro vigente o hay reservas de corta estancia en esas fechas.
//  - Inquilino sin correo: se registra sin acceso al portal.
//  - Cada inquilino nuevo ocupa un usuario contratado: si no caben, no se
//    importa nada (el superadministrador puede ampliar el cupo).
//
// Es JavaScript plano con `pg` (sin el cliente de Prisma) para poder correrlo
// dentro de la imagen de producción, que no lleva el código fuente.
//
// Formato del archivo:
//   { "source": "…", "units": [ {
//       "building": "CHICHEN 124", "unitCode": "DEP 1",
//       "occupancy": null | {
//         "tenant": { "name": "…", "phone": "…" | null, "email": "…" | null },
//         "lease": { "startDate": "AAAA-MM-DD", "endDate": "AAAA-MM-DD",
//                    "rentAmount": 5500, "depositAmount": null,
//                    "paymentDay": 1-31, "notes": "…" | null } },
//       "electricity": null | { "serviceNumber": "780…" | null, "note": "…" | null },
//       "warnings": ["…"] } ],
//     "skipped": [ { "label": "…", "reason": "…" } ] }

import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import bcrypt from "bcryptjs";
import pg from "pg";

config({ path: [".env.local", ".env"], quiet: true });

// ------------------------------------------------------------------ argumentos

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const orgIndex = args.indexOf("--org");
const orgSlug = orgIndex >= 0 ? args[orgIndex + 1] : undefined;
const file = args.find((a, i) => !a.startsWith("--") && i !== orgIndex + 1);

if (!file || !orgSlug) {
  console.error("Uso: import-occupancy archivo.json --org <slug-de-la-arrendadora> [--apply]");
  process.exit(1);
}

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DIRECT_URL o DATABASE_URL.");
  process.exit(1);
}

// ------------------------------------------------------------------ validación del archivo

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function validDay(value) {
  if (typeof value !== "string" || !DAY.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Errores de forma del archivo; lista vacía si está bien. */
function validate(data) {
  const errors = [];
  if (!data || !Array.isArray(data.units)) return ["Falta la lista \"units\"."];
  data.units.forEach((u, i) => {
    const at = `units[${i}] (${u?.building ?? "?"} ${u?.unitCode ?? "?"})`;
    if (typeof u?.building !== "string" || !u.building.trim()) errors.push(`${at}: falta "building".`);
    if (typeof u?.unitCode !== "string" || !u.unitCode.trim()) errors.push(`${at}: falta "unitCode".`);
    const o = u?.occupancy;
    if (o) {
      if (typeof o.tenant?.name !== "string" || o.tenant.name.trim().length < 3) {
        errors.push(`${at}: nombre del inquilino inválido.`);
      }
      if (o.tenant?.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(o.tenant.email)) {
        errors.push(`${at}: correo inválido.`);
      }
      const l = o.lease ?? {};
      if (!validDay(l.startDate)) errors.push(`${at}: inicio inválido (${l.startDate}).`);
      if (!validDay(l.endDate)) errors.push(`${at}: vencimiento inválido (${l.endDate}).`);
      if (validDay(l.startDate) && validDay(l.endDate) && l.endDate <= l.startDate) {
        errors.push(`${at}: el vencimiento debe ser posterior al inicio.`);
      }
      if (typeof l.rentAmount !== "number" || !(l.rentAmount >= 0) || l.rentAmount > 99_999_999) {
        errors.push(`${at}: renta inválida.`);
      }
      if (l.depositAmount != null && (typeof l.depositAmount !== "number" || l.depositAmount < 0)) {
        errors.push(`${at}: depósito inválido.`);
      }
      if (!Number.isInteger(l.paymentDay) || l.paymentDay < 1 || l.paymentDay > 31) {
        errors.push(`${at}: día de pago inválido (${l.paymentDay}); va del 1 al 31.`);
      }
    }
    const e = u?.electricity;
    if (e?.serviceNumber != null && !/^\d+$/.test(String(e.serviceNumber))) {
      errors.push(`${at}: número de servicio de luz inválido.`);
    }
  });
  return errors;
}

let text = readFileSync(file, "utf8");
if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
const data = JSON.parse(text);
const problems = validate(data);
if (problems.length) {
  console.error("El archivo no tiene el formato esperado:");
  for (const p of problems.slice(0, 20)) console.error(`  - ${p}`);
  process.exit(1);
}

// ------------------------------------------------------------------ utilidades

/** "AAAA-MM-DD" → mediodía, como parseDateInput de la app. */
const noon = (day) => `${day} 12:00:00`;
const todayDay = () => {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

class Rollback extends Error {}

const report = {
  tenantsCreated: 0,
  tenantsReused: 0,
  active: 0,
  ended: 0,
  skipped: 0,
  services: 0,
  lines: [],
  review: [],
};

// ------------------------------------------------------------------ importación

const client = new pg.Client({ connectionString: url });

try {
  await client.connect().catch(() => {
    throw new Error(`No se pudo conectar a la base (${new URL(url).host}).`);
  });
  const orgRow = await client.query(
    'SELECT id, name, "maxUsers" FROM "Organization" WHERE slug = $1',
    [orgSlug],
  );
  if (orgRow.rowCount === 0) throw new Error(`No existe la arrendadora con slug "${orgSlug}".`);
  const org = orgRow.rows[0];

  console.log("=========================================================");
  console.log("  IMPORTACIÓN DE OCUPACIÓN (inquilinos, contratos, luz)");
  console.log("=========================================================");
  console.log(`Base         : ${new URL(url).host}`);
  console.log(`Arrendadora  : ${org.name} (${orgSlug})`);
  console.log(`Archivo      : ${file}${data.source ? ` · ${data.source}` : ""}`);
  console.log(`Unidades     : ${data.units.length} (${data.units.filter((u) => u.occupancy).length} con inquilino)`);
  console.log(apply ? "MODO         : APLICAR\n" : "MODO         : SIMULACIÓN (usa --apply para guardar)\n");

  await client.query("BEGIN");
  try {
    for (const row of data.units) await importRow(org.id, row);

    // Cupo de usuarios contratados: se comprueba al final, ya con los nuevos.
    const { rows } = await client.query(
      'SELECT count(*)::int AS n FROM "User" WHERE "organizationId" = $1 AND active',
      [org.id],
    );
    const used = rows[0].n;
    if (used > org.maxUsers) {
      throw new Error(
        `No caben los inquilinos nuevos: quedarían ${used} usuarios activos y la arrendadora tiene ${org.maxUsers} contratados. ` +
          `Pide al superadministrador ampliar el cupo a por lo menos ${used} y vuelve a correrlo. No se importó nada.`,
      );
    }

    await client.query(
      `INSERT INTO "AuditLog" (id, "organizationId", action, entity, detail)
       VALUES ($1, $2, 'Importación de ocupación', 'Lease', $3)`,
      [
        randomUUID(),
        org.id,
        `${data.source ?? file}: ${report.active} vigentes, ${report.ended} terminados, ` +
          `${report.tenantsCreated} inquilinos nuevos, ${report.services} servicios de luz`,
      ],
    );

    if (!apply) throw new Rollback();
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    if (!(err instanceof Rollback)) throw err;
  }

  printReport();
} catch (err) {
  console.error(`Error: ${err instanceof Error ? err.message : err}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}

async function importRow(orgId, row) {
  const label = `${row.building} ${row.unitCode}`;
  for (const w of row.warnings ?? []) report.review.push(`${label}: ${w}`);

  const unitRes = await client.query(
    `SELECT u.id, u.status, u."baseRent"::float AS "baseRent", u.description
       FROM "Unit" u JOIN "Building" b ON b.id = u."buildingId"
      WHERE u."organizationId" = $1 AND b.name = $2 AND u.code = $3`,
    [orgId, row.building, row.unitCode],
  );
  if (unitRes.rowCount === 0) {
    report.review.push(`${label}: la unidad no existe en el sistema; se omitió.`);
    return;
  }
  const unit = unitRes.rows[0];

  // El mismo candado que toman la app al dar de alta contratos y reservas.
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [unit.id]);

  await importElectricity(orgId, unit, row, label);

  const occupancy = row.occupancy;
  if (!occupancy) {
    report.lines.push(`  ${label}: sin inquilino`);
    return;
  }
  const { tenant: t, lease: l } = occupancy;
  const ended = l.endDate < todayDay();

  if (unit.baseRent !== l.rentAmount) {
    report.review.push(`${label}: renta del archivo ${l.rentAmount} distinta a la de la unidad ${unit.baseRent}.`);
  }

  // Un mismo inquilino en dos unidades (p. ej. dos locales) → un solo perfil.
  const name = t.name.trim().replace(/\s+/g, " ");
  const email = t.email ? t.email.trim().toLowerCase() : null;
  const found = email
    ? await client.query('SELECT id, "organizationId", role FROM "User" WHERE email = $1', [email])
    : await client.query(
        `SELECT id, "organizationId", role FROM "User"
          WHERE "organizationId" = $1 AND role = 'TENANT' AND lower(name) = lower($2)
          ORDER BY "createdAt" LIMIT 1`,
        [orgId, name],
      );
  let tenantId;
  if (found.rowCount > 0) {
    const u = found.rows[0];
    if (u.organizationId !== orgId || u.role !== "TENANT") {
      report.skipped++;
      report.review.push(`${label}: el correo ${email} ya es de otra cuenta; no se cargó el contrato.`);
      return;
    }
    tenantId = u.id;
    report.tenantsReused++;
  } else {
    tenantId = randomUUID();
    await client.query(
      `INSERT INTO "User" (id, "organizationId", email, "passwordHash", name, phone, role, "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, 'TENANT', CURRENT_TIMESTAMP)`,
      [
        tenantId,
        orgId,
        email,
        // Nadie conoce esta contraseña: el acceso se da después desde la ficha.
        await bcrypt.hash(randomBytes(32).toString("base64url"), 10),
        name,
        t.phone?.trim() || null,
      ],
    );
    report.tenantsCreated++;
  }

  const duplicate = await client.query(
    `SELECT 1 FROM "Lease" WHERE "unitId" = $1 AND "tenantId" = $2 AND "startDate"::date = $3::date`,
    [unit.id, tenantId, l.startDate],
  );
  if (duplicate.rowCount > 0) {
    report.skipped++;
    report.lines.push(`  ${label}: contrato ya registrado, se omitió`);
    return;
  }

  if (!ended) {
    const why = await unavailable(unit, l);
    if (why) {
      report.skipped++;
      report.review.push(`${label}: no se cargó el contrato de ${name}: ${why}`);
      return;
    }
  }

  const leaseId = randomUUID();
  await client.query(
    `INSERT INTO "Lease" (id, "organizationId", "unitId", "tenantId", "startDate", "endDate",
                          "rentAmount", "depositAmount", "paymentDay", status, "endedAt", "endReason",
                          notes, "updatedAt")
     VALUES ($1, $2, $3, $4, $5::timestamp, $6::timestamp, $7, $8, $9, $10::"LeaseStatus",
             $11::timestamp, $12, $13, CURRENT_TIMESTAMP)`,
    [
      leaseId,
      orgId,
      unit.id,
      tenantId,
      noon(l.startDate),
      noon(l.endDate),
      l.rentAmount,
      l.depositAmount ?? null,
      l.paymentDay,
      ended ? "ENDED" : "ACTIVE",
      ended ? noon(l.endDate) : null,
      ended ? "Vencimiento" : null,
      l.notes ?? null,
    ],
  );

  if (ended) {
    report.ended++;
  } else {
    await client.query(
      `UPDATE "Unit" SET status = 'OCCUPIED', "updatedAt" = CURRENT_TIMESTAMP
        WHERE id = $1 AND status IN ('AVAILABLE', 'OCCUPIED')`,
      [unit.id],
    );
    report.active++;
  }

  await client.query(
    `INSERT INTO "AuditLog" (id, "organizationId", action, entity, "entityId", detail)
     VALUES ($1, $2, 'Alta de contrato (importación)', 'Lease', $3, $4)`,
    [randomUUID(), orgId, leaseId, `${label} · ${name}`],
  );

  report.lines.push(
    `  ${label}: ${name} · ${l.startDate} → ${l.endDate} · día ${l.paymentDay} · $${l.rentAmount} · ${ended ? "TERMINADO" : "VIGENTE"}`,
  );
}

/** Por qué no puede entrar un contrato vigente, o null (como unitAvailabilityError). */
async function unavailable(unit, l) {
  if (unit.status === "MAINTENANCE") return "la unidad está en mantenimiento.";
  const lease = await client.query(
    `SELECT 1 FROM "Lease" WHERE "unitId" = $1 AND status = 'ACTIVE'`,
    [unit.id],
  );
  if (lease.rowCount > 0) return "la unidad ya tiene un contrato vigente.";
  const booking = await client.query(
    `SELECT "guestName" FROM "Booking"
      WHERE "unitId" = $1 AND status = 'CONFIRMED'
        AND "checkIn" < $3::timestamp AND "checkOut" > $2::timestamp
      ORDER BY "checkIn" LIMIT 1`,
    [unit.id, noon(l.startDate), noon(l.endDate)],
  );
  if (booking.rowCount > 0) return `hay una reserva en esas fechas (${booking.rows[0].guestName}).`;
  return null;
}

async function importElectricity(orgId, unit, row, label) {
  const e = row.electricity;
  if (!e) return;

  if (e.serviceNumber) {
    const number = String(e.serviceNumber);
    const existing = await client.query(
      `SELECT "contractNumber" FROM "ServiceAccount" WHERE "unitId" = $1 AND type = 'ELECTRICITY' LIMIT 1`,
      [unit.id],
    );
    if (existing.rowCount === 0) {
      await client.query(
        `INSERT INTO "ServiceAccount" (id, "organizationId", type, scope, "unitId", "providerName",
                                       "contractNumber", "includedInRent", "updatedAt")
         VALUES ($1, $2, 'ELECTRICITY', 'UNIT', $3, 'CFE', $4, false, CURRENT_TIMESTAMP)`,
        [randomUUID(), orgId, unit.id, number],
      );
      report.services++;
    } else if (existing.rows[0].contractNumber !== number) {
      report.review.push(
        `${label}: ya tiene luz con número ${existing.rows[0].contractNumber ?? "(vacío)"}; el archivo dice ${number}. No se cambió.`,
      );
    }
  }

  // La nota de medidor compartido vive en la descripción de la unidad.
  if (e.note) {
    const note = `Luz: ${e.note}`;
    if (!unit.description?.includes(note)) {
      await client.query(
        `UPDATE "Unit" SET description = $2, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $1`,
        [unit.id, unit.description ? `${unit.description}\n${note}` : note],
      );
    }
  }
}

function printReport() {
  console.log("Detalle por unidad:");
  for (const line of report.lines) console.log(line);
  if (data.skipped?.length) {
    console.log("\nFilas que el archivo ya excluía:");
    for (const s of data.skipped) console.log(`  - ${s.label ?? `fila ${s.row}`}: ${s.reason}`);
  }
  if (report.review.length) {
    console.log("\nRevisar con el cliente:");
    for (const r of report.review) console.log(`  - ${r}`);
  }
  console.log("\n=========================================================");
  console.log(apply ? "  IMPORTACIÓN APLICADA" : "  SIMULACIÓN TERMINADA (no se guardó nada)");
  console.log("=========================================================");
  console.log(`Inquilinos nuevos       : ${report.tenantsCreated} (cada uno ocupa un usuario contratado)`);
  console.log(`Inquilinos ya existentes: ${report.tenantsReused}`);
  console.log(`Contratos vigentes      : ${report.active}`);
  console.log(`Contratos terminados    : ${report.ended}`);
  console.log(`Contratos omitidos      : ${report.skipped}`);
  console.log(`Servicios de luz nuevos : ${report.services}`);
}
