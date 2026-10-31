"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOrgUserAction } from "@/lib/auth/session";
import { logAction } from "@/server/actions/audit";
import { buildingExists, unitExists } from "@/lib/db/guards";
import type { ActionResult } from "@/lib/action-result";
import type { OrgDb } from "@/lib/db/scoped";
import { limitError, type LimitedResource } from "@/lib/plans";
import { CURRENCIES } from "@/lib/currency";
import { currencyLockReason } from "@/lib/queries/properties";

/** Error si dar de alta uno más rebasa el plan de la arrendadora. */
async function planLimitError(db: OrgDb, resource: Exclude<LimitedResource, "staff">) {
  const [org, count] = await Promise.all([
    db.organization.findFirstOrThrow({ select: { plan: true } }),
    resource === "buildings" ? db.building.count() : db.unit.count(),
  ]);
  return limitError(org.plan, resource, count);
}


// ------------------------------------------------------------------ edificios

const buildingSchema = z.object({
  name: z.string().trim().min(2, "Escribe el nombre de la propiedad."),
  address: z.string().trim().min(4, "Escribe la dirección."),
  city: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  currency: z.enum(CURRENCIES, { error: "Elige la moneda de la propiedad." }),
});

function readBuilding(formData: FormData) {
  return buildingSchema.safeParse({
    name: formData.get("name"),
    address: formData.get("address"),
    city: formData.get("city") || undefined,
    notes: formData.get("notes") || undefined,
    currency: formData.get("currency") || "MXN",
  });
}

export async function createBuilding(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { session, orgId, db } = await requireOrgUserAction(["OWNER", "ADMIN"]);

  const parsed = readBuilding(formData);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisa los datos." };
  }

  const overLimit = await planLimitError(db, "buildings");
  if (overLimit) return { error: overLimit };

  const building = await db.building.create({
    data: { ...parsed.data, organizationId: orgId },
  });
  await logAction(db, session.sub, "Alta de propiedad", "Building", building.id, building.name);

  revalidatePath("/edificios");
  revalidatePath("/dashboard");
  revalidatePath("/hoy");
  return { ok: true };
}

export async function updateBuilding(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { session, db } = await requireOrgUserAction(["OWNER", "ADMIN"]);
  const buildingId = String(formData.get("buildingId") ?? "");

  const parsed = readBuilding(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisa los datos." };
  }
  const current = await db.building.findUnique({
    where: { id: buildingId },
    select: { currency: true },
  });
  if (!current) return { error: "No se encontró la propiedad." };

  const currencyChanged = current.currency !== parsed.data.currency;
  if (currencyChanged) {
    const locked = await currencyLockReason(db, buildingId);
    if (locked) return { error: `No se puede cambiar la moneda. ${locked}` };
  }

  await db.building.update({
    where: { id: buildingId },
    data: {
      name: parsed.data.name,
      address: parsed.data.address,
      city: parsed.data.city ?? null,
      notes: parsed.data.notes ?? null,
      currency: parsed.data.currency,
    },
  });
  await logAction(
    db,
    session.sub,
    "Edición de propiedad",
    "Building",
    buildingId,
    currencyChanged
      ? `${parsed.data.name} · moneda ${current.currency} → ${parsed.data.currency}`
      : parsed.data.name,
  );

  revalidatePath("/edificios");
  revalidatePath(`/edificios/${buildingId}`);
  revalidatePath("/dashboard");
  revalidatePath("/hoy");
  return { ok: true };
}

/**
 * Por qué no se puede borrar una propiedad o unidad, o null si se puede.
 * Borrar arrastra en cascada contratos, cobros y servicios, así que solo se
 * permite mientras no haya nada que conservar.
 */
