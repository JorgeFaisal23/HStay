import type { Role } from "@/lib/auth/jwt";
import { canAccessPath, homePathFor } from "@/lib/permissions";

/**
 * Destino seguro después de iniciar sesión.
 *
 * `redirigir` llega en la URL y lo controla quien manda el enlace, así que solo
 * se acepta una ruta interna que el rol pueda abrir. Se rechazan las formas que
 * el navegador interpreta como otro dominio: `//sitio`, `/\sitio` y cualquier
 * URL absoluta.
 */
export function safeRedirect(target: string | undefined | null, role: Role) {
  const home = homePathFor(role);
  if (!target) return home;
  if (!target.startsWith("/")) return home;
  if (target.startsWith("//") || target.startsWith("/\\")) return home;
  // Caracteres de control o barras invertidas en cualquier parte: el navegador
  // los normaliza de formas que no vale la pena adivinar.
  if (/[\\\u0000-\u001f]/.test(target)) return home;

  const pathname = target.split(/[?#]/)[0];
  if (!canAccessPath(role, pathname)) return home;
  return target;
}
