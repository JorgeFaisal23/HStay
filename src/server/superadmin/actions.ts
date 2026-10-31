"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSuperadminAction } from "@/lib/auth/session";
import { isEmailInUse } from "@/lib/db/accounts";
import { slugError } from "@/lib/slug";
import { userQuotaError } from "@/lib/plans";
import { deliverAccess, unusablePasswordHash, type AccessDelivery } from "@/server/auth/access";
import { clearFailures, throttleKey } from "@/server/auth/throttle";
import type { ActionResult } from "@/lib/action-result";

/**
 * Acciones de la plataforma: alta y administración de arrendadoras. Solo el
 * superadministrador. Usan el cliente sin alcance porque trabajan sobre
 * arrendadoras distintas, pero nunca tocan sus datos de operación (propiedades,
 * contratos, cobros): solo la fila de la organización y las cuentas de sus
 * usuarios (soporte: acceso, sesión y bloqueos).
 *
 * Cada movimiento queda en la bitácora de la arrendadora afectada, con el
 * superadministrador que actuó, así su dueño ve qué cambió la plataforma.
 */

async function logPlatformAction(entry: {
  organizationId: string;
  userId: string;
  action: string;
  detail?: string;
  /** Por defecto, la propia arrendadora. */
  entity?: "Organization" | "User";
  entityId?: string;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        organizationId: entry.organizationId,
        userId: entry.userId,
        action: entry.action,
        entity: entry.entity ?? "Organization",
        entityId: entry.entityId ?? entry.organizationId,
        detail: entry.detail,
      },
    });
  } catch (error) {
    console.error("No se pudo registrar en la bitácora:", error);
  }
}

function refresh(orgId?: string) {
  revalidatePath("/superadmin");
  revalidatePath("/superadmin/usuarios");
  if (orgId) revalidatePath(`/superadmin/organizaciones/${orgId}`);
}

// ------------------------------------------------------------------ alta

const organizationSchema = z.object({
  name: z.string().trim().min(2, "Escribe el nombre de la arrendadora.").max(80),
  slug: z.string().trim().toLowerCase(),
});

const MAX_USERS = 10_000;

/** Usuarios contratados: al menos 1, porque el dueño ocupa un lugar. */
const maxUsersSchema = z.coerce
  .number({ error: "Escribe cuántos usuarios contrató." })
  .int("Los usuarios contratados deben ser un número entero.")
  .min(1, "Contrata al menos 1 usuario: el dueño ocupa un lugar.")
  .max(MAX_USERS, `El máximo es ${MAX_USERS.toLocaleString("es-MX")} usuarios.`);

const createSchema = organizationSchema.extend({
  plan: z.enum(["FREE", "PREMIUM"]),
  maxUsers: maxUsersSchema,
  ownerName: z.string().trim().min(3, "Escribe el nombre completo del dueño.").max(80),
  ownerEmail: z.string().trim().toLowerCase().email("Escribe un correo válido para el dueño."),
});

export type CreateOrganizationResult = ActionResult & {
  orgId?: string;
  slug?: string;
  /** Cómo recibió el dueño su acceso (enlace por correo o contraseña temporal). */
  delivery?: AccessDelivery;
};

/** Crea una arrendadora con su dueño y le da acceso. */
export async function createOrganization(
  _prev: CreateOrganizationResult,
  formData: FormData,
): Promise<CreateOrganizationResult> {
  const session = await requireSuperadminAction();

  const parsed = createSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    plan: formData.get("plan"),
    maxUsers: formData.get("maxUsers"),
    ownerName: formData.get("ownerName"),
    ownerEmail: formData.get("ownerEmail"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisa los datos." };
  }
  const data = parsed.data;

  const invalidSlug = slugError(data.slug);
  if (invalidSlug) return { error: invalidSlug };

  const [slugTaken, emailTaken] = await Promise.all([
    prisma.organization.findUnique({ where: { slug: data.slug }, select: { id: true } }),
    isEmailInUse(data.ownerEmail),
  ]);
  if (slugTaken) return { error: "Ese identificador ya lo usa otra arrendadora." };
  if (emailTaken) return { error: "El correo del dueño ya está registrado en la plataforma." };

  const passwordHash = await unusablePasswordHash();

  const { org, ownerId } = await prisma.$transaction(async (tx) => {
    const created = await tx.organization.create({
      data: {
        slug: data.slug,
        name: data.name,
        brandName: data.name,
        plan: data.plan,
        maxUsers: data.maxUsers,
      },
    });
    const owner = await tx.user.create({
      data: {
        organizationId: created.id,
        email: data.ownerEmail,
        name: data.ownerName,
        role: "OWNER",
        passwordHash,
      },
    });
    return { org: created, ownerId: owner.id };
  });

  const delivery = await deliverAccess(ownerId, "INVITE");

  await logPlatformAction({
    organizationId: org.id,
    userId: session.sub,
    action: "Alta de la arrendadora en la plataforma",
    detail: `${data.name} · plan ${data.plan} · ${data.maxUsers} usuarios contratados`,
  });

  refresh();
  return { ok: true, orgId: org.id, slug: org.slug, delivery };
}

