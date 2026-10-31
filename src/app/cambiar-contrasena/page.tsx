import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { mustChangePassword, requireUser } from "@/lib/auth/session";
import { getCurrentOrg } from "@/lib/org";
import { homePathFor } from "@/lib/permissions";

export const metadata: Metadata = { title: "Elige tu contraseña" };

/**
 * Cambio obligatorio: quien entra con una contraseña temporal llega aquí y no
 * puede usar la app hasta elegir una propia (lo impone requireUser).
 */
export default async function ForcedPasswordPage() {
  const session = await requireUser(undefined, { allowPendingPasswordChange: true });
  // Quien ya eligió su contraseña la cambia desde "Mi cuenta".
  if (!(await mustChangePassword(session))) redirect(homePathFor(session.role));

  const org = await getCurrentOrg();

  return (
    <AuthCard
      brand={org}
      title="Elige tu contraseña"
      description="Entraste con una contraseña temporal. Para continuar, elige una que solo tú conozcas."
    >
      <ChangePasswordForm forced />
    </AuthCard>
  );
}
