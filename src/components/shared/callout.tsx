import {
  CircleAlert,
  CircleCheck,
  Info,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type CalloutTone = "info" | "warning" | "danger" | "success";

const TONE_STYLES: Record<CalloutTone, string> = {
  info: "bg-info-soft border-info-border text-info-foreground",
  warning: "bg-warning-soft border-warning-border text-warning-foreground",
  danger: "bg-danger-soft border-danger-border text-danger-foreground",
  success: "bg-success-soft border-success-border text-success-foreground",
};

const TONE_ICONS: Record<CalloutTone, LucideIcon> = {
  info: Info,
  warning: TriangleAlert,
  danger: CircleAlert,
  success: CircleCheck,
};

/**
 * Aviso en línea con el color del semáforo. Es la única caja de aviso de la
 * aplicación: errores de formulario, avisos de sesión y notas informativas.
 * `banner` ocupa todo el ancho bajo el encabezado (sin borde redondeado).
 */
export function Callout({
  tone = "info",
  icon,
  title,
  children,
  variant = "box",
  className,
}: {
  tone?: CalloutTone;
  icon?: LucideIcon;
  title?: string;
  children: React.ReactNode;
  variant?: "box" | "banner";
  className?: string;
}) {
  const Icon = icon ?? TONE_ICONS[tone];
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2.5 text-sm",
        TONE_STYLES[tone],
        variant === "box" ? "rounded-lg border px-3 py-2.5" : "border-b px-4 py-2",
        className,
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 space-y-0.5 text-pretty">
        {title ? <p className="font-medium">{title}</p> : null}
        <div className="[&_a]:font-medium [&_a]:underline [&_a]:underline-offset-2">
          {children}
        </div>
      </div>
    </div>
  );
}
