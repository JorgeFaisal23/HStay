import type { Role } from "@/lib/auth/jwt";

/**
 * Cuentas que crea el seed (prisma/seed.ts). La pantalla de acceso las ofrece
 * como atajos solo con DEMO_MODE=true (ver isDemoMode en src/lib/features.ts).
 */

export const DEMO_PASSWORD = "demo1234";

export type DemoAccount = {
  email: string;
  role: Role;
  /** Slug de su arrendadora; null para el superadministrador. */
  orgSlug: string | null;
  orgName: string | null;
};

export const DEMO_ACCOUNTS: DemoAccount[] = [
  { email: "dueno@demo.mx", role: "OWNER", orgSlug: "demo", orgName: "Rentas del Valle" },
  { email: "admin@demo.mx", role: "ADMIN", orgSlug: "demo", orgName: "Rentas del Valle" },
  { email: "consulta@demo.mx", role: "VIEWER", orgSlug: "demo", orgName: "Rentas del Valle" },
  { email: "operacion@demo.mx", role: "OPERATIONS", orgSlug: "demo", orgName: "Rentas del Valle" },
  { email: "inquilino@demo.mx", role: "TENANT", orgSlug: "demo", orgName: "Rentas del Valle" },
  { email: "dueno2@demo.mx", role: "OWNER", orgSlug: "demo2", orgName: "Casa Norte" },
  { email: "inquilino2@demo.mx", role: "TENANT", orgSlug: "demo2", orgName: "Casa Norte" },
  { email: "super@demo.mx", role: "SUPERADMIN", orgSlug: null, orgName: null },
];

/** En el acceso de una arrendadora, solo sus cuentas; en el genérico, todas. */
export function demoAccountsFor(orgSlug: string | null) {
  return orgSlug
    ? DEMO_ACCOUNTS.filter((account) => account.orgSlug === orgSlug)
    : DEMO_ACCOUNTS;
}
