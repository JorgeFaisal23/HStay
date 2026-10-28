import { ImageResponse } from "next/og";
import { APP_MARK_SHAPES } from "@/components/shared/app-mark";
import { APP_LOGO } from "@/lib/app";

/**
 * Favicon del producto: la "H" del logo de HStay, con los mismos trazos que
 * AppMark. Se arma como SVG y se pasa a ImageResponse como imagen para que los
 * degradados se pinten igual que en la app.
 */

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

function markSvg() {
  const { leftPill: l, rightPill: r, ribbon, ribbonWidth } = APP_MARK_SHAPES;
  type Pill = { x: number; y: number; width: number; height: number; rx: number };
  const rect = (p: Pill, fill: string) =>
    `<rect x="${p.x}" y="${p.y}" width="${p.width}" height="${p.height}" rx="${p.rx}" fill="${fill}"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
<defs>
<linearGradient id="l" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${APP_LOGO.violet}"/><stop offset="0.6" stop-color="${APP_LOGO.blue}"/><stop offset="1" stop-color="${APP_LOGO.cyan}"/></linearGradient>
<linearGradient id="r" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${APP_LOGO.cyan}"/><stop offset="0.55" stop-color="${APP_LOGO.blue}"/><stop offset="1" stop-color="${APP_LOGO.violet}"/></linearGradient>
<linearGradient id="s" gradientUnits="userSpaceOnUse" x1="5" x2="27" y1="10" y2="24"><stop offset="0" stop-color="${APP_LOGO.magenta}"/><stop offset="0.5" stop-color="${APP_LOGO.peach}"/><stop offset="1" stop-color="${APP_LOGO.magenta}"/></linearGradient>
</defs>
${rect(l, "url(#l)")}
${rect(r, "url(#r)")}
<path d="${ribbon}" fill="none" stroke="url(#s)" stroke-width="${ribbonWidth}" stroke-linecap="round"/>
</svg>`;
}

export default function Icon() {
  const src = `data:image/svg+xml;base64,${Buffer.from(markSvg()).toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse solo admite <img> */}
        <img src={src} width={32} height={32} alt="" />
      </div>
    ),
    { ...size },
  );
}
