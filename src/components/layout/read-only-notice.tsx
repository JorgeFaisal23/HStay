import { Eye } from "lucide-react";
import { Callout } from "@/components/shared/callout";

/**
 * Aviso permanente para el rol de consulta. Es preferible decirle por qué no
 * ve botones de edición a que los busque y no los encuentre.
 */
export function ReadOnlyNotice() {
  return (
    <Callout tone="info" variant="banner" icon={Eye}>
      Tu cuenta es de <strong className="font-medium">solo lectura</strong>:
      puedes consultar el calendario y el resumen, pero no modificar
      información.
    </Callout>
  );
}
