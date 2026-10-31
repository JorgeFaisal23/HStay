import { ChevronDown } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Callout } from "@/components/shared/callout";
import { cn } from "@/lib/utils";

/**
 * Campo de formulario con etiqueta y texto de ayuda.
 * Los selectores usan <select> nativo a propósito: en celular abre el selector
 * del sistema, que es más rápido y familiar que una lista personalizada.
 */
export function Field({
  label,
  htmlFor,
  hint,
  required,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required ? (
          <span className="text-muted-foreground font-normal"> *</span>
        ) : null}
      </Label>
      {children}
      {hint ? (
        <p className="text-muted-foreground text-xs text-pretty">{hint}</p>
      ) : null}
    </div>
  );
}

export function NativeSelect({
  className,
  children,
  ...props
}: React.ComponentProps<"select">) {
  return (
    <div className="relative">
      <select
        className={cn(
          "border-input focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 h-9 w-full appearance-none rounded-lg border bg-transparent px-2.5 py-1 pr-9 text-base transition-colors outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2"
        aria-hidden
      />
    </div>
  );
}

/** Aviso de error de una acción de servidor. */
export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <Callout tone="danger">{message}</Callout>
  );
}
