/**
 * Intensidad de la aurora del fondo (DESIGN.md §16). Cada persona la elige
 * en su menú y se guarda en su navegador, como el tema claro/oscuro.
 *
 * El valor vive en el atributo `data-aurora` de <html>; globals.css lo traduce
 * a un multiplicador de intensidad (o apaga las olas). AURORA_INIT_SCRIPT lo
 * pone antes del primer pintado para que no haya parpadeo al cargar.
 */

export const AURORA_LEVELS = [
  { value: "off", label: "Apagada" },
  { value: "soft", label: "Tenue" },
  { value: "normal", label: "Normal" },
  { value: "vivid", label: "Viva" },
] as const;

export type AuroraLevel = (typeof AURORA_LEVELS)[number]["value"];

export const AURORA_DEFAULT: AuroraLevel = "normal";
export const AURORA_STORAGE_KEY = "aurora";

const VALUES = AURORA_LEVELS.map((l) => l.value) as readonly string[];

export function isAuroraLevel(value: unknown): value is AuroraLevel {
  return typeof value === "string" && VALUES.includes(value);
}

/** Se inyecta tal cual en el layout raíz; no depende de nada más. */
export const AURORA_INIT_SCRIPT = `try{var a=localStorage.getItem(${JSON.stringify(
  AURORA_STORAGE_KEY,
)});if(${JSON.stringify(VALUES)}.indexOf(a)>-1)document.documentElement.dataset.aurora=a}catch(e){}`;
