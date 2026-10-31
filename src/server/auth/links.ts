import "server-only";
import { headers } from "next/headers";
import { isMailConfigured } from "@/lib/mail";

/**
 * Base de los enlaces que viajan por correo (invitación, restablecimiento).
 *
 * En producción sale solo de APP_URL. No se arma con el encabezado Host de la
 * petición: alguien podría mandarlo falsificado para que el correo de
 * restablecimiento de otra persona apunte a su dominio y robarle el token.
 * En desarrollo, sin APP_URL, se usa el host de la petición para no estorbar.
 */
export async function linkBase(): Promise<string | null> {
  const configured = process.env.APP_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;

  if (process.env.NODE_ENV === "production") {
    console.error("Falta APP_URL: no se envían enlaces por correo.");
    return null;
  }
  const h = await headers();
  const host = h.get("host");
  return host ? `http://${host}` : null;
}

/** ¿Se pueden mandar enlaces por correo? (SMTP configurado y APP_URL válida). */
export async function canEmailLinks() {
  return isMailConfigured() && (await linkBase()) !== null;
}
