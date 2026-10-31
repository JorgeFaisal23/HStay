import { APP } from "@/lib/app";
import { readableForeground } from "@/lib/brand";

/**
 * Correos con enlace de un solo uso (invitación o restablecimiento). Llevan la
 * marca de la arrendadora: el inquilino reconoce a quien le renta, no al
 * software. HTML sencillo con estilos en línea, que es lo que respetan los
 * clientes de correo.
 */

export type LinkEmailInput = {
  kind: "INVITE" | "RESET";
  recipientName: string;
  /** Nombre de la arrendadora, o del producto para el superadministrador. */
  brandName: string;
  primaryColor: string;
  link: string;
  /** "7 días", "1 hora"… */
  expiresIn: string;
};

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function linkEmail(input: LinkEmailInput) {
  const invite = input.kind === "INVITE";
  const subject = invite
    ? `${input.brandName}: crea tu contraseña`
    : `${input.brandName}: restablece tu contraseña`;
  const intro = invite
    ? `${input.brandName} te dio acceso a su plataforma de rentas. Crea tu contraseña para entrar.`
    : "Recibimos una solicitud para restablecer tu contraseña.";
  const action = invite ? "Crear mi contraseña" : "Restablecer contraseña";
  const outro = invite
    ? `El enlace vence en ${input.expiresIn}. Si no esperabas este correo, ignóralo.`
    : `El enlace vence en ${input.expiresIn} y solo funciona una vez. Si no lo pediste, ignora este correo: tu contraseña sigue igual.`;

  const color = /^#[0-9a-fA-F]{6}$/.test(input.primaryColor) ? input.primaryColor : APP.color;
  const fg = readableForeground(color);
  const name = escapeHtml(input.recipientName.split(" ")[0] ?? input.recipientName);
  const link = escapeHtml(input.link);

  const html = `<!doctype html>
<html lang="es"><body style="margin:0;padding:24px;background:#f4f4f5;font-family:Helvetica,Arial,sans-serif;color:#18181b">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden">
    <tr><td style="background:${color};color:${fg};padding:20px 28px;font-size:18px;font-weight:bold">${escapeHtml(input.brandName)}</td></tr>
    <tr><td style="padding:28px">
      <p style="margin:0 0 12px;font-size:16px">Hola, ${name}:</p>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.5">${escapeHtml(intro)}</p>
      <p style="margin:0 0 24px"><a href="${link}" style="display:inline-block;background:${color};color:${fg};text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold">${action}</a></p>
      <p style="margin:0 0 8px;font-size:13px;color:#52525b;line-height:1.5">${escapeHtml(outro)}</p>
      <p style="margin:0;font-size:12px;color:#71717a;word-break:break-all">Si el botón no funciona, copia este enlace: ${link}</p>
    </td></tr>
    <tr><td style="padding:16px 28px;border-top:1px solid #e4e4e7;font-size:12px;color:#a1a1aa">Enviado con ${escapeHtml(APP.name)}</td></tr>
  </table>
</body></html>`;

  const text = [
    `Hola, ${input.recipientName.split(" ")[0]}:`,
    "",
    intro,
    "",
    `${action}: ${input.link}`,
    "",
    outro,
    "",
    `— ${input.brandName}`,
  ].join("\n");

  return { subject, html, text };
}
