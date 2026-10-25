import { ButtonLink } from "@/components/shared/button-link";
import { PLAN_LIMITS } from "@/lib/plans";
import { TONE_TEXT } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { Plan } from "@/generated/prisma/enums";

/**
 * Cuánto del plan lleva usado la arrendadora: propiedades y unidades
 * registradas contra lo que incluye su plan. Los números salen de
 * PLAN_LIMITS, los mismos que aplican las altas y que promete /premium.
 */
export function PlanUsage({
  plan,
  buildings,
  units,
  showPlansLink = true,
}: {
  plan: Plan;
  buildings: number;
  units: number;
  showPlansLink?: boolean;
}) {
  const limits = PLAN_LIMITS[plan];
  const rows = [
    { label: "propiedades", used: buildings, limit: limits.buildings },
    { label: "unidades", used: units, limit: limits.units },
  ];
  const full = rows.some((row) => row.used >= row.limit);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <span className="font-medium">{plan === "PREMIUM" ? "Plan Premium" : "Plan gratuito"}</span>
      {rows.map((row) => (
        <span
          key={row.label}
          className={cn(
            "text-muted-foreground tabular-nums",
            row.used >= row.limit && TONE_TEXT.warning,
          )}
        >
          {Number.isFinite(row.limit)
            ? `${row.used} de ${row.limit} ${row.label}`
            : `${row.used} ${row.label} · sin límite`}
        </span>
      ))}
      {full ? <span className={TONE_TEXT.warning}>Llegaste al límite de tu plan.</span> : null}
      {showPlansLink && plan !== "PREMIUM" ? (
        <ButtonLink href="/premium" variant="link" className="h-auto px-0">
          Ver planes
        </ButtonLink>
      ) : null}
    </div>
  );
}
