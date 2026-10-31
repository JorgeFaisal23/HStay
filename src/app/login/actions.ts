"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  checkSessionProblem,
  destroySession,
  FORCED_PASSWORD_PATH,
  getSession,
  loginPathFor,
} from "@/lib/auth/session";
import { safeRedirect } from "@/lib/redirect";
import { SESSION_USER_SELECT, startSession } from "@/server/auth/sign-in";
import {
  clearFailures,
  clientIp,
  LIMITS,
  lockedUntil,
  minutesUntil,
  registerFailure,
  throttleKey,
} from "@/server/auth/throttle";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Escribe un correo válido."),
  password: z.string().min(1, "Escribe tu contraseña."),
  redirigir: z.string().optional(),
  orgSlug: z.string().optional(),
});

export type LoginState = { error?: string };

const INVALID = "Correo o contraseña incorrectos.";

/**
 * Hash señuelo: cuando el correo no existe se compara contra él, para que la
 * respuesta tarde lo mismo que con una contraseña incorrecta y el tiempo no
 * delate qué correos están registrados.
 */
let dummyHash: string | null = null;
function getDummyHash() {
  dummyHash ??= bcrypt.hashSync(crypto.randomUUID(), 10);
  return dummyHash;
}

export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    redirigir: formData.get("redirigir") || undefined,
    orgSlug: formData.get("orgSlug") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisa los datos." };
  }

  const { email, password, redirigir, orgSlug } = parsed.data;

  // Límite contra fuerza bruta: por cuenta y por IP. Se revisa antes de
  // comparar la contraseña, así un bloqueo no da pistas sobre ella.
  const emailKey = throttleKey("email", email);
  const ipKey = throttleKey("ip", await clientIp());
  const blockedUntil = await lockedUntil([emailKey, ipKey]);
  if (blockedUntil) {
    return {
      error: `Demasiados intentos fallidos. Espera ${minutesUntil(blockedUntil)} min e inténtalo de nuevo.`,
    };
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: SESSION_USER_SELECT,
  });

  const passwordOk = await bcrypt.compare(
    password,
    user?.passwordHash ?? getDummyHash(),
  );

  // Mismo mensaje para usuario inexistente, inactivo, contraseña incorrecta y
  // acceso de otra arrendadora: no vale la pena revelar qué correos existen.
  const wrongOrg = Boolean(orgSlug) && user?.organization?.slug !== orgSlug;
  if (!user || !user.active || !passwordOk || wrongOrg) {
    await Promise.all([
      registerFailure(emailKey, LIMITS.email),
      registerFailure(ipKey, LIMITS.ip),
    ]);
    return { error: INVALID };
  }
  await clearFailures(emailKey);

  // Solo después de comprobar la contraseña se dice que la arrendadora está
  // suspendida: quien la conoce ya demostró que la cuenta es suya.
  if (user.organization && user.organization.status !== "ACTIVE") {
    return {
      error:
        "El acceso de tu arrendadora está suspendido. Contacta al administrador de la plataforma.",
    };
  }

  await startSession(user);

  // Con contraseña temporal lo primero es elegir una propia.
  if (user.mustChangePassword) redirect(FORCED_PASSWORD_PATH);
  redirect(safeRedirect(redirigir, user.role));
}

export async function logout() {
  const session = await getSession();
  if (session) {
    // Solo se borra el registro de sesión si sigue perteneciendo a este
    // dispositivo; si ya entró en otro lado, esa sesión se respeta.
    await prisma.user.updateMany({
      where: {
        id: session.sub,
        currentSessionId: session.sessionId,
      },
      data: { currentSessionId: null },
    });
  }
  await destroySession();
  redirect(loginPathFor(session?.orgSlug));
}

/**
 * Para el monitor de sesión en cliente. Devuelve a dónde mandar al usuario si
 * su sesión ya no vale, o null si sigue activa.
 */
export async function verifySessionLiveness(): Promise<string | null> {
  const session = await getSession();
  const problem = await checkSessionProblem();
  if (!problem) return null;

  const path = loginPathFor(session?.orgSlug);
  return problem === "sin_sesion" ? path : `${path}?motivo=${problem}`;
}
