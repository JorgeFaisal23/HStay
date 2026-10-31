import { PageHeader } from "@/components/shared/page-header";
import { ChangePasswordForm } from "@/components/auth/change-password-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ROLE_LABELS } from "@/lib/labels";
import type { SessionPayload } from "@/lib/auth/jwt";

/** "Mi cuenta": datos de acceso y cambio de contraseña. Igual para todos los roles. */
export function AccountPanel({
  session,
  orgName,
}: {
  session: SessionPayload;
  orgName?: string | null;
}) {
  return (
    <>
      <PageHeader
        title="Mi cuenta"
        description="Tus datos de acceso. Para cambiar tu nombre o tu correo, pídeselo a quien administra tu cuenta."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>{session.name}</CardTitle>
            <CardDescription>{ROLE_LABELS[session.role]}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Correo para entrar</p>
              <p className="font-medium break-all">{session.email}</p>
            </div>
            {orgName ? (
              <div>
                <p className="text-muted-foreground text-xs">Arrendadora</p>
                <p className="font-medium">{orgName}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Cambiar contraseña</CardTitle>
            <CardDescription>
              Al cambiarla se cierra cualquier otra sesión que tengas abierta.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChangePasswordForm />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
