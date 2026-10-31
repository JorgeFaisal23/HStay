import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Consultas de cuentas que cruzan arrendadoras a propósito.
 *
 * El correo es único en toda la plataforma (el acceso genérico /login debe
 * saber de quién es cada uno), así que comprobar si está libre no se puede
 * hacer con el cliente con alcance: solo vería la propia arrendadora y el
 * alta fallaría después contra el índice único.
 *
 * Solo devuelve sí/no; nunca datos de la otra cuenta.
 */
export async function isEmailInUse(email: string, exceptUserId?: string) {
  const user = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { id: true },
  });
  return user !== null && user.id !== exceptUserId;
}
