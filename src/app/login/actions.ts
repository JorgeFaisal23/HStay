"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createSession, destroySession } from "@/lib/auth/session";
import { homePathFor } from "@/lib/permissions";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Escribe un correo válido."),
  password: z.string().min(1, "Escribe tu contraseña."),
  redirigir: z.string().optional(),
});

export type LoginState = { error?: string };

export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    redirigir: formData.get("redirigir") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisa los datos." };
  }

  const { email, password, redirigir } = parsed.data;
  let user;
  try {
    user = await prisma.user.findUnique({ where: { email } });
  } catch (err) {
    console.error("Error al consultar la base de datos en login:", err);
    return {
      error:
        "No se pudo conectar a la base de datos. Verifica que la variable DATABASE_URL esté configurada en el archivo .env.",
    };
  }

  // Mismo mensaje para usuario inexistente y contraseña incorrecta: no vale la
  // pena revelar cuáles correos existen.
  if (!user || !user.active || !bcrypt.compareSync(password, user.passwordHash)) {
    return { error: "Correo o contraseña incorrectos." };
  }

  let organizationId = user.organizationId;
  if (!organizationId) {
    const defaultOrg = await prisma.organization.findFirst({
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (defaultOrg) {
      organizationId = defaultOrg.id;
      await prisma.user.update({
        where: { id: user.id },
        data: { organizationId: defaultOrg.id },
      });
    }
  }

  await createSession({
    sub: user.id,
    email: user.email ?? email,
    name: user.name,
    role: user.role,
    organizationId,
  });

  const destination =
    redirigir && redirigir.startsWith("/") ? redirigir : homePathFor(user.role);

  redirect(destination);
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