async function deletionBlocker(
  db: OrgDb,
  target: { buildingId: string } | { unitId: string },
): Promise<string | null> {
  const unit = "buildingId" in target ? { buildingId: target.buildingId } : { id: target.unitId };
  const accounts =
    "buildingId" in target
      ? { OR: [{ buildingId: target.buildingId }, { unit }] }
      : { unitId: target.unitId };

  const [activeLeases, upcomingBookings, leases, bookings, serviceCharges, tasks, expenses, payouts] = await Promise.all([
    db.lease.count({ where: { unit, status: "ACTIVE" } }),
    db.booking.count({ where: { unit, status: "CONFIRMED", checkOut: { gte: new Date() } } }),
    db.lease.count({ where: { unit } }),
    db.booking.count({ where: { unit } }),
    db.serviceCharge.count({ where: { serviceAccount: accounts } }),
    db.task.count({ where: { unit } }),
    db.expense.count({ where: { unit } }),
    "buildingId" in target ? db.ownerPayout.count({ where: { buildingId: target.buildingId } }) : 0,
  ]);

  if (activeLeases > 0) return "Tiene contratos vigentes. Termínalos antes de eliminar.";
  if (upcomingBookings > 0) return "Tiene reservas próximas. Cancélalas antes de eliminar.";
  if (leases + bookings + serviceCharges + tasks + expenses + payouts > 0) {
    return "Tiene historial de contratos, reservas, servicios, tareas, gastos o entregas al propietario, y eliminarla lo borraría. Puedes editarla en su lugar.";
  }
  return null;
}

export async function deleteBuilding(buildingId: string): Promise<ActionResult> {
  const { session, db } = await requireOrgUserAction(["OWNER", "ADMIN"]);

  const building = await db.building.findUnique({
    where: { id: buildingId },
    select: { name: true },
  });
  if (!building) return { error: "No se encontró la propiedad." };

  const blocker = await deletionBlocker(db, { buildingId });
  if (blocker) return { error: blocker };

  await db.building.delete({ where: { id: buildingId } });
  await logAction(db, session.sub, "Baja de propiedad", "Building", buildingId, building.name);

  revalidatePath("/edificios");
  revalidatePath("/dashboard");
  revalidatePath("/hoy");
  redirect("/edificios");
}

// ------------------------------------------------------------------ unidades

/** Tarifa de estancia opcional: vacía se guarda como "sin tarifa". */
const stayRate = z.coerce
  .number()
  .min(0, "Las tarifas no pueden ser negativas.")
  .max(99_999_999)
  .nullable()
  .transform((value) => (value === 0 ? null : value));

const unitSchema = z.object({
  buildingId: z.string().min(1, "Elige la propiedad."),
  code: z.string().trim().min(1, "Escribe el identificador de la unidad."),
  name: z.string().trim().optional(),
  type: z.enum(["ROOM", "APARTMENT", "STUDIO", "COMMERCIAL"]),
  status: z.enum(["AVAILABLE", "OCCUPIED", "SHORT_TERM", "MAINTENANCE"]),
  floor: z.coerce.number().int().min(0).max(200).optional(),
  bedrooms: z.coerce.number().int().min(0).max(20),
  bathrooms: z.coerce.number().int().min(0).max(20),
  sizeM2: z.coerce.number().min(0).max(10000).optional(),
  baseRent: z.coerce.number().min(0, "La renta no puede ser negativa."),
  nightlyRate: stayRate,
  weeklyRate: stayRate,
  monthlyRate: stayRate,
  description: z.string().trim().optional(),
});

function readUnitForm(formData: FormData) {
  return {
    buildingId: formData.get("buildingId"),
    code: formData.get("code"),
    name: formData.get("name") || undefined,
    type: formData.get("type"),
    status: formData.get("status"),
    floor: formData.get("floor") || undefined,
    bedrooms: formData.get("bedrooms") || 1,
    bathrooms: formData.get("bathrooms") || 1,
    sizeM2: formData.get("sizeM2") || undefined,
    baseRent: formData.get("baseRent"),
    nightlyRate: formData.get("nightlyRate") || null,
    weeklyRate: formData.get("weeklyRate") || null,
    monthlyRate: formData.get("monthlyRate") || null,
    description: formData.get("description") || undefined,
  };
}

export async function createUnit(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { session, orgId, db } = await requireOrgUserAction(["OWNER", "ADMIN"]);
  const parsed = unitSchema.safeParse(readUnitForm(formData));

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisa los datos." };
  }

  if (!(await buildingExists(db, parsed.data.buildingId))) {
    return { error: "No se encontró la propiedad." };
  }

  const overLimit = await planLimitError(db, "units");
  if (overLimit) return { error: overLimit };

  // El identificador debe ser único dentro del edificio: dos "101" en el mismo
  // inmueble harían imposible saber de cuál se habla.
  const duplicate = await db.unit.findFirst({
    where: { buildingId: parsed.data.buildingId, code: parsed.data.code },
    select: { id: true },
  });
  if (duplicate) {
    return {
      error: `Ya existe una unidad con el identificador "${parsed.data.code}" en esta propiedad.`,
    };
  }

  const unit = await db.unit.create({
    data: { ...parsed.data, organizationId: orgId },
  });
  await logAction(db, session.sub, "Alta de unidad", "Unit", unit.id, unit.code);

  revalidatePath("/edificios");
  revalidatePath(`/edificios/${parsed.data.buildingId}`);
  revalidatePath("/dashboard");
  revalidatePath("/hoy");
  redirect(`/unidades/${unit.id}`);
}