// ------------------------------------------------------------------ edición

/** Nombre interno y slug. Cambiar el slug cambia la URL de su acceso con marca. */
export async function updateOrganization(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireSuperadminAction();
  const orgId = String(formData.get("orgId") ?? "");

  const parsed = organizationSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisa los datos." };
  }
  const invalidSlug = slugError(parsed.data.slug);
  if (invalidSlug) return { error: invalidSlug };

  const [org, clash] = await Promise.all([
    prisma.organization.findUnique({ where: { id: orgId }, select: { slug: true } }),
    prisma.organization.findFirst({
      where: { slug: parsed.data.slug, NOT: { id: orgId } },
      select: { id: true },
    }),
  ]);
  if (!org) return { error: "No se encontró la arrendadora." };
  if (clash) return { error: "Ese identificador ya lo usa otra arrendadora." };

  await prisma.organization.update({
    where: { id: orgId },
    data: { name: parsed.data.name, slug: parsed.data.slug },
  });

  await logPlatformAction({
    organizationId: orgId,
    userId: session.sub,
    action: "Edición de datos de la arrendadora",
    detail:
      org.slug === parsed.data.slug
        ? parsed.data.name
        : `${parsed.data.name} · acceso /a/${org.slug} → /a/${parsed.data.slug}`,
  });

  refresh(orgId);
  return { ok: true };
}

const planSchema = z.enum(["FREE", "PREMIUM"]);

export async function setOrganizationPlan(
  orgId: string,
  plan: "FREE" | "PREMIUM",
): Promise<ActionResult> {
  const session = await requireSuperadminAction();
  if (!planSchema.safeParse(plan).success) return { error: "Plan no válido." };

  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { id: true } });
  if (!org) return { error: "No se encontró la arrendadora." };

  await prisma.organization.update({ where: { id: orgId }, data: { plan } });
  await logPlatformAction({
    organizationId: orgId,
    userId: session.sub,
    action: "Cambio de plan",
    detail: plan === "PREMIUM" ? "Premium" : "Gratuito",
  });

  refresh(orgId);
  return { ok: true };
}

/**
 * Suspende o reactiva el acceso de una arrendadora. Suspender cierra en el
 * acto las sesiones de todos sus usuarios (dueño, equipo e inquilinos); sus
 * datos se conservan intactos.
 */
export async function setOrganizationStatus(
  orgId: string,
  status: "ACTIVE" | "SUSPENDED",
): Promise<ActionResult> {
  const session = await requireSuperadminAction();
  if (status !== "ACTIVE" && status !== "SUSPENDED") return { error: "Estado no válido." };

  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { id: true } });
  if (!org) return { error: "No se encontró la arrendadora." };

  await prisma.$transaction(async (tx) => {
    await tx.organization.update({ where: { id: orgId }, data: { status } });
    if (status === "SUSPENDED") {
      await tx.user.updateMany({
        where: { organizationId: orgId },
        data: { currentSessionId: null },
      });
    }
  });

  await logPlatformAction({
    organizationId: orgId,
    userId: session.sub,
    action: status === "SUSPENDED" ? "Suspensión del acceso" : "Reactivación del acceso",
  });

  refresh(orgId);
  return { ok: true };
}

// ------------------------------------------------------------------ usuarios contratados

/**
 * Usuarios contratados de una arrendadora (cuentas activas: dueño, equipo e
 * inquilinos). Bajarlo por debajo de los activos no desactiva a nadie: solo
 * impide dar de alta o reactivar hasta quedar dentro.
 */
export async function setUserQuota(orgId: string, value: number): Promise<ActionResult> {
  const session = await requireSuperadminAction();
  const parsed = maxUsersSchema.safeParse(value);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Número no válido." };

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { maxUsers: true },
  });
  if (!org) return { error: "No se encontró la arrendadora." };
  if (org.maxUsers === parsed.data) return { ok: true };

  await prisma.organization.update({ where: { id: orgId }, data: { maxUsers: parsed.data } });
  await logPlatformAction({
    organizationId: orgId,
    userId: session.sub,
    action: "Plataforma: cambio de usuarios contratados",
    detail: `${org.maxUsers} → ${parsed.data}`,
  });

  refresh(orgId);
  return { ok: true };
}

