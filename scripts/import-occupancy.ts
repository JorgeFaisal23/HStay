import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "../src/generated/prisma/client";
import type { LeaseStatus } from "../src/generated/prisma/enums";

// Mismo rango que src/lib/services/rent-schedule.ts. Se repite aquí porque la
// imagen de producción solo incluye scripts/ y src/generated/, no src/lib/.
const MIN_PAYMENT_DAY = 1;
const MAX_PAYMENT_DAY = 31;

/**
 * Importa la ocupación de unidades que ya existen: inquilinos, contratos y
 * número de servicio de luz (CFE). Sirve para cualquier organización que
 * entregue su información en este formato de archivo.
 *
 * Por defecto SIMULA: corre todo dentro de una transacción y la deshace al
 * final. Solo con --apply se guardan los cambios.
 *
 *   npx tsx scripts/import-occupancy.ts <archivo.json>
 *   npx tsx scripts/import-occupancy.ts <archivo.json> --apply
 *
 * Reglas:
 *  - Contrato con fin anterior a hoy → se guarda como terminado (ENDED) y no
 *    cambia el estado de la unidad. Vigente → ACTIVE y la unidad pasa a ocupada.
 *  - Inquilino sin correo: se registra sin acceso al portal.
 *  - Es seguro correrlo dos veces: no duplica inquilinos, contratos ni servicios.
 */

// ---------------------------------------------------------------- contrato de datos

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha con formato AAAA-MM-DD.");

const leaseSchema = z
  .object({
    startDate: isoDate,
    endDate: isoDate,
    rentAmount: z.number().nonnegative(),
    depositAmount: z.number().nonnegative().nullish(),
    paymentDay: z.number().int().min(MIN_PAYMENT_DAY).max(MAX_PAYMENT_DAY),
    notes: z.string().trim().nullish(),
  })
  .refine((l) => l.endDate > l.startDate, "El fin del contrato debe ser posterior al inicio.");

const rowSchema = z.object({
  sourceRow: z.number().int().optional(),
  building: z.string().trim().min(1),
  unitCode: z.string().trim().min(1),
  occupancy: z
    .object({
      tenant: z.object({
        name: z.string().trim().min(3),
        phone: z.string().trim().nullish(),
        email: z.string().trim().toLowerCase().email().nullish(),
      }),
      lease: leaseSchema,
    })
    .nullish(),
  electricity: z
    .object({
      serviceNumber: z.string().regex(/^\d+$/, "Número de servicio inválido.").nullish(),
      sharedWith: z.string().nullish(),
      note: z.string().nullish(),
      source: z.string().nullish(),
    })
    .nullish(),
  warnings: z.array(z.string()).default([]),
});

const fileSchema = z.object({
  source: z.string(),
  organization: z.string().min(1),
  units: z.array(rowSchema),
  skipped: z
    .array(z.object({ row: z.number().optional(), label: z.string().optional(), reason: z.string() }))
    .default([]),
});

type Row = z.infer<typeof rowSchema>;

// ---------------------------------------------------------------- utilidades

const apply = process.argv.includes("--apply");
const fileArg = process.argv.slice(2).find((a) => !a.startsWith("--"));

/** Mediodía UTC: la fecha no cambia de día en ninguna zona horaria de México. */
function toDate(iso: string) {
  return new Date(`${iso}T12:00:00Z`);
}

function loadFile(filePath: string) {
  let text = fs.readFileSync(filePath, "utf-8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const parsed = fileSchema.safeParse(JSON.parse(text));
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 10)
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`El archivo no tiene el formato esperado:\n${issues}`);
  }
  return parsed.data;
}

class DryRunRollback extends Error {}

type Report = {
  tenantsCreated: number;
  tenantsReused: number;
  leasesActive: number;
  leasesEnded: number;
  leasesSkipped: number;
  servicesCreated: number;
  lines: string[];
  problems: string[];
};

// ---------------------------------------------------------------- importación

