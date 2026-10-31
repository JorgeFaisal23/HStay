"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireUserAction } from "@/lib/auth/session";
import { homePathFor } from "@/lib/permissions";
import { passwordPairSchema } from "@/lib/password-policy";
import { SESSION_USER_SELECT, loginEmail, startSession } from "./sign-in";
import { LIMITS, lockedUntil, minutesUntil, registerFailure, throttleKey } from "./throttle";

export type PasswordFormState = { ok?: boolean; error?: string };

/**
 * Cambio de contraseña de quien tiene sesión.
 *
 * - Obligatorio (cuenta con contraseña temporal): no pide la actual, que el
 *   usuario acaba de escribir para entrar. Al terminar, va a su inicio.
 * - Voluntario: pide la actual, para que una sesión olvidada abierta no baste
 *   para quedarse con la cuenta.
 *
 * Al cambiarla se abre una sesión nueva (la anterior, y la de cualquier otro
 * dispositivo, deja de valer) y se anulan los enlaces de correo pendientes.
 */
export async function changePassword(
  _prev: PasswordFormState,
  formData: FormData,
): Promise<PasswordFormState> {
  const session = await requireUserAction(undefined, { allowPendingPasswordChange: true });
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.sub },
    select: SESSION_USER_SELECT,
  });

  const parsed = passwordPairSchema.safeParse({
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisa la contraseña." };
  }

  if (!user.mustChangePassword) {
    // Los intentos con la contraseña actual cuentan contra el mismo límite que
    // el login: con una sesión robada tampoco se puede adivinar.
    const key = throttleKey("email", loginEmail(user));
    const blocked = await lockedUntil([key]);
    if (blocked) {
      return { error: `Demasiados intentos. Espera ${minutesUntil(blocked)} min.` };
    }
    const current = formData.get("current");
    const ok =
      typeof current === "string" && (await bcrypt.compare(current, user.passwordHash));
    if (!ok) {
      await registerFailure(key, LIMITS.email);
      return { error: "Tu contraseña actual no es correcta." };
    }
  }

  if (await bcrypt.compare(parsed.data.password, user.passwordHash)) {
    return { error: "La nueva contraseña debe ser distinta de la actual." };
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await bcrypt.hash(parsed.data.password, 10),
        mustChangePassword: false,
        passwordChangedAt: new Date(),
      },
    }),
    prisma.authToken.deleteMany({ where: { userId: user.id, usedAt: null } }),
  ]);

  await startSession(user);

  if (user.mustChangePassword) redirect(homePathFor(user.role));
  return { ok: true };
}
