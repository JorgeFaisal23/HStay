import type { MetadataRoute } from "next";
import { APP, APP_LOGO } from "@/lib/app";

/**
 * El manifiesto describe el producto, no a la arrendadora: es lo que el
 * sistema operativo guarda si alguien instala la app, y ahí debe leerse el
 * nombre del producto (APP.name).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${APP.name} · ${APP.tagline}`,
    short_name: APP.name,
    description: APP.description,
    start_url: "/",
    display: "standalone",
    // El fondo de la aurora en oscuro, el tema predeterminado.
    background_color: APP_LOGO.night,
    theme_color: APP.color,
    icons: [
      {
        // Lo genera src/app/icon.tsx.
        src: "/icon",
        sizes: "32x32",
        type: "image/png",
      },
    ],
  };
}
