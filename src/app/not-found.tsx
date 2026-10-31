import type { Metadata } from "next";
import { SearchX } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { ButtonLink } from "@/components/shared/button-link";

export const metadata: Metadata = { title: "No encontrado" };

/**
 * Se muestra también cuando alguien abre la URL de un registro de otra
 * arrendadora: para el cliente con alcance ese registro no existe, y no hay
 * que insinuar lo contrario.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-[60svh] items-center justify-center p-6">
      <EmptyState
        icon={SearchX}
        title="No encontramos esta página"
        description="Puede que el enlace esté mal escrito o que lo que buscas ya no exista."
        actions={
          <ButtonLink href="/" variant="outline" size="sm">
            Ir al inicio
          </ButtonLink>
        }
        className="w-full max-w-md"
      />
    </div>
  );
}
