import { APP, APP_VERSION_LABEL } from "@/lib/app";
import { AppMark } from "@/components/shared/app-mark";
import { cn } from "@/lib/utils";

/**
 * Firma del producto para los márgenes de la interfaz.
 *
 * Va en pie de página y en el pie del menú lateral, nunca junto al nombre de
 * la arrendadora: el usuario debe poder distinguir de un vistazo quién le
 * cobra (la marca de la arrendadora) de con qué lo hace (el producto, APP.name).
 */
export function AppSignature({
  showVersion = false,
  className,
}: {
  showVersion?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "text-muted-foreground inline-flex items-center gap-1.5 text-xs",
        className,
      )}
    >
      <AppMark variant="plain" className="size-3.5 opacity-70" />
      <span>
        Impulsado por <span className="font-medium">{APP.name}</span>
        {showVersion ? ` · ${APP.version}` : ""}
      </span>
      <span className="sr-only">{APP_VERSION_LABEL}</span>
    </span>
  );
}
