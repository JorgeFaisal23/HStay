import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/auth/jwt";
import {
  findSessionProblem,
  getSession,
  loginPathFor,
} from "@/lib/auth/session";
import { homePathFor } from "@/lib/permissions";

/**
 * Cierre de una sesión que ya no vale (duplicada, cuenta inactiva, arrendadora
 * suspendida). Las páginas no pueden borrar cookies al renderizar, así que
 * `requireUser` redirige aquí.
 *
 * Solo borra la cookie si la sesión de verdad está invalidada: un enlace
 * forjado a /salir no puede cerrar la sesión de alguien que sigue activo.
 * El cierre voluntario es la Server Action `logout`.
 */
export async function GET(request: NextRequest) {
  const session = await getSession();
  const problem = session ? await findSessionProblem(session) : null;

  if (session && !problem) {
    return NextResponse.redirect(new URL(homePathFor(session.role), request.url));
  }

  const store = await cookies();
  store.delete(SESSION_COOKIE);

  const url = new URL(loginPathFor(session?.orgSlug), request.url);
  if (problem) url.searchParams.set("motivo", problem);
  return NextResponse.redirect(url);
}
