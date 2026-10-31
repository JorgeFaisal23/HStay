import type { BorderRadius } from "@/generated/prisma/enums";
import { APP } from "@/lib/app";

/**
 * Traduce la identidad de marca guardada en la base de datos a variables CSS.
 * Todo el color de la aplicación sale de estos tokens: ningún componente
 * escribe un color a mano, por eso cambiar la marca aquí se propaga a todo,
 * incluido el portal del inquilino y la pantalla de login.
 */

export type BrandInput = {
  primaryColor: string;
  radius: BorderRadius;
  fontFamily: string;
};

export const RADIUS_VALUES: Record<BorderRadius, string> = {
  SHARP: "0.25rem",
  SOFT: "0.625rem",
  ROUND: "1rem",
};

export const RADIUS_LABELS: Record<BorderRadius, string> = {
  SHARP: "Rectos",
  SOFT: "Suaves",
  ROUND: "Redondos",
};

/** Fuentes disponibles; las variables se declaran en el layout raíz. */
export const FONT_OPTIONS = [
  { value: "Inter", label: "Inter", variable: "var(--font-inter)" },
  { value: "Poppins", label: "Poppins", variable: "var(--font-poppins)" },
  { value: "Source Sans 3", label: "Source Sans", variable: "var(--font-source)" },
] as const;

/** Paleta sugerida en el selector de color. */
export const BRAND_PRESETS = [
  "#0F766E",
  "#1D4ED8",
  "#7C3AED",
  "#BE123C",
  "#C2410C",
  "#0E7490",
  "#4D7C0F",
  "#334155",
];

export const DEFAULT_BRAND: BrandInput = {
  primaryColor: "#0F766E",
  radius: "SOFT",
  fontFamily: "Inter",
};

/** Lo que hace falta para vestir una pantalla: tokens + nombre y logo. */
export type BrandIdentity = BrandInput & {
  brandName: string;
  logoUrl: string | null;
};

/**
 * Marca del producto. Se usa donde no hay una arrendadora en contexto: el
 * acceso genérico /login, el panel de plataforma y las páginas de error.
 */
export const APP_BRAND: BrandIdentity = {
  brandName: APP.name,
  logoUrl: null,
  primaryColor: APP.color,
  radius: "SOFT",
  fontFamily: "Inter",
};

// ------------------------------------------------------------------ color

type Rgb = { r: number; g: number; b: number };

export function hexToRgb(hex: string): Rgb {
  const clean = hex.replace("#", "").trim();
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const value = Number.parseInt(full.slice(0, 6), 16);
  if (Number.isNaN(value)) return { r: 15, g: 118, b: 110 };
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function rgbToHex({ r, g, b }: Rgb) {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return `#${[r, g, b].map((n) => clamp(n).toString(16).padStart(2, "0")).join("")}`;
}

/** Mezcla un color hacia blanco (amount > 0) o hacia negro (amount < 0). */
function shift(hex: string, amount: number) {
  const { r, g, b } = hexToRgb(hex);
  const target = amount > 0 ? 255 : 0;
  const ratio = Math.abs(amount);
  return rgbToHex({
    r: r + (target - r) * ratio,
    g: g + (target - g) * ratio,
    b: b + (target - b) * ratio,
  });
}

function relativeLuminance(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [light, dark] = la > lb ? [la, lb] : [lb, la];
  return (light + 0.05) / (dark + 0.05);
}

/**
 * Texto legible sobre el color de marca. Evita que una elección de color
 * produzca un botón ilegible: siempre gana la opción con mayor contraste.
 */
export function readableForeground(hex: string) {
  return contrastRatio(hex, "#ffffff") >= contrastRatio(hex, "#111111")
    ? "#ffffff"
    : "#111111";
}

/**
 * Paleta de gráficas en color concreto, derivada del color de marca.
 *
 * Recharts asigna los colores como atributos de presentación del SVG, y ahí
 * `var(--chart-1)` no se sustituye: hay que pasarle un color real. Por eso las
 * gráficas reciben esta paleta desde el servidor en vez de leer los tokens.
 */
export function chartPalette(primaryColor: string): string[] {
  return [
    primaryColor,
    shift(primaryColor, 0.3),
    shift(primaryColor, 0.55),
    shift(primaryColor, -0.35),
    shift(primaryColor, 0.72),
  ];
}

// ------------------------------------------------------------------ tokens

function fontVariable(fontFamily: string) {
  const found = FONT_OPTIONS.find((f) => f.value === fontFamily);
  return found ? found.variable : FONT_OPTIONS[0].variable;
}

/**
 * Devuelve el CSS que sobreescribe los tokens de shadcn con la marca.
 * Se inyecta en el layout raíz durante el render en servidor, así el color
 * correcto llega en el primer pintado y no hay parpadeo.
 */
export function brandStyleSheet(brand: BrandInput) {
  const primary = brand.primaryColor;
  const foreground = readableForeground(primary);
  const radius = RADIUS_VALUES[brand.radius] ?? RADIUS_VALUES.SOFT;
  const font = fontVariable(brand.fontFamily);

  // Los selectores duplicados (:root:root, html.dark) elevan la especificidad
  // por encima de globals.css, así los tokens de marca ganan sin depender del
  // orden en que el navegador reciba las hojas de estilo.
  return `
:root:root {
  --primary: ${primary};
  --primary-foreground: ${foreground};
  --ring: ${primary};
  --radius: ${radius};
  --font-sans: ${font};
  --sidebar-primary: ${primary};
  --sidebar-primary-foreground: ${foreground};
  --sidebar-ring: ${primary};
  --brand-soft: color-mix(in oklch, ${primary} 12%, transparent);
  --brand-strong: ${shift(primary, -0.2)};
  --chart-1: ${primary};
  --chart-2: ${shift(primary, 0.3)};
  --chart-3: ${shift(primary, 0.55)};
  --chart-4: ${shift(primary, -0.35)};
  --chart-5: ${shift(primary, 0.72)};
}
html.dark {
  --primary: ${shift(primary, 0.18)};
  --primary-foreground: ${readableForeground(shift(primary, 0.18))};
  --ring: ${shift(primary, 0.18)};
  --sidebar-primary: ${shift(primary, 0.18)};
  --sidebar-primary-foreground: ${readableForeground(shift(primary, 0.18))};
  --brand-soft: color-mix(in oklch, ${shift(primary, 0.18)} 18%, transparent);
  --brand-strong: ${shift(primary, 0.35)};
  --chart-1: ${shift(primary, 0.18)};
  --chart-2: ${shift(primary, 0.4)};
  --chart-3: ${shift(primary, 0.6)};
  --chart-4: ${shift(primary, -0.2)};
  --chart-5: ${shift(primary, 0.75)};
}`.trim();
}