async function main() {
  if (!fileArg) {
    throw new Error("Indica el archivo: npx tsx scripts/import-occupancy.ts <archivo.json> [--apply]");
  }
  const filePath = path.resolve(fileArg);
  const data = loadFile(filePath);

  console.log("=========================================================");
  console.log("  IMPORTADOR DE OCUPACIÓN (inquilinos, contratos, luz)");
  console.log("=========================================================");
  console.log(`Archivo      : ${filePath}`);
  console.log(`Origen       : ${data.source}`);
  console.log(`Organización : ${data.organization}`);
  console.log(`Unidades     : ${data.units.length} (${data.units.filter((u) => u.occupancy).length} con inquilino)`);
  console.log(apply ? "MODO: APLICAR (se guardan los cambios)\n" : "MODO: SIMULACIÓN (no se guarda nada; usa --apply para guardar)\n");

  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Falta DIRECT_URL o DATABASE_URL en el entorno.");
  }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  const report: Report = {
    tenantsCreated: 0,
    tenantsReused: 0,
    leasesActive: 0,
    leasesEnded: 0,
    leasesSkipped: 0,
    servicesCreated: 0,
    lines: [],
    problems: [],
  };
  const today = new Date();

  try {
    const org = await prisma.organization.findFirst({
      where: { brandName: data.organization },
      select: { id: true, brandName: true },
    });
    if (!org) throw new Error(`No existe la organización "${data.organization}".`);

    await prisma
      .$transaction(
        async (tx) => {
          for (const row of data.units) {
            await importRow(tx, org.id, row, today, report);
          }

          await tx.auditLog.create({
            data: {
              organizationId: org.id,
              action: "Importación de ocupación",
              entity: "Lease",
              detail: `${data.source}: ${report.leasesActive} vigentes, ${report.leasesEnded} terminados, ${report.tenantsCreated} inquilinos nuevos, ${report.servicesCreated} servicios de luz`,
            },
          });

          if (!apply) throw new DryRunRollback();
        },
        { timeout: 180_000, maxWait: 20_000 },
      )
      .catch((err: unknown) => {
        if (!(err instanceof DryRunRollback)) throw err;
      });
  } finally {
    await prisma.$disconnect();
  }

  printReport(data, report);
}

type Tx = Prisma.TransactionClient;

