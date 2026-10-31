/**
 * Fondo de toda la app: olas de luz en los colores del logo de HStay que se
 * desplazan despacio detrás del vidrio (DESIGN.md §16).
 *
 * Es solo marcado y CSS (las animaciones viven en globals.css), sin
 * JavaScript. Se monta una vez, en el layout raíz.
 *
 * Cada ola es una cinta con borde superior e inferior ondulados. El SVG mide
 * el doble del ancho de la pantalla y trae cuatro ondas (dos por pantalla), así
 * que al desplazarlo -50 % el ciclo cierra sin costura. Los degradados se
 * repiten a la mitad por la misma razón.
 */

const PERIODS = 4;
const PERIOD = 720;
const WIDTH = PERIOD * PERIODS;
const HEIGHT = 600;

/** Cinta ondulada: centro `y`, amplitud `amp`, grosor `thick`. */
function ribbon(y: number, amp: number, thick: number) {
  const b = y + thick;
  const a2 = amp * 0.6;
  const q = PERIOD / 4;
  const starts = Array.from({ length: PERIODS }, (_, i) => i * PERIOD);
  const top = starts
    .map(
      (x) =>
        `C${x + q},${y - amp} ${x + 3 * q},${y + amp} ${x + PERIOD},${y}`,
    )
    .join(" ");
  const bottom = [...starts]
    .reverse()
    .map(
      (x) =>
        `C${x + 3 * q},${b + a2} ${x + q},${b - a2} ${x},${b}`,
    )
    .join(" ");
  return `M0,${y} ${top} L${WIDTH},${b} ${bottom} Z`;
}

type Wave = {
  /** Colores del degradado: índices de --aurora-1…5. */
  colors: [number, number, number];
  y: number;
  amp: number;
  thick: number;
};

const WAVES: Wave[] = [
  { colors: [1, 4, 2], y: 230, amp: 150, thick: 90 },
  { colors: [3, 2, 1], y: 250, amp: 170, thick: 70 },
  { colors: [4, 5, 1], y: 230, amp: 140, thick: 100 },
  { colors: [2, 3, 4], y: 250, amp: 160, thick: 75 },
];

/** Paradas que se repiten a la mitad para que el bucle no tenga costura. */
const STOPS = [0, 1, 2, 0, 1, 2, 0];

export function AuroraBackground() {
  return (
    <div className="aurora" aria-hidden>
      {WAVES.map((wave, i) => (
        <div key={i} className={`aurora-wave aurora-wave-${i + 1}`}>
          <div className="aurora-drift">
            <svg
              viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
              preserveAspectRatio="none"
              focusable="false"
            >
              <defs>
                <linearGradient id={`aurora-gradient-${i + 1}`} x1="0" x2="1" y1="0" y2="0">
                  {STOPS.map((c, s) => (
                    <stop
                      key={s}
                      offset={s / (STOPS.length - 1)}
                      style={{ stopColor: `var(--aurora-${wave.colors[c]})` }}
                    />
                  ))}
                </linearGradient>
              </defs>
              <path
                d={ribbon(wave.y, wave.amp, wave.thick)}
                fill={`url(#aurora-gradient-${i + 1})`}
              />
            </svg>
          </div>
        </div>
      ))}
      <div className="aurora-veil" />
    </div>
  );
}
