import type { Metadata } from "next";
import { Inter, Poppins, Source_Sans_3 } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { AuroraBackground } from "@/components/shared/aurora-background";
import { Toaster } from "@/components/ui/sonner";
import { APP } from "@/lib/app";
import { AURORA_INIT_SCRIPT } from "@/lib/aurora";
import { brandStyleSheet } from "@/lib/brand";
import { getCurrentBrand } from "@/lib/org";
import "./globals.css";

// Las tres fuentes se cargan siempre; el panel de marca solo decide a cuál
// apunta --font-sans, así el cambio es instantáneo y sin recarga.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
});
const sourceSans = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-source",
  display: "swap",
});

/**
 * Dos identidades conviven en los metadatos: el título es la marca del
 * arrendador —es lo que el inquilino reconoce en la pestaña— y
 * `applicationName` es el producto (APP.name), el software que sirve la página. El
 * nombre del producto no se mete en el título para no competir con la marca.
 */
export async function generateMetadata(): Promise<Metadata> {
  const org = await getCurrentBrand();
  return {
    title: {
      default: org.brandName,
      template: `%s · ${org.brandName}`,
    },
    description: APP.description,
    applicationName: APP.name,
    generator: APP.name,
    // El nombre corto del atajo en iOS: ahí sí manda la marca del arrendador,
    // porque el icono vive en la pantalla de inicio del inquilino.
    appleWebApp: { title: org.brandName },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const org = await getCurrentBrand();
  const brandCss = brandStyleSheet({
    primaryColor: org.primaryColor,
    radius: org.radius,
    fontFamily: org.fontFamily,
  });

  return (
    // Las variables de fuente van en <html>: los tokens que las consumen se
    // declaran en :root, y desde ahí no se ve una variable definida en <body>.
    <html
      lang="es"
      suppressHydrationWarning
      className={`${inter.variable} ${poppins.variable} ${sourceSans.variable}`}
    >
      <body className="antialiased">
        {/* Tokens de marca renderizados en servidor: llegan en el primer
            pintado, así que no hay parpadeo de color al cargar. */}
        <style
          id="brand-tokens"
          dangerouslySetInnerHTML={{ __html: brandCss }}
        />
        {/* Intensidad de la aurora que eligió el usuario (en su navegador),
            aplicada antes del primer pintado para que no parpadee. */}
        <script dangerouslySetInnerHTML={{ __html: AURORA_INIT_SCRIPT }} />
        {/* Fondo de toda la app (DESIGN.md §16): fijo, detrás de todo. */}
        <AuroraBackground />
        <ThemeProvider>{children}</ThemeProvider>
        <Toaster position="top-right" richColors />
      </body>
    </html>
  );
}
