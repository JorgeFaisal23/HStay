import { LifeBuoy } from "lucide-react";
import { Callout } from "@/components/shared/callout";
import { LocalTime } from "@/components/shared/local-time";
import { SUPPORT_ACTOR_LABEL } from "@/lib/labels";
import { SUPPORT_NOTICE_DAYS } from "@/lib/support";
import type { RecentSupportSession } from "@/lib/queries/support";

/**
 * Aviso para el dueño y el equipo administrativo: quién de la plataforma entró
 * a su panel, cuándo y para qué. Se ve en cualquier plan (la bitácora completa
 * es Premium) durante unos días.
 */
export function SupportNotice({ sessions }: { sessions: RecentSupportSession[] }) {
  if (sessions.length === 0) return null;
  const active = sessions.some((s) => s.endedAt === null);

  return (
    <Callout
      tone="info"
      variant="banner"
      icon={LifeBuoy}
      title={
        active
          ? `${SUPPORT_ACTOR_LABEL} está trabajando en tu cuenta`
          : `${SUPPORT_ACTOR_LABEL} entró a tu cuenta en los últimos ${SUPPORT_NOTICE_DAYS} días`
      }
    >
      <ul className="space-y-1">
        {sessions.map((s) => (
          <li key={s.id}>
            {s.staffName} · <LocalTime value={s.startedAt} format="dateTime" />
            {s.endedAt ? (
              <>
                {" "}
                a <LocalTime value={s.endedAt} />
              </>
            ) : (
              " · ahora"
            )}
            . Motivo: {s.reason}
          </li>
        ))}
      </ul>
    </Callout>
  );
}
