import { useId } from "react";
import { APP, APP_LOGO } from "@/lib/app";
import { cn } from "@/lib/utils";

/**
 * Trazos de la "H" del logo de HStay en una caja de 32×32: dos píldoras
 * verticales unidas por una cinta en "S" que baja de la izquierda y termina
 * como el pie de la píldora derecha. Los comparte el favicon (icon.tsx).
 */
export const APP_MARK_SHAPES = {
  leftPill: { x: 4, y: 3, width: 9, height: 26, rx: 4.5 },
  rightPill: { x: 19, y: 3, width: 9, height: 26, rx: 4.5 },
  ribbon: "M8.5,10 C9.5,17 14,16.5 17,16.5 C21,16.5 23.5,19 23.5,24.5",
  ribbonWidth: 8.2,
} as const;

/**
 * Distintivo del producto: la "H" del logo de HStay.
 *
 * No usa los tokens de marca: los colores salen de APP_LOGO (o del color de
 * texto heredado), nunca de --primary. Si tomara el primario, el logo del
 * producto cambiaría con la marca de la arrendadora y dejaría de identificar
 * al software.
 */
export function AppMark({
  variant = "solid",
  className,
}: {
  /** `solid`: los degradados del logo. `plain`: monocromo en currentColor. */
  variant?: "solid" | "plain";
  className?: string;
}) {
  // Ids únicos por instancia: el mismo distintivo puede aparecer dos veces
  // en una página (una de ellas oculta) y un degradado definido dentro de un
  // SVG oculto no se pinta.
  const id = `hstay${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const solid = variant === "solid";
  const { leftPill, rightPill, ribbon, ribbonWidth } = APP_MARK_SHAPES;
  const g = { left: `${id}-l`, right: `${id}-r`, ribbon: `${id}-s` };

  return (
    <svg
      viewBox="0 0 32 32"
      role="img"
      aria-label={APP.name}
      className={cn("size-6 shrink-0", className)}
    >
      {solid ? (
        <defs>
          <linearGradient id={g.left} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={APP_LOGO.violet} />
            <stop offset="0.6" stopColor={APP_LOGO.blue} />
            <stop offset="1" stopColor={APP_LOGO.cyan} />
          </linearGradient>
          <linearGradient id={g.right} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={APP_LOGO.cyan} />
            <stop offset="0.55" stopColor={APP_LOGO.blue} />
            <stop offset="1" stopColor={APP_LOGO.violet} />
          </linearGradient>
          <linearGradient
            id={g.ribbon}
            gradientUnits="userSpaceOnUse"
            x1="5"
            x2="27"
            y1="10"
            y2="24"
          >
            <stop offset="0" stopColor={APP_LOGO.magenta} />
            <stop offset="0.5" stopColor={APP_LOGO.peach} />
            <stop offset="1" stopColor={APP_LOGO.magenta} />
          </linearGradient>
        </defs>
      ) : null}
      <rect
        {...leftPill}
        fill={solid ? `url(#${g.left})` : "currentColor"}
        opacity={solid ? 1 : 0.45}
      />
      <rect
        {...rightPill}
        fill={solid ? `url(#${g.right})` : "currentColor"}
        opacity={solid ? 1 : 0.45}
      />
      <path
        d={ribbon}
        fill="none"
        stroke={solid ? `url(#${g.ribbon})` : "currentColor"}
        strokeWidth={ribbonWidth}
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Distintivo + nombre del producto. Para encabezados y pantallas de acceso. */
export function AppWordmark({
  variant = "solid",
  className,
}: {
  variant?: "solid" | "plain";
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <AppMark variant={variant} className="size-5" />
      <span className="font-semibold tracking-tight">{APP.name}</span>
    </span>
  );
}