export async function updateUnit(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { session, db } = await requireOrgUserAction(["OWNER", "ADMIN"]);
  const unitId = String(formData.get("unitId") ?? "");
  if (!unitId) return { error: "No se identificó la unidad." };

  const parsed = unitSchema.safeParse(readUnitForm(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisa los datos." };
  }

  // La unidad y la propiedad a la que se mueve deben ser de la arrendadora.
  const [unitOk, buildingOk] = await Promise.all([
    unitExists(db, unitId),
    buildingExists(db, parsed.data.buildingId),
  ]);
  if (!unitOk) return { error: "No se encontró la unidad." };
  if (!buildingOk) return { error: "No se encontró la propiedad." };

  const duplicate = await db.unit.findFirst({
    where: {
      buildingId: parsed.data.buildingId,
      code: parsed.data.code,
      NOT: { id: unitId },
    },
    select: { id: true },
  });
  if (duplicate) {
    return {
      error: `Ya existe otra unidad con el identificador "${parsed.data.code}" en esta propiedad.`,
    };
  }

  await db.unit.update({ where: { id: unitId }, data: parsed.data });
  await logAction(db, session.sub, "Edición de unidad", "Unit", unitId, parsed.data.code);

  revalidatePath(`/unidades/${unitId}`);
  revalidatePath(`/edificios/${parsed.data.buildingId}`);
  revalidatePath("/edificios");
  return { ok: true };
}

export async function deleteUnit(unitId: string): Promise<ActionResult> {
  const { session, db } = await requireOrgUserAction(["OWNER", "ADMIN"]);

  const unit = await db.unit.findUnique({
    where: { id: unitId },
    select: { code: true, buildingId: true },
  });
  if (!unit) return { error: "No se encontró la unidad." };

  const blocker = await deletionBlocker(db, { unitId });
  if (blocker) return { error: blocker };

  await db.unit.delete({ where: { id: unitId } });
  await logAction(db, session.sub, "Baja de unidad", "Unit", unitId, unit.code);

  revalidatePath("/edificios");
  revalidatePath(`/edificios/${unit.buildingId}`);
  revalidatePath("/dashboard");
  revalidatePath("/hoy");
  redirect(`/edificios/${unit.buildingId}`);
}

// ------------------------------------------------------------------ servicios

const SERVICE_TYPES = ["WATER", "ELECTRICITY", "INTERNET", "MAINTENANCE", "GAS", "OTHER"] as const;
const SPLIT_MODES = ["NONE", "EQUAL", "BY_SIZE"] as const;

const serviceAccountSchema = z.object({
  includedInRent: z.coerce.boolean(),
  providerName: z.string().trim().optional(),
  contractNumber: z.string().trim().optional(),
  splitMode: z.enum(SPLIT_MODES).optional(),
});

/** Guarda la configuración de un servicio (incluido Sí/No, proveedor, contrato). */
export async function updateServiceAccount(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { session, db } = await requireOrgUserAction(["OWNER", "ADMIN"]);
  const accountId = String(formData.get("accountId") ?? "");
  if (!accountId) return { error: "No se identificó el servicio." };

  const parsed = serviceAccountSchema.safeParse({
    includedInRent: formData.get("includedInRent") === "on",
    providerName: formData.get("providerName") || undefined,
    contractNumber: formData.get("contractNumber") || undefined,
    splitMode: formData.get("splitMode") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisa los datos." };
  }

  const existing = await db.serviceAccount.findUnique({
    where: { id: accountId },
    select: { scope: true },
  });
  if (!existing) return { error: "No se encontró el servicio." };

  const account = await db.serviceAccount.update({
    where: { id: accountId },
    data: {
      includedInRent: parsed.data.includedInRent,
      providerName: parsed.data.providerName ?? null,
      contractNumber: parsed.data.contractNumber ?? null,
      // Solo un recibo de edificio se reparte entre unidades.
      ...(existing.scope === "BUILDING" && parsed.data.splitMode
        ? { splitMode: parsed.data.splitMode }
        : {}),
    },
    select: { unitId: true, buildingId: true, type: true },
  });

  await logAction(db, session.sub, "Edición de servicio", "ServiceAccount", accountId, account.type);

  if (account.unitId) revalidatePath(`/unidades/${account.unitId}`);
  if (account.buildingId) revalidatePath(`/edificios/${account.buildingId}`);
  revalidatePath("/servicios");
  return { ok: true };
}

/** Da de alta un servicio para una unidad (p. ej. contratar internet). */
export async function createUnitServiceAccount(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { session, orgId, db } = await requireOrgUserAction(["OWNER", "ADMIN"]);

  const schema = z.object({
    unitId: z.string().min(1),
    type: z.enum(SERVICE_TYPES),
    providerName: z.string().trim().optional(),
    contractNumber: z.string().trim().optional(),
    includedInRent: z.coerce.boolean(),
  });

  const parsed = schema.safeParse({
    unitId: formData.get("unitId"),
    type: formData.get("type"),
    providerName: formData.get("providerName") || undefined,
    contractNumber: formData.get("contractNumber") || undefined,
    includedInRent: formData.get("includedInRent") === "on",
  });

  if (!parsed.success) {
    return { error: "Elige el tipo de servicio." };
  }

  if (!(await unitExists(db, parsed.data.unitId))) {
    return { error: "No se encontró la unidad." };
  }

  const exists = await db.serviceAccount.findFirst({
    where: { unitId: parsed.data.unitId, type: parsed.data.type },
    select: { id: true },
  });
  if (exists) {
    return { error: "Esta unidad ya tiene registrado ese servicio." };
  }

  await db.serviceAccount.create({
    data: {
      organizationId: orgId,
      scope: "UNIT",
      unitId: parsed.data.unitId,
      type: parsed.data.type,
      providerName: parsed.data.providerName ?? null,
      contractNumber: parsed.data.contractNumber ?? null,
      includedInRent: parsed.data.includedInRent,
    },
  });

  await logAction(db, session.sub, "Alta de servicio", "ServiceAccount", parsed.data.unitId, parsed.data.type);

  revalidatePath(`/unidades/${parsed.data.unitId}`);
  revalidatePath("/servicios");
  return { ok: true };
}

/** Da de alta un recibo a nombre de la propiedad completa (p. ej. el agua del edificio). */
export async function createBuildingServiceAccount(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { session, orgId, db } = await requireOrgUserAction(["OWNER", "ADMIN"]);

  const schema = z.object({
    buildingId: z.string().min(1),
    type: z.enum(SERVICE_TYPES),
    providerName: z.string().trim().optional(),
    contractNumber: z.string().trim().optional(),
    includedInRent: z.coerce.boolean(),
    splitMode: z.enum(SPLIT_MODES),
  });

  const parsed = schema.safeParse({
    buildingId: formData.get("buildingId"),
    type: formData.get("type"),
    providerName: formData.get("providerName") || undefined,
    contractNumber: formData.get("contractNumber") || undefined,
    includedInRent: formData.get("includedInRent") === "on",
    splitMode: formData.get("splitMode") || "EQUAL",
  });

  if (!parsed.success) {
    return { error: "Elige el tipo de servicio y cómo se reparte." };
  }

  if (!(await buildingExists(db, parsed.data.buildingId))) {
    return { error: "No se encontró la propiedad." };
  }

  const exists = await db.serviceAccount.findFirst({
    where: { buildingId: parsed.data.buildingId, type: parsed.data.type },
    select: { id: true },
  });
  if (exists) {
    return { error: "Esta propiedad ya tiene registrado ese servicio." };
  }

  const account = await db.serviceAccount.create({
    data: {
      organizationId: orgId,
      scope: "BUILDING",
      buildingId: parsed.data.buildingId,
      type: parsed.data.type,
      providerName: parsed.data.providerName ?? null,
      contractNumber: parsed.data.contractNumber ?? null,
      includedInRent: parsed.data.includedInRent,
      splitMode: parsed.data.splitMode,
    },
  });

  await logAction(db, session.sub, "Alta de servicio de propiedad", "ServiceAccount", account.id, parsed.data.type);

  revalidatePath(`/edificios/${parsed.data.buildingId}`);
  revalidatePath("/servicios");
  return { ok: true };
}