async function importRow(tx: Tx, organizationId: string, row: Row, today: Date, report: Report) {
  const label = `${row.building} ${row.unitCode}`;
  for (const w of row.warnings) report.problems.push(`${label}: ${w}`);

  const unit = await tx.unit.findFirst({
    where: { code: row.unitCode, building: { name: row.building, organizationId } },
    select: { id: true, baseRent: true, description: true },
  });
  if (!unit) {
    report.problems.push(`${label}: la unidad no existe en el sistema; se omite.`);
    return;
  }

  // -------------------------------------------- servicio de luz (lo paga el inquilino)
  const electricity = row.electricity;
  if (electricity?.serviceNumber) {
    const existing = await tx.serviceAccount.findFirst({
      where: { unitId: unit.id, type: "ELECTRICITY" },
      select: { id: true, contractNumber: true },
    });
    if (!existing) {
      await tx.serviceAccount.create({
        data: {
          type: "ELECTRICITY",
          scope: "UNIT",
          unitId: unit.id,
          providerName: "CFE",
          contractNumber: electricity.serviceNumber,
          includedInRent: false,
          splitMode: "NONE",
        },
      });
      report.servicesCreated++;
    } else if (existing.contractNumber !== electricity.serviceNumber) {
      report.problems.push(
        `${label}: ya tiene luz con número ${existing.contractNumber ?? "(vacío)"}; el archivo dice ${electricity.serviceNumber}. No se cambió.`,
      );
    }

    // La nota de medidor compartido vive en la descripción de la unidad.
    if (electricity.note) {
      const note = `Luz: ${electricity.note}`;
      if (!unit.description?.includes(note)) {
        await tx.unit.update({
          where: { id: unit.id },
          data: { description: unit.description ? `${unit.description}\n${note}` : note },
        });
      }
    }
  }

  // -------------------------------------------- inquilino y contrato
  const occupancy = row.occupancy;
  if (!occupancy) {
    report.lines.push(`  ${label}: sin inquilino`);
    return;
  }

  const { tenant: t, lease: l } = occupancy;
  const startDate = toDate(l.startDate);
  const endDate = toDate(l.endDate);
  const status: LeaseStatus = endDate < today ? "ENDED" : "ACTIVE";

  if (Number(unit.baseRent) !== l.rentAmount) {
    report.problems.push(`${label}: renta del archivo ${l.rentAmount} distinta a la de la unidad ${unit.baseRent}.`);
  }

  // Mismo inquilino en dos unidades (p. ej. dos locales) → un solo perfil.
  let tenant = await tx.user.findFirst({
    where: {
      organizationId,
      role: "TENANT",
      ...(t.email ? { email: t.email } : { name: { equals: t.name, mode: "insensitive" } }),
    },
    select: { id: true },
  });
  if (tenant) {
    report.tenantsReused++;
  } else {
    tenant = await tx.user.create({
      data: {
        organizationId,
        role: "TENANT",
        name: t.name,
        phone: t.phone ?? null,
        email: t.email ?? null,
        // Sin correo no hay acceso al portal; contraseña aleatoria que nadie conoce.
        passwordHash: bcrypt.hashSync(randomUUID(), 10),
      },
      select: { id: true },
    });
    report.tenantsCreated++;
  }

  const duplicate = await tx.lease.findFirst({
    where: { unitId: unit.id, tenantId: tenant.id, startDate },
    select: { id: true },
  });
  if (duplicate) {
    report.leasesSkipped++;
    report.lines.push(`  ${label}: contrato ya registrado, se omite`);
    return;
  }

  if (status === "ACTIVE") {
    const busy = await tx.lease.findFirst({
      where: { unitId: unit.id, status: "ACTIVE" },
      select: { id: true },
    });
    if (busy) {
      report.leasesSkipped++;
      report.problems.push(`${label}: ya tiene un contrato vigente; no se cargó el de ${t.name}.`);
      return;
    }
  }

  const lease = await tx.lease.create({
    data: {
      unitId: unit.id,
      tenantId: tenant.id,
      startDate,
      endDate,
      rentAmount: l.rentAmount,
      depositAmount: l.depositAmount ?? null,
      paymentDay: l.paymentDay,
      status,
      notes: l.notes ?? null,
    },
    select: { id: true },
  });

  if (status === "ACTIVE") {
    await tx.unit.update({ where: { id: unit.id }, data: { status: "OCCUPIED" } });
    report.leasesActive++;
  } else {
    report.leasesEnded++;
  }

  await tx.auditLog.create({
    data: {
      organizationId,
      action: "Alta de contrato (importación)",
      entity: "Lease",
      entityId: lease.id,
      detail: `${label} · ${t.name}`,
    },
  });

  report.lines.push(
    `  ${label}: ${t.name} · ${l.startDate} → ${l.endDate} · día ${l.paymentDay} · $${l.rentAmount} · ${status === "ACTIVE" ? "VIGENTE" : "TERMINADO"}`,
  );
}

function printReport(data: z.infer<typeof fileSchema>, r: Report) {
  console.log("Detalle por unidad:");
  for (const line of r.lines) console.log(line);

  if (data.skipped.length) {
    console.log("\nFilas que el archivo ya excluía:");
    for (const s of data.skipped) console.log(`  - ${s.label ?? `fila ${s.row}`}: ${s.reason}`);
  }
  if (r.problems.length) {
    console.log("\nRevisar con el cliente:");
    for (const p of r.problems) console.log(`  - ${p}`);
  }

  console.log("\n=========================================================");
  console.log(apply ? "  IMPORTACIÓN APLICADA" : "  SIMULACIÓN TERMINADA (no se guardó nada)");
  console.log("=========================================================");
  console.log(`Inquilinos nuevos       : ${r.tenantsCreated}`);
  console.log(`Inquilinos ya existentes: ${r.tenantsReused}`);
  console.log(`Contratos vigentes      : ${r.leasesActive}`);
  console.log(`Contratos terminados    : ${r.leasesEnded}`);
  console.log(`Contratos omitidos      : ${r.leasesSkipped}`);
  console.log(`Servicios de luz nuevos : ${r.servicesCreated}`);
}

main().catch((err: unknown) => {
  console.error("Error durante la importación:", err instanceof Error ? err.message : err);
  process.exit(1);
});
