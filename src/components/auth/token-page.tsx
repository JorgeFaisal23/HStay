import Link from "next/link";
import { LinkIcon } from "lucide-react";
import { AuthCard } from "@/components/auth/auth-card";
import { PasswordLinkForm } from "@/components/auth/password-link-form";
import { Callout } from "@/components/shared/callout";
import { OrgBrandStyle } from "@/components/shared/org-brand-style";
import { peekAuthToken } from "@/server/auth/tokens";

/**
 * Página de un enlace de correo (/invitacion/{token}, /restablecer/{token}).
 * Se presenta con la marca de la arrendadora del usuario; el token no se gasta
 * hasta que se guarda la contraseña.
 */
export async function TokenPage({
  token,
  purpose,
}: {
  token: string;
  purpose: "RESET" | "INVITE";
}) {
  const user = await peekAuthToken(token, purpose);
  const org = user?.organization ?? null;
  const recoverPath = org ? `/a/${org.slug}/recuperar` : "/recuperar";

  if (!user) {
    return (
      <AuthCard title="Este enlace ya no sirve">
        <Callout tone="warning" icon={LinkIcon}>
          {purpose === "INVITE"
            ? "La invitación venció o ya se usó. Pide a quien te dio de alta que te envíe otra."
            : "El enlace venció o ya se usó. Puedes pedir uno nuevo."}
        </Callout>
        {purpose === "RESET" ? (
          <p className="text-center text-sm">
            <Link href={recoverPath} className="underline-offset-4 hover:underline">
              Pedir un enlace nuevo
            </Link>
          </p>
        ) : null}
      </AuthCard>
    );
  }

  const firstName = user.name.split(" ")[0];

  return (
    <>
      {org ? <OrgBrandStyle brand={org} /> : null}
      <AuthCard
        brand={org}
        title={purpose === "INVITE" ? `Hola, ${firstName}` : "Elige una contraseña nueva"}
        description={
          purpose === "INVITE"
            ? `Crea tu contraseña para entrar${org ? ` a ${org.brandName}` : ""}. Tu correo es ${user.email}.`
            : `Para la cuenta ${user.email}.`
        }
      >
        <PasswordLinkForm token={token} purpose={purpose} />
      </AuthCard>
    </>
  );
}
