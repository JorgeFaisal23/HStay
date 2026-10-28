import type { Prisma } from "@/generated/prisma/client";

/**
 * Reglas del aislamiento entre arrendadoras, sin dependencias de servidor para
 * poder probarlas sin base de datos. El cliente que las aplica está en
 * ./scoped.ts.
 */

/** Modelos cuyas filas pertenecen a una arrendadora (llevan organizationId). */
export const TENANT_MODELS: ReadonlySet<Prisma.ModelName> = new Set<Prisma.ModelName>([
  "User",
  "Building",
  "Unit",
  "ServiceAccount",
  "ServiceCharge",
  "Lease",
  "RentCharge",
  "RentPayment",
  "PaymentProof",
  "Task",
  "Expense",
  "OwnerPayout",
  "Booking",
  "AirbnbConnection",
  "AuditLog",
]);

/**
 * Modelos que el cliente con alcance no expone. Cada modelo nuevo debe quedar
 * en TENANT_MODELS, aquí, o ser `Organization`; una prueba lo comprueba.
 */
export const PLATFORM_MODELS: ReadonlySet<Prisma.ModelName> = new Set<Prisma.ModelName>([
  "AuthToken",
  "LoginThrottle",
]);

/** Operaciones que filtran por `where`: se les añade la arrendadora. */
const WHERE_OPERATIONS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "delete",
  "deleteMany",
]);

/** Sobre su propia fila, una arrendadora solo puede leer y actualizar. */
const ORGANIZATION_OPERATIONS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "update",
]);

export class ScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScopeError";
  }
}

type Args = Record<string, unknown> | undefined;

function withData(data: unknown, orgId: string) {
  if (data === undefined || data === null || typeof data !== "object") {
    throw new ScopeError("Escritura sin datos en el cliente con alcance.");
  }
  // Una relación escrita como `organization: { connect }` haría a Prisma mezclar
  // entradas "checked" y "unchecked"; además permitiría apuntar a otra
  // arrendadora. Solo se acepta la columna, y la pone el cliente.
  if ("organization" in data) {
    throw new ScopeError("No se puede asignar la arrendadora desde la consulta.");
  }
  return { ...data, organizationId: orgId };
}

/**
 * Devuelve los argumentos de la operación con la arrendadora impuesta.
 *
 * - Lecturas, actualizaciones y borrados: `where.organizationId = orgId`. Si el
 *   id pertenece a otra arrendadora, la fila simplemente no se encuentra.
 * - Altas: `data.organizationId = orgId`, pisando lo que viniera.
 * - Cualquier modelo u operación no clasificados lanza: es preferible un error
 *   ruidoso a una consulta sin filtro.
 */
export function scopeArgs(
  model: string,
  operation: string,
  args: Args,
  orgId: string,
): Record<string, unknown> {
  const current = args ?? {};

  if (model === "Organization") {
    if (!ORGANIZATION_OPERATIONS.has(operation)) {
      throw new ScopeError(`Operación ${operation} no permitida sobre la arrendadora.`);
    }
    if (operation === "update" && current.data && typeof current.data === "object") {
      // Plan, estado y slug los administra la plataforma, no la arrendadora.
      for (const field of ["id", "slug", "plan", "status"]) {
        if (field in current.data) {
          throw new ScopeError(`El campo ${field} no se puede cambiar desde la arrendadora.`);
        }
      }
    }
    return { ...current, where: { ...(current.where as object), id: orgId } };
  }

  if (!TENANT_MODELS.has(model as Prisma.ModelName)) {
    throw new ScopeError(`Modelo ${model} no disponible en el cliente con alcance.`);
  }

  if (WHERE_OPERATIONS.has(operation)) {
    return { ...current, where: { ...(current.where as object), organizationId: orgId } };
  }

  if (operation === "create") {
    return { ...current, data: withData(current.data, orgId) };
  }

  if (operation === "createMany" || operation === "createManyAndReturn") {
    const rows = Array.isArray(current.data) ? current.data : [current.data];
    return { ...current, data: rows.map((row) => withData(row, orgId)) };
  }

  if (operation === "upsert") {
    return {
      ...current,
      where: { ...(current.where as object), organizationId: orgId },
      create: withData(current.create, orgId),
    };
  }

  throw new ScopeError(`Operación ${operation} no permitida en el cliente con alcance.`);
}
