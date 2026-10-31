import type { Role } from "@/lib/auth/jwt";

/**
 * Reglas de acceso en un solo lugar. El proxy las usa para bloquear rutas y la
 * UI para ocultar acciones; ambas leen de aquí para que nunca se contradigan.
 */

/** Rutas del panel administrativo a las que el rol VIEWER (solo lectura) puede entrar. */
export const VIEWER_ALLOWED_PREFIXES = ["/dashboard", "/calendario", "/cuenta"];

/** Vista del personal de operación ("Mis tareas"). Es lo único que ve ese rol. */
export const OPERATIONS_PREFIX = "/operacion";

/** Vista del propietario del inmueble: su estado de cuenta, solo lectura. */
export const PROPERTY_OWNER_PREFIX = "/propietario";

/** Vista de Captura: reservas de las propiedades asignadas. Es lo único que ve ese rol. */
export const CAPTURE_PREFIX = "/captura";

/** Panel de la plataforma: solo para SUPERADMIN. */
export const SUPERADMIN_PREFIX = "/superadmin";

/** `/portal` coincide con `/portal` y `/portal/pagos`, no con `/portales`. */
function under(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isTenant(role: Role) {
  return role === "TENANT";
}

/** Puede modificar datos (altas, ediciones, capturas de montos). */
export function canEdit(role: Role) {
  return role === "OWNER" || role === "ADMIN";
}

/** Solo el arrendador administra la marca y el equipo. */
export function canManageOrganization(role: Role) {
  return role === "OWNER";
}

/** Cambio obligatorio de contraseña: cualquier rol con sesión. */
const ANY_ROLE_PATHS = ["/cambiar-contrasena"];

/** Decide si un rol puede abrir una ruta concreta. */
export function canAccessPath(role: Role, pathname: string) {
  if (ANY_ROLE_PATHS.includes(pathname)) return true;

  // La plataforma y las arrendadoras no se mezclan: el superadministrador no
  // ve datos de ninguna arrendadora y nadie más entra a su panel.
  if (role === "SUPERADMIN") return under(pathname, SUPERADMIN_PREFIX);
  if (under(pathname, SUPERADMIN_PREFIX)) return false;

  if (role === "TENANT") return under(pathname, "/portal");
  if (under(pathname, "/portal")) return false;
  // Operación solo ve sus tareas: nada de cobros, inquilinos ni configuración.
  if (role === "OPERATIONS") return under(pathname, OPERATIONS_PREFIX);
  // El propietario solo ve sus propiedades, y nadie más entra a su vista.
  if (role === "PROPERTY_OWNER") return under(pathname, PROPERTY_OWNER_PREFIX);
  if (under(pathname, PROPERTY_OWNER_PREFIX)) return false;
  // Captura solo ve las reservas de sus propiedades, y nadie más entra a su vista.
  if (role === "CAPTURE") return under(pathname, CAPTURE_PREFIX);
  if (under(pathname, CAPTURE_PREFIX)) return false;
  if (role === "VIEWER") {
    return VIEWER_ALLOWED_PREFIXES.some((prefix) => under(pathname, prefix));
  }
  if (under(pathname, "/configuracion")) return role === "OWNER";
  return true;
}

/**
 * A dónde mandar a cada rol después de iniciar sesión. El equipo que opera
 * (OWNER, ADMIN) entra a "Hoy", lo que necesita atención; el rol de consulta
 * no ve adeudos ni nombres de inquilinos y entra al resumen.
 */
export function homePathFor(role: Role) {
  if (role === "SUPERADMIN") return SUPERADMIN_PREFIX;
  if (role === "TENANT") return "/portal";
  if (role === "OPERATIONS") return OPERATIONS_PREFIX;
  if (role === "PROPERTY_OWNER") return PROPERTY_OWNER_PREFIX;
  if (role === "CAPTURE") return CAPTURE_PREFIX;
  return role === "VIEWER" ? "/dashboard" : "/hoy";
}
