"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { homePathFor } from "@/lib/permissions";
import { loginPathFor } from "@/lib/auth/paths";
import { passwordPairSchema } from "@/lib/password-policy";
import { sendMail } from "@/lib/mail";
import { linkEmail } from "@/lib/mail-templates";
import { APP } from "@/lib/app";
import { canEmailLinks, linkBase } from "./links";
import { consumeAuthToken, createAuthToken, TOKEN_TTL_LABEL } from "./tokens";
import { SESSION_USER_SELECT, loginEmail, startSession } from "./sign-in";
import { clearFailures, LIMITS, lockedUntil, registerFailure, throttleKey } from "./throttle";

/**
 * Acciones públicas (sin sesión): "olvidé mi contraseña" y completar un enlace
 * de un solo uso. Son las únicas server actions que no exigen sesión; la
 * prueba de arquitectura las lista por nombre.
 */

export type RecoverState = {
  /** Se procesó la solicitud (haya o no cuenta con ese correo). */
  sent?: boolean;
  /** Sin correo configurado: el restablecimiento lo hace un administrador. */
  manual?: boolean;
  error?: string;
};

const recoverSchema = z.object({
  email: z.string().trim().toLowerCase().email("Escribe un correo válido."),
  orgSlug: z.string().optional(),
});

/**
 * Siempre responde lo mismo, exista o no la cuenta, y el correo se manda
 * después de responder (`after`): ni el mensaje ni el tiempo de respuesta
 * dicen si el correo está registrado.
 *
 * No toca la contraseña actual: si alguien pide restablecer la cuenta de otro,
 * el dueño de la cuenta recibe un correo que puede ignorar y sigue entrando.
 */
export async function requestPasswordReset(
  _prev: RecoverState,
  formData: FormData,
): Promise<RecoverState> {
  const parsed = recoverSchema.safeParse({
    email: formData.get("email"),
    orgSlug: formData.get("orgSlug") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisa el correo." };
  }
  if (!(await canEmailLinks())) return { manual: true };

  const { email, orgSlug } = parsed.data;
  const key = throttleKey("reset", email);
  const base = await linkBase();

  after(async () => {
    // Pocas solicitudes por correo y ventana: evita usar la app para llenar
    // de mensajes el buzón de alguien.
    if (await lockedUntil([key])) return;
    await registerFailure(key, LIMITS.reset);

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        name: true,
        email: true,
        active: true,
        organization: {
          select: { slug: true, status: true, brandName: true, primaryColor: true },
        },
      },
    });
    if (!user || !user.active || !base) return;
    if (orgSlug && user.organization?.slug !== orgSlug) return;
    if (user.organization && user.organization.status !== "ACTIVE") return;

    const raw = await createAuthToken(user.id, "RESET");
    await sendMail({
      to: loginEmail(user),
      ...linkEmail({
        kind: "RESET",
        recipientName: user.name,
        brandName: user.organization?.brandName ?? APP.name,
        primaryColor: user.organization?.primaryColor ?? APP.color,
        link: `${base}/restablecer/${raw}`,
        expiresIn: TOKEN_TTL_LABEL.RESET,
      }),
    });
  });

  return { sent: true };
}

export type LinkState = { error?: string };

const linkSchema = z.object({
  token: z.string().min(1),
  purpose: z.enum(["RESET", "INVITE"]),
});

/**
 * Elige la contraseña desde un enlace de invitación o de restablecimiento.
 * El enlace se gasta en la misma operación que lo valida: no sirve dos veces.
 * Al terminar, la persona queda dentro.
 */
export async function completePasswordLink(
  _prev: LinkState,
  formData: FormData,
): Promise<LinkState> {
  const link = linkSchema.safeParse({
    token: formData.get("token"),
    purpose: formData.get("purpose"),
  });
  const pair = passwordPairSchema.safeParse({
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!link.success) return { error: "El enlace no es válido." };
  if (!pair.success) {
    return { error: pair.error.issues[0]?.message ?? "Revisa la contraseña." };
  }

  const userId = await consumeAuthToken(link.data.token, link.data.purpose);
  if (!userId) {
    return { error: "Este enlace ya se usó o venció. Pide uno nuevo." };
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash: await bcrypt.hash(pair.data.password, 10),
      mustChangePassword: false,
      passwordChangedAt: new Date(),
    },
    select: SESSION_USER_SELECT,
  });
  await clearFailures(throttleKey("email", loginEmail(user)));

  if (!user.active || (user.organization && user.organization.status !== "ACTIVE")) {
    redirect(loginPathFor(user.organization?.slug));
  }

  await startSession(user);
  redirect(homePathFor(user.role));
}
