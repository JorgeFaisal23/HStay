import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth/session";
import { APP_BRAND, type BrandIdentity } from "@/lib/brand";
import type { Organization } from "@/generated/prisma/client";

/**
 * Arrendadora de la sesión actual, o null si no hay sesión o es el
 * superadministrador. `cache` evita repetir la consulta cuando varios
 * componentes del mismo render la necesitan.
 *
 * Solo verifica la firma del token; la validez de la sesión (cuenta activa,
 * arrendadora no suspendida) la imponen requireUser y requireOrgUser.
 */
export const getCurrentOrg = cache(async (): Promise<Organization | null> => {
  const session = await getSession();
  if (!session?.orgId) return null;
  try {
    return await prisma.organization.findUnique({ where: { id: session.orgId } });
  } catch (error) {
    // El layout raíz pinta la marca desde aquí: si la base no contesta se
    // sirve la marca del producto en vez de tumbar la página entera. Las
    // páginas con datos reales siguen fallando por su cuenta.
    console.error("No se pudo leer la arrendadora:", error);
    return null;
  }
});

/**
 * Para páginas que ya pasaron por requireOrgUser: la arrendadora existe, así
 * que un null aquí solo puede ser una falla de la base y se trata como error.
 */
export async function requireCurrentOrg(): Promise<Organization> {
  const org = await getCurrentOrg();
  if (!org) throw new Error("No se pudo cargar la arrendadora de la sesión.");
  return org;
}

/** Arrendadora por su slug público (acceso con marca). */
export const getOrgBySlug = cache(async (slug: string) =>
  prisma.organization.findUnique({ where: { slug } }),
);

/** Marca a pintar: la de la arrendadora de la sesión o la del producto. */
export async function getCurrentBrand(): Promise<BrandIdentity> {
  const org = await getCurrentOrg();
  return org ?? APP_BRAND;
}

export async function isPremium() {
  const org = await getCurrentOrg();
  return org?.plan === "PREMIUM";
}
