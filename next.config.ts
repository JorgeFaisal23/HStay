import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/**
 * Política de contenido sin nonces (ver la guía content-security-policy de
 * Next): todo se sirve desde el propio dominio; logos y comprobantes son data
 * URL. 'unsafe-inline' hace falta por los scripts de hidratación de Next y por
 * los colores de marca que se inyectan en un <style>.
 *
 * Sin upgrade-insecure-requests ni HSTS: dependen de que el VPS sirva HTTPS, y
 * eso lo decide el proxy de enfrente (ver README, Despliegue con Docker).
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
];

const nextConfig: NextConfig = {
  // Build autocontenido en .next/standalone (server.js + solo los módulos que
  // usa): es lo que copia la imagen de Docker. Ver Dockerfile.
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
