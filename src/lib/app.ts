/**
 * Identidad del producto.
 *
 * El producto es el software. Es distinto de la marca que cada arrendadora
 * configura en /configuracion/marca: esa viste la interfaz (nombre, logo,
 * color) y cambia por cliente; esta es la misma para todos y ningún formulario
 * la edita.
 *
 * El producto se llama HStay. Aun así todo sale de variables de entorno con
 * ese valor por defecto: para renombrarlo basta con definir
 * NEXT_PUBLIC_APP_NAME (y, si se quiere, las demás) y volver a compilar, porque
 * las variables NEXT_PUBLIC_ se incrustan en el build. El logo es la "H" de
 * dos píldoras unidas por una cinta (AppMark) y sus colores están en APP_LOGO;
 * la aurora del fondo usa la misma paleta (DESIGN.md §2 y §16).
 *
 * Regla de uso: lo que el inquilino ve como "quién le cobra" es la marca de la
 * arrendadora; lo que identifica "con qué software se lo cobran" es el
 * producto, y aparece solo en los márgenes (pie de página, metadatos, acerca
 * de) y en el acceso genérico /login.
 */

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function env(value: string | undefined, fallback: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

/**
 * Colores del logo de HStay. Los tokens --aurora-* de globals.css parten de
 * ellos (en oscuro, más apagados para que domine el fondo). Van aquí en hex
 * porque el favicon y los correos no leen CSS.
 */
export const APP_LOGO = {
  violet: "#A63BFF",
  blue: "#1D3BF0",
  cyan: "#2EE6F7",
  magenta: "#F23FD8",
  peach: "#FF9F5A",
  /** Fondo azul noche de la aurora en oscuro. */
  night: "#070915",
} as const;

/** Violeta del logo, oscurecido para que el texto blanco encima pase AA. */
const DEFAULT_COLOR = "#6D28D9";

const color = env(process.env.NEXT_PUBLIC_APP_COLOR, DEFAULT_COLOR);

export const APP = {
  name: env(process.env.NEXT_PUBLIC_APP_NAME, "HStay"),
  tagline: env(process.env.NEXT_PUBLIC_APP_TAGLINE, "Administración de rentas"),
  description:
    "Plataforma para administrar arrendamientos, servicios, cobros y reservas de corta estancia.",
  /**
   * Igual a la de package.json (lo vigila app.test.ts). Va escrita aquí para
   * no meter package.json completo en el código del navegador.
   */
  version: "0.15.0",
  /** Sitio público del producto. Vacío mientras no exista. */
  url: env(process.env.NEXT_PUBLIC_APP_URL, ""),
  /**
   * Color propio del producto. No sale de los tokens de marca a propósito: el
   * distintivo del producto debe verse igual aunque la arrendadora elija
   * cualquier color primario.
   */
  color: HEX_COLOR.test(color) ? color : DEFAULT_COLOR,
} as const;

/** Inicial que usa el distintivo cuando no hay logo propio del producto. */
export const APP_INITIAL = APP.name.charAt(0).toUpperCase();

/** Texto corto para pies de página y menús: "HStay 0.10.0". */
export const APP_VERSION_LABEL = `${APP.name} ${APP.version}`;
