import { SLUG_PATTERN } from "@/lib/slug";

/**
 * Rutas de acceso. Módulo puro: lo usan el proxy y el servidor.
 *
 * Cada arrendadora tiene su acceso con marca en /a/{slug}/login; /login es el
 * acceso genérico con la marca del producto (sirve para cualquiera y es el del
 * superadministrador).
 */

/**
 * Última arrendadora con la que se entró en este navegador. Solo sirve para
 * mandar al acceso con su marca a quien llega sin sesión; no da ningún
 * permiso, así que no importa que alguien la cambie.
 */
export const ORG_COOKIE = "app_org";
export const ORG_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** /a/{slug}/login y, más adelante, /a/{slug}/recuperar. */
const BRANDED_PUBLIC = /^\/a\/([a-z0-9-]+)\/(login|recuperar)$/;

export function loginPathFor(orgSlug: string | null | undefined) {
  return orgSlug && SLUG_PATTERN.test(orgSlug) ? `/a/${orgSlug}/login` : "/login";
}

/** Slug de la URL si es una página pública con marca, si no null. */
export function brandedPublicSlug(pathname: string) {
  return BRANDED_PUBLIC.exec(pathname)?.[1] ?? null;
}
