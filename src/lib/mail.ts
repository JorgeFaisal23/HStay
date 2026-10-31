import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

/**
 * Envío de correo por SMTP con Nodemailer. Sirve con cualquier proveedor
 * (Gmail con contraseña de aplicación, Brevo, el SMTP del hosting…): todo se
 * configura por entorno.
 *
 *   SMTP_HOST, SMTP_PORT (587 por defecto; 465 = TLS directo),
 *   SMTP_USER, SMTP_PASS, MAIL_FROM ("Nombre <correo@dominio>")
 *
 * Sin SMTP_HOST la app funciona igual: en vez de mandar enlaces, quien da de
 * alta o restablece una cuenta recibe una contraseña temporal para entregarla.
 */

export function isMailConfigured() {
  return Boolean(process.env.SMTP_HOST?.trim() && process.env.MAIL_FROM?.trim());
}

let transporter: Transporter | null = null;

function getTransporter() {
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT ?? 587);
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
  }
  return transporter;
}

export type MailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

/**
 * Nunca lanza: un correo que no sale no debe tumbar la acción que lo pidió.
 * Quien llama decide qué hacer con `sent: false` (normalmente, ofrecer una
 * contraseña temporal).
 */
export async function sendMail(message: MailMessage): Promise<{ sent: boolean }> {
  if (!isMailConfigured()) return { sent: false };
  try {
    await getTransporter().sendMail({ from: process.env.MAIL_FROM, ...message });
    return { sent: true };
  } catch (error) {
    console.error("No se pudo enviar el correo:", error);
    return { sent: false };
  }
}
