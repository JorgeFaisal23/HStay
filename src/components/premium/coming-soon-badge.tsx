import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Marca una función anunciada que todavía no existe. Se usa en lugar de
 * maquetas con datos inventados: el arrendador debe saber qué funciona hoy.
 */
export function ComingSoonBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "bg-muted text-muted-foreground inline-flex items-center rounded-sm px-1.5 py-0.5 text-2xs font-semibold tracking-wide whitespace-nowrap uppercase",
        className,
      )}
    >
      Próximamente
    </span>
  );
}

/** Sección completa de una función que todavía no existe. */
export function ComingSoon({
  title,
  description,
  points,
}: {
  title: string;
  description: string;
  points?: string[];
}) {
  return (
    <div className="rounded-xl border border-dashed p-6 sm:p-8">
      <div className="bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-full">
        <Clock className="size-5" aria-hidden />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold text-balance">{title}</h2>
        <ComingSoonBadge />
      </div>
      <p className="text-muted-foreground mt-2 max-w-prose text-sm text-pretty">
        {description}
      </p>
      {points && points.length > 0 ? (
        <ul className="text-muted-foreground mt-4 list-disc space-y-1 pl-5 text-sm">
          {points.map((point) => (
            <li key={point} className="text-pretty">
              {point}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
