/**
 * Slugs de arrendadora: el identificador público en /a/{slug}/login.
 *
 * Minúsculas, números y guiones sueltos; de 3 a 40 caracteres; sin guion al
 * principio ni al final. Es el mismo formato que genera la migración
 * multi-arrendador para las organizaciones que ya existían.
 */

export const SLUG_PATTERN = /^[a-z0-9](?:-?[a-z0-9]){2,39}$/;

/**
 * Palabras que no pueden ser slug: rutas propias de la app o nombres que se
 * prestan a confusión (alguien con el slug "soporte" podría hacerse pasar por
 * la plataforma).
 */
export const RESERVED_SLUGS = new Set([
  "a",
  "admin",
  "api",
  "app",
  "cuenta",
  "dashboard",
  "login",
  "logout",
  "plataforma",
  "portal",
  "recuperar",
  "salir",
  "soporte",
  "superadmin",
  "support",
  "www",
]);

export function slugError(slug: string): string | null {
  if (!SLUG_PATTERN.test(slug)) {
    return "Usa de 3 a 40 letras minúsculas, números o guiones (sin guion al inicio ni al final).";
  }
  if (RESERVED_SLUGS.has(slug)) return "Ese identificador está reservado. Elige otro.";
  return null;
}

/** Propuesta de slug a partir de un nombre: "Rentas del Valle" → "rentas-del-valle". */
export function slugify(name: string) {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita acentos: "Peña" → "Pena"
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}
