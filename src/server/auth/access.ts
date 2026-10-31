import "server-only";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { sendMail, isMailConfigured } from "@/lib/mail";
import { linkEmail } from "@/lib/mail-templates";
import { generateTempPassword } from "@/lib/passwords";
import { APP } from "@/lib/app";
import { createAuthToken, TOKEN_TTL_LABEL } from "./tokens";
import { linkBase } from "./links";

/**
 * Cómo recibe su acceso alguien a quien otra persona le creó o le restableció
 * la cuenta (dueño, equipo, inquilino):
 *
 * - Con correo configurado: un enlace de un solo uso para elegir contraseña.
 * - Sin correo (o si el envío falla): una contraseña temporal que se muestra
 *   una vez a quien hizo el alta, para entregarla en persona. Al entrar con
 *   ella se pide cambiarla.
 *
 * En ambos casos la contraseña anterior y la sesión abierta dejan de servir:
 * quien restablece una cuenta suele hacerlo porque algo salió mal con ella.
 *
 * Quien llama ya verificó que el usuario le pertenece (misma arrendadora o
 * superadministrador); aquí no se vuelve a comprobar.
 */

export type AccessDelivery =
  | { method: "email"; email: string }
  | { method: "password"; email: string; tempPassword: string };

/** Hash que no corresponde a ninguna contraseña conocida. */
export async function unusablePasswordHash() {
  return bcrypt.hash(randomBytes(32).toString("base64url"), 10);
}

export async function deliverAccess(
  userId: string,
  purpose: "INVITE" | "RESET",
): Promise<AccessDelivery> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      email: true,
      name: true,
      organization: { select: { brandName: true, primaryColor: true } },
    },
  });

  // Quien llama ya comprobó que hay correo: sin él no hay cómo entrar al
  // portal, ni con enlace ni con contraseña temporal.
  if (!user.email) {
    throw new Error("La cuenta no tiene correo: agrégalo antes de darle acceso.");
  }
  const email = user.email;

  const base = isMailConfigured() ? await linkBase() : null;
  if (base) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: await unusablePasswordHash(),
        mustChangePassword: false,
        currentSessionId: null,
      },
    });
    const raw = await createAuthToken(userId, purpose);
    const path = purpose === "INVITE" ? "invitacion" : "restablecer";
    const message = linkEmail({
      kind: purpose,
      recipientName: user.name,
      brandName: user.organization?.brandName ?? APP.name,
      primaryColor: user.organization?.primaryColor ?? APP.color,
      link: `${base}/${path}/${raw}`,
      expiresIn: TOKEN_TTL_LABEL[purpose],
    });
    const { sent } = await sendMail({ to: email, ...message });
    if (sent) return { method: "email", email };
    // Si el correo no salió, se cae a la contraseña temporal para que nadie
    // se quede sin forma de entrar.
  }

  const tempPassword = generateTempPassword();
  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash: await bcrypt.hash(tempPassword, 10),
      mustChangePassword: true,
      currentSessionId: null,
    },
  });
  return { method: "password", email, tempPassword };
}
