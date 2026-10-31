import "server-only";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/generated/prisma/enums";
import { throttleKey } from "@/server/auth/throttle";

/**
 * Lecturas del panel de plataforma. Cruzan arrendadoras a propósito, pero solo
 * traen lo necesario para administrarlas: conteos y la identidad de las
 * cuentas (para soporte). Contratos, cobros, montos y los datos personales de
 * los inquilinos (teléfono, identificación, notas) no salen de aquí.
 */

export async function listOrganizations() {
  const orgs = await prisma.organization.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      slug: true,
      name: true,
      brandName: true,
      logoUrl: true,
      plan: true,
      status: true,
      maxUsers: true,
      createdAt: true,
      _count: {
        select: {
          buildings: true,
          units: true,
          leases: { where: { status: "ACTIVE" } },
          users: { where: { active: true } },
        },
      },
    },
  });

  return orgs.map(({ _count, ...org }) => ({
    ...org,
    buildings: _count.buildings,
    units: _count.units,
    activeLeases: _count.leases,
    /** Cuentas activas: ocupan usuarios contratados. */
    activeUsers: _count.users,
  }));
}

export async function getOrganizationDetail(id: string) {
  const org = await prisma.organization.findUnique({
    where: { id },
    select: {
      id: true,
      slug: true,
      name: true,
      brandName: true,
      logoUrl: true,
      plan: true,
      status: true,
      contactEmail: true,
      contactPhone: true,
      maxUsers: true,
      createdAt: true,
      users: {
        where: { role: { in: ["OWNER", "ADMIN", "VIEWER", "OPERATIONS"] } },
        orderBy: [{ role: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          active: true,
          createdAt: true,
          currentSessionId: true,
        },
      },
      _count: {
        select: {
          buildings: true,
          units: true,
          leases: { where: { status: "ACTIVE" } },
          users: { where: { role: "TENANT" } },
        },
      },
    },
  });
  if (!org) return null;

  const activeByRole = await prisma.user.groupBy({
    by: ["role"],
    where: { organizationId: id, active: true },
    _count: { _all: true },
  });
  const activeOf = (roles: string[]) =>
    activeByRole.filter((row) => roles.includes(row.role)).reduce((sum, row) => sum + row._count._all, 0);

  const { _count, users, ...rest } = org;
  const locks = await lockStatus(users.map((u) => u.email));
  return {
    ...rest,
    staff: users.map(({ currentSessionId, ...user }) => ({
      ...user,
      hasSession: currentSessionId !== null,
      lockedUntil: (user.email && locks.get(user.email)) || null,
    })),
    /** Cuentas activas por tipo: cada una ocupa un usuario contratado. */
    activeUsers: {
      total: activeOf(["OWNER", "ADMIN", "VIEWER", "OPERATIONS", "PROPERTY_OWNER", "TENANT"]),
      owner: activeOf(["OWNER"]),
      staff: activeOf(["ADMIN", "VIEWER", "OPERATIONS"]),
      tenants: activeOf(["TENANT"]),
      propertyOwners: activeOf(["PROPERTY_OWNER"]),
    },
    buildings: _count.buildings,
    units: _count.units,
    activeLeases: _count.leases,
    tenants: _count.users,
  };
}

export type OrganizationDetail = NonNullable<Awaited<ReturnType<typeof getOrganizationDetail>>>;

/**
 * Bloqueo vigente por intentos fallidos de cada correo (acceso u "olvidé mi
 * contraseña"): fecha hasta la que dura, por correo.
 */
async function lockStatus(emails: (string | null)[]) {
  const keyToEmail = new Map<string, string>();
  for (const email of emails) {
    if (!email) continue; // inquilino sin correo: no tiene bloqueos
    keyToEmail.set(throttleKey("email", email), email);
    keyToEmail.set(throttleKey("reset", email), email);
  }
  const rows = keyToEmail.size
    ? await prisma.loginThrottle.findMany({
        where: { key: { in: [...keyToEmail.keys()] }, lockedUntil: { gt: new Date() } },
        select: { key: true, lockedUntil: true },
      })
    : [];

  const locks = new Map<string, Date>();
  for (const row of rows) {
    const email = keyToEmail.get(row.key)!;
    const current = locks.get(email);
    if (!current || row.lockedUntil! > current) locks.set(email, row.lockedUntil!);
  }
  return locks;
}

export const SUPPORT_ROLES = ["OWNER", "ADMIN", "VIEWER", "OPERATIONS", "PROPERTY_OWNER", "TENANT"] as const satisfies readonly Role[];
export type SupportRole = (typeof SUPPORT_ROLES)[number];

/**
 * Búsqueda de cuentas de cualquier arrendadora para soporte. Solo identidad y
 * estado de acceso: nunca teléfono, identificación, notas ni nada de su
 * operación. Los superadministradores no aparecen.
 */
export async function searchUsers(filters: { q?: string; role?: SupportRole; orgId?: string }) {
  const q = filters.q?.trim();
  const users = await prisma.user.findMany({
    where: {
      role: filters.role ?? { in: [...SUPPORT_ROLES] },
      organizationId: filters.orgId ?? { not: null },
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ name: "asc" }],
    take: 25,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      mustChangePassword: true,
      createdAt: true,
      currentSessionId: true,
      organization: { select: { id: true, name: true, status: true } },
    },
  });

  const locks = await lockStatus(users.map((u) => u.email));
  return users.map(({ currentSessionId, organization, ...user }) => ({
    ...user,
    organization: organization!,
    hasSession: currentSessionId !== null,
    lockedUntil: (user.email && locks.get(user.email)) || null,
  }));
}

export type SupportUser = Awaited<ReturnType<typeof searchUsers>>[number];

/** Arrendadoras para el filtro de la búsqueda de cuentas. */
export async function listOrganizationNames() {
  return prisma.organization.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}
