import { describe, expect, it } from "vitest";
import { passwordPairSchema } from "@/lib/password-policy";
import { linkEmail } from "@/lib/mail-templates";

describe("passwordPairSchema", () => {
  it("acepta una contraseña válida y confirmada", () => {
    expect(passwordPairSchema.safeParse({ password: "una frase larga", confirm: "una frase larga" }).success).toBe(true);
  });

  it("rechaza contraseñas cortas, distintas o de más de 72 bytes", () => {
    expect(passwordPairSchema.safeParse({ password: "corta", confirm: "corta" }).success).toBe(false);
    expect(passwordPairSchema.safeParse({ password: "una frase larga", confirm: "otra frase" }).success).toBe(false);
    const long = "ñ".repeat(40); // 80 bytes en UTF-8
    expect(passwordPairSchema.safeParse({ password: long, confirm: long }).success).toBe(false);
  });
});

describe("linkEmail", () => {
  it("escapa el HTML de los datos del usuario", () => {
    const mail = linkEmail({
      kind: "INVITE",
      recipientName: '<script>alert("x")</script> Ana',
      brandName: "Rentas <b>Valle</b>",
      primaryColor: "#0F766E",
      link: "https://app.example.com/invitacion/abc",
      expiresIn: "7 días",
    });
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).not.toContain("<b>Valle</b>");
    expect(mail.html).toContain("&lt;b&gt;Valle&lt;/b&gt;");
    expect(mail.html).toContain("https://app.example.com/invitacion/abc");
    expect(mail.subject).toContain("crea tu contraseña");
  });

  it("ignora un color que no es hexadecimal", () => {
    const mail = linkEmail({
      kind: "RESET",
      recipientName: "Ana",
      brandName: "X",
      primaryColor: "red;background:url(evil)",
      link: "https://a.b/restablecer/x",
      expiresIn: "1 hora",
    });
    expect(mail.html).not.toContain("evil");
  });
});
