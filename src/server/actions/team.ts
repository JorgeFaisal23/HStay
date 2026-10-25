"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrgUserAction } from "@/lib/auth/session";
import { isEmailInUse } from "@/lib/db/accounts";
import type { OrgDb } from "@/lib/db/scoped";
import { userQuotaErrorFor } from "@/server/user-quota";
import { deliverAccess, unusablePasswordHash, type AccessDelivery } from "@/server/auth/access";
import { logAction } from "@/server/actions/audit";
import type { ActionResult } from "@/lib/action-result";

/**
 * Equipo de la arrendadora: personal administrativo (ADMIN) y de consulta
 * (VIEWER). Solo el dueño lo administra. El dueño no se edita desde aquí: su
 * cuenta la atiende la plataforma.
 */

export type AccessResult = ActionResult & { delivery?: AccessDelivery };

export type StaffRole = "ADMIN" | "VIEWER" | "OPERATIONS";
const STAFF_ROLES = ["ADMIN", "VIEWER", "OPERATIONS"] as const satisfies readonly StaffRole[];
const staffRole = z.enum(STAFF_ROLES);

/** Un miembro del equipo de esta arrendadora (nunca el dueño ni un inquilino). */
async function findStaff(db: OrgDb, userId: string) {
  return db.user.findFirst({
    where: { id: userId, role: { in: [...STAFF_ROLES] } },
    select: { id: true, name: true, email: true, role: true, active: true },
  });
}

function refresh() {
  revalidatePath("/equipo");
}

const inviteSchema = z.object({
  name: z.string().trim().min(3, "Escribe el nombre completo.").max(80),
  email: z.string().trim().toLowerCase().email("Escribe un correo válido."),
  role: staffRole,
});

export async function inviteStaff(_prev: AccessResult, formData: FormData): Promise<AccessResult> {
  const { session, orgId, db } = await requireOrgUserAction(["OWNER"]);

  const parsed = inviteSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    role: formData.get("role"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisa los datos." };
  }

  const overLimit = await userQuotaErrorFor(db);
  if (overLimit) return { error: overLimit };
  if (await isEmailInUse(parsed.data.email)) {
    return { error: "Ese correo ya está registrado. Usa otro." };
  }

  const user = await db.user.create({
    data: {
      organizationId: orgId,
      name: parsed.data.name,
      email: parsed.data.email,
      role: parsed.data.role,
      passwordHash: await unusablePasswordHash(),
    },
  });
  const delivery = await deliverAccess(user.id, "INVITE");

  await logAction(db, session.sub, "Alta de usuario del equipo", "User", user.id, `${user.name} · ${user.role}`);
  refresh();
  return { ok: true, delivery };
}

export async function changeStaffRole(userId: string, role: StaffRole): Promise<ActionResult> {
  const { session, db } = await requireOrgUserAction(["OWNER"]);
  if (!staffRole.safeParse(role).success) return { error: "Rol no válido." };

  const member = await findStaff(db, userId);
  if (!member) return { error: "No se encontró a esa persona en tu equipo." };

  await db.user.update({ where: { id: member.id }, data: { role } });
  await logAction(db, session.sub, "Cambio de rol", "User", member.id, `${member.name} · ${role}`);
  refresh();
  return { ok: true };
}

/**
 * Desactivar corta el acceso de inmediato (cierra su sesión) sin borrar su
 * historial. Reactivar ocupa un usuario contratado.
 */
export async function setStaffActive(userId: string, active: boolean): Promise<ActionResult> {
  const { session, db } = await requireOrgUserAction(["OWNER"]);

  const member = await findStaff(db, userId);
  if (!member) return { error: "No se encontró a esa persona en tu equipo." };
  if (member.active === active) return { ok: true };

  if (active) {
    const overLimit = await userQuotaErrorFor(db);
    if (overLimit) return { error: overLimit };
  }

  await db.user.update({
    where: { id: member.id },
    data: active ? { active: true } : { active: false, currentSessionId: null },
  });
  await logAction(
    db,
    session.sub,
    active ? "Reactivación de usuario" : "Desactivación de usuario",
    "User",
    member.id,
    member.name,
  );
  refresh();
  return { ok: true };
}

/** Nuevo acceso para alguien del equipo que perdió su contraseña. */
export async function resetStaffAccess(userId: string): Promise<AccessResult> {
  const { session, db } = await requireOrgUserAction(["OWNER"]);

  const member = await findStaff(db, userId);
  if (!member) return { error: "No se encontró a esa persona en tu equipo." };
  if (!member.active) return { error: "Reactiva la cuenta antes de darle acceso." };

  const delivery = await deliverAccess(member.id, "RESET");
  await logAction(db, session.sub, "Restablecimiento de acceso", "User", member.id, member.name);
  refresh();
  return { ok: true, delivery };
}
