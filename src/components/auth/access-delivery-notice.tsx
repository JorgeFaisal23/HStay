import { MailCheck } from "lucide-react";
import { Callout } from "@/components/shared/callout";
import { TempPassword } from "@/components/auth/temp-password";
import type { AccessDelivery } from "@/server/auth/access";

/**
 * Cómo recibió su acceso la persona a quien se le creó o restableció la
 * cuenta: por correo (enlace) o con una contraseña temporal que hay que
 * entregarle. Ver deliverAccess en src/server/auth/access.ts.
 */
export function AccessDeliveryNotice({ delivery }: { delivery: AccessDelivery }) {
  if (delivery.method === "email") {
    return (
      <Callout tone="success" icon={MailCheck} title="Enlace enviado">
        Le enviamos a {delivery.email} un enlace para elegir su contraseña.
      </Callout>
    );
  }
  return (
    <div className="space-y-2">
      <TempPassword email={delivery.email} password={delivery.tempPassword} />
      <p className="text-muted-foreground text-xs text-pretty">
        Al entrar con ella se le pedirá elegir una propia.
      </p>
    </div>
  );
}
