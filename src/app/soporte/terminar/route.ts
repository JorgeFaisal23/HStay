import { NextResponse, type NextRequest } from "next/server";
import { supportExpired } from "@/lib/auth/jwt";
import { findSessionProblem, getSession } from "@/lib/auth/session";
import { homePathFor } from "@/lib/permissions";
import { closeSupportSession } from "@/server/superadmin/support-session";

/**
 * Cierre de un modo soporte que ya no vale (venció, la arrendadora se
 * suspendió o se cerró en otro dispositivo). Las páginas no pueden escribir
 * cookies al renderizar, así que el proxy y `requireUser` redirigen aquí.
 *
 * La sesión del superadministrador sigue abierta: solo pierde el soporte y
 * vuelve a la ficha de la arrendadora.
 */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.redirect(new URL("/login", request.url));

  const problem = await findSessionProblem(session);
  if (problem) {
    return NextResponse.redirect(new URL(`/salir?motivo=${problem}`, request.url));
  }

  const { support } = session;
  if (!support) {
    return NextResponse.redirect(new URL(homePathFor(session.role), request.url));
  }

  await closeSupportSession({ ...session, support }, supportExpired(support) ? "EXPIRED" : "MANUAL");
  const url = new URL(`/superadmin/organizaciones/${support.orgId}`, request.url);
  url.searchParams.set("soporte", "terminado");
  return NextResponse.redirect(url);
}
