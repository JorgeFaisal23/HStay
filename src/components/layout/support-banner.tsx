import { LifeBuoy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/shared/callout";
import { LocalTime } from "@/components/shared/local-time";
import { endSupportSession } from "@/server/superadmin/support";

/**
 * Barra fija mientras el staff de la plataforma da soporte: recuerda en qué
 * arrendadora está, hasta cuándo, y le da la salida.
 */
export function SupportBanner({ orgName, expiresAt }: { orgName: string; expiresAt: Date }) {
  return (
    <Callout tone="warning" variant="banner" icon={LifeBuoy}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p>
          <strong className="font-medium">Modo soporte</strong> en {orgName}. Lo que
          cambies queda en su bitácora a tu nombre. Termina a las{" "}
          <LocalTime value={expiresAt} />.
        </p>
        <form action={endSupportSession}>
          <Button type="submit" size="sm" variant="outline">
            Terminar soporte
          </Button>
        </form>
      </div>
    </Callout>
  );
}
