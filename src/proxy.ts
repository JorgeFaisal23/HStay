import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/jwt";
import { brandedPublicSlug, loginPathFor, ORG_COOKIE } from "@/lib/auth/paths";
import { canAccessPath, homePathFor } from "@/lib/permissions";

/** Páginas de acceso: públicas, pero quien ya tiene sesión va a su inicio. */
const PUBLIC_PATHS = ["/login", "/recuperar"];

/** Rutas que cualquiera puede abrir, con o sin sesión y sea cual sea su rol. */
const ALWAYS_ALLOWED = ["/salir"];

/** Enlaces de un solo uso que llegan por correo: /restablecer/{token}, /invitacion/{token}. */
const TOKEN_LINK = /^\/(restablecer|invitacion)\/[A-Za-z0-9_-]+$/;

/** /a/{slug} sin más: lleva al acceso de esa arrendadora. */
const ORG_ROOT = /^\/a\/([a-z0-9-]+)\/?$/;

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (ALWAYS_ALLOWED.includes(pathname) || TOKEN_LINK.test(pathname)) {
    return NextResponse.next();
  }

  const orgRoot = ORG_ROOT.exec(pathname);
  if (orgRoot) {
    return NextResponse.redirect(new URL(`/a/${orgRoot[1]}/login`, request.url));
  }

  const session = await verifySession(
    request.cookies.get(SESSION_COOKIE)?.value,
  );

  if (PUBLIC_PATHS.includes(pathname) || brandedPublicSlug(pathname)) {
    // Quien ya inició sesión no necesita ver el login otra vez, salvo
    // que venga redirigido por algún motivo (ej. sesión duplicada/desplazada).
    if (session && !request.nextUrl.searchParams.has("motivo")) {
      return NextResponse.redirect(
        new URL(homePathFor(session.role), request.url),
      );
    }
    return NextResponse.next();
  }

  if (!session) {
    // Sin sesión: al acceso con la marca de la última arrendadora con la que
    // se entró en este navegador, o al genérico.
    const lastOrg = request.cookies.get(ORG_COOKIE)?.value;
    const url = new URL(loginPathFor(lastOrg), request.url);
    if (pathname !== "/") url.searchParams.set("redirigir", pathname);
    return NextResponse.redirect(url);
  }

  if (pathname === "/") {
    return NextResponse.redirect(new URL(homePathFor(session.role), request.url));
  }

  if (!canAccessPath(session.role, pathname)) {
    return NextResponse.redirect(new URL(homePathFor(session.role), request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Todo salvo assets estáticos y la API de autenticación. El manifiesto y los
  // iconos describen el producto y el navegador los pide sin cookies: si
  // pasaran por aquí acabarían redirigidos al login y el icono no cargaría.
  // `icon` es el favicon generado por src/app/icon.tsx (no lleva extensión).
  matcher: [
    "/((?!api|_next/static|_next/image|manifest.webmanifest|icon|apple-icon|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