// ------------------------------------------------------------------ soporte de cuentas

/** Cuenta de una arrendadora (dueño, equipo o inquilino); nunca otro superadmin. */
async function findSupportTarget(userId: string) {
  const user = await prisma.user.findFirst({
    where: { id: userId, role: { not: "SUPERADMIN" }, organizationId: { not: null } },
    select: { id: true, name: true, email: true, role: true, active: true, organizationId: true },
  });
  return user?.organizationId ? { ...user, organizationId: user.organizationId } : null;
}

type SupportTarget = NonNullable<Awaited<ReturnType<typeof findSupportTarget>>>;

const NOT_FOUND = { error: "No se encontró esa cuenta." };

function logSupport(target: SupportTarget, superadminId: string, action: string) {
  return logPlatformAction({
    organizationId: target.organizationId,
    userId: superadminId,
    action: `Plataforma: ${action}`,
    detail: `Soporte de plataforma · ${target.email ?? `${target.name} (sin correo)`} · ${target.role}`,
    entity: "User",
    entityId: target.id,
  });
}

/**
 * Nuevo acceso para cualquier cuenta de una arrendadora que lo perdió: enlace
 * por correo o, sin correo configurado, contraseña temporal. Cierra su sesión.
 */
export async function supportResetAccess(
  userId: string,
): Promise<ActionResult & { delivery?: AccessDelivery }> {
  const session = await requireSuperadminAction();
  const target = await findSupportTarget(userId);
  if (!target) return NOT_FOUND;
  if (!target.active) return { error: "Reactiva la cuenta antes de darle acceso." };
  if (!target.email) {
    return { error: "Esta cuenta no tiene correo. La arrendadora debe agregarlo antes de darle acceso." };
  }

  const delivery = await deliverAccess(target.id, "RESET");
  await logSupport(target, session.sub, "restablecimiento de acceso");

  refresh(target.organizationId);
  return { ok: true, delivery };
}

/**
 * Desactivar corta el acceso de inmediato (cierra su sesión) sin borrar su
 * historial y libera su usuario contratado; aplica también al dueño. Reactivar
 * ocupa un usuario contratado, sea cual sea su rol.
 */
export async function supportSetUserActive(userId: string, active: boolean): Promise<ActionResult> {
  const session = await requireSuperadminAction();
  const target = await findSupportTarget(userId);
  if (!target) return NOT_FOUND;
  if (target.active === active) return { ok: true };

  if (active) {
    const [org, current] = await Promise.all([
      prisma.organization.findUniqueOrThrow({
        where: { id: target.organizationId },
        select: { maxUsers: true },
      }),
      prisma.user.count({ where: { organizationId: target.organizationId, active: true } }),
    ]);
    if (userQuotaError(current, org.maxUsers)) {
      return {
        error: `La arrendadora ya ocupa sus ${org.maxUsers} usuarios contratados. Amplíalos antes de reactivar.`,
      };
    }
  }

  await prisma.user.update({
    where: { id: target.id },
    data: active ? { active: true } : { active: false, currentSessionId: null },
  });
  await logSupport(
    target,
    session.sub,
    active ? "reactivación de usuario" : "desactivación de usuario",
  );

  refresh(target.organizationId);
  return { ok: true };
}

/** Cierra la sesión abierta de la cuenta; puede volver a entrar con su contraseña. */
export async function supportForceLogout(userId: string): Promise<ActionResult> {
  const session = await requireSuperadminAction();
  const target = await findSupportTarget(userId);
  if (!target) return NOT_FOUND;

  await prisma.user.update({ where: { id: target.id }, data: { currentSessionId: null } });
  await logSupport(target, session.sub, "cierre de sesión forzado");

  refresh(target.organizationId);
  return { ok: true };
}

/**
 * Quita el bloqueo por intentos fallidos de la cuenta (acceso y "olvidé mi
 * contraseña"). Los bloqueos por IP no son de una cuenta y no se tocan.
 */
export async function supportUnlockLogin(userId: string): Promise<ActionResult> {
  const session = await requireSuperadminAction();
  const target = await findSupportTarget(userId);
  if (!target) return NOT_FOUND;
  // Los bloqueos se llevan por correo: una cuenta sin correo no puede tenerlos.
  if (!target.email) return { ok: true };

  await Promise.all([
    clearFailures(throttleKey("email", target.email)),
    clearFailures(throttleKey("reset", target.email)),
  ]);
  await logSupport(target, session.sub, "desbloqueo de intentos de acceso");

  refresh(target.organizationId);
  return { ok: true };
}
