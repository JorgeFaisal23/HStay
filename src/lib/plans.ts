import type { Plan } from "@/generated/prisma/enums";

/**
 * Límites de cada plan. Los mismos números que promete la página /premium.
 * Premium solo amplía propiedades y unidades (y abre reportes); los usuarios
 * no dependen del plan: se contratan aparte (ver `userQuotaError`).
 *
 * Bajar de plan no borra nada: solo impide dar de alta más allá del límite.
 */
export const PLAN_LIMITS: Record<Plan, { buildings: number; units: number }> = {
  FREE: { buildings: 2, units: 20 },
  PREMIUM: { buildings: Infinity, units: Infinity },
};

export type LimitedResource = keyof (typeof PLAN_LIMITS)["FREE"];

const LIMIT_MESSAGES: Record<LimitedResource, (limit: number) => string> = {
  buildings: (n) => `El plan gratuito permite hasta ${n} propiedades. Activa Premium para registrar más.`,
  units: (n) => `El plan gratuito permite hasta ${n} unidades. Activa Premium para registrar más.`,
};

/** Mensaje de error si `current + 1` supera el límite del plan, o null si cabe. */
export function limitError(plan: Plan, resource: LimitedResource, current: number) {
  const limit = PLAN_LIMITS[plan][resource];
  return current + 1 > limit ? LIMIT_MESSAGES[resource](limit) : null;
}

/**
 * Usuarios contratados. El software se cobra por usuario: cada cuenta activa
 * de la arrendadora (dueño, equipo e inquilinos) ocupa un lugar, y solo la
 * plataforma fija cuántos tiene. Las cuentas desactivadas no cuentan.
 *
 * Mensaje de error si dar de alta o reactivar una cuenta más rebasa
 * `maxUsers`, o null si cabe.
 */
export function userQuotaError(activeUsers: number, maxUsers: number) {
  if (activeUsers + 1 <= maxUsers) return null;
  return `Tu arrendadora tiene contratados ${maxUsers} ${maxUsers === 1 ? "usuario" : "usuarios"} y ya ${activeUsers === 1 ? "está ocupado" : "están ocupados"}. Desactiva una cuenta que ya no use o pide a la plataforma más usuarios.`;
}
