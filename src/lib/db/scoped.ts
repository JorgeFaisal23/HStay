import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { scopeArgs } from "./scope";

/**
 * Cliente de base de datos limitado a una arrendadora.
 *
 * Es la única puerta a los datos de una arrendadora: todas las consultas del
 * panel y del portal pasan por aquí, y la regla de ESLint
 * `no-restricted-imports` impide importar `@/lib/prisma` fuera de los módulos
 * de plataforma. El filtro se impone en cada operación (ver ./scope.ts), así
 * que olvidar un `where` no puede filtrar datos de otra arrendadora.
 *
 * Lo que este cliente NO cubre, y por eso son reglas del proyecto:
 * - Escrituras anidadas (`create: { units: { create: … } }`): no se usan; se
 *   encadenan operaciones dentro de `db.$transaction`.
 * - Llaves foráneas que llegan del cliente (unitId, buildingId…): antes de
 *   escribir se verifica con este mismo cliente que existen en la arrendadora
 *   (ver ./guards.ts). El filtro protege lecturas y actualizaciones, pero un
 *   `create` con el `unitId` de otra arrendadora solo lo detiene esa
 *   verificación.
 * - `$queryRaw` y `$executeRaw`: no se usan con este cliente.
 */
export function createOrgDb(orgId: string) {
  return prisma.$extends({
    name: "org-scope",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          return query(
            scopeArgs(model, operation, args as Record<string, unknown>, orgId) as typeof args,
          );
        },
      },
    },
  });
}

/** Un cliente por arrendadora y por petición. */
export const orgDb = cache(createOrgDb);

export type OrgDb = ReturnType<typeof createOrgDb>;
