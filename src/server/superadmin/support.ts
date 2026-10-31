"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSuperadminAction, requireSupportAction } from "@/lib/auth/session";
import { SUPPORT_REASON_MAX, SUPPORT_REASON_MIN } from "@/lib/support";
import type { ActionResult } from "@/lib/action-result";
import { closeSupportSession, openSupportSession } from "./support-session";

/**
 * Modo soporte: el superadministrador entra al panel de una arrendadora como
 * Administrativo, por tiempo limitado y con un motivo que la arrendadora ve.
 */

const startSchema = z.object({
  orgId: z.string().min(1),
  reason: z
    .string()
    .trim()
    .min(SUPPORT_REASON_MIN, `Explica el motivo en al menos ${SUPPORT_REASON_MIN} caracteres; la arrendadora lo verá.`)
    .max(SUPPORT_REASON_MAX, `El motivo admite hasta ${SUPPORT_REASON_MAX} caracteres.`),
});

/** Abre el modo soporte y lleva al panel de la arrendadora. */
export async function startSupportSession(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireSuperadminAction();

  const parsed = startSchema.safeParse({
    orgId: formData.get("orgId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const org = await prisma.organization.findUnique({
    where: { id: parsed.data.orgId },
    select: { id: true, slug: true, status: true },
  });
  if (!org) return { error: "No se encontró la arrendadora." };
  if (org.status !== "ACTIVE") {
    return { error: "El acceso de esta arrendadora está suspendido. Reactívalo antes de dar soporte." };
  }

  await openSupportSession(session, org, parsed.data.reason);
  revalidatePath(`/superadmin/organizaciones/${org.id}`);
  redirect("/dashboard");
}

/** Termina el modo soporte y regresa a la ficha de la arrendadora. */
export async function endSupportSession(): Promise<void> {
  const session = await requireSupportAction();
  const orgId = session.support.orgId;
  await closeSupportSession(session, "MANUAL");
  revalidatePath(`/superadmin/organizaciones/${orgId}`);
  redirect(`/superadmin/organizaciones/${orgId}`);
}
