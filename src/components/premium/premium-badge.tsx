/**
 * Distintivo para las entradas Premium del menú lateral.
 *
 * Vive aparte de <PremiumGate> a propósito: el menú es un componente de
 * cliente y el gate consulta la base de datos, así que compartir archivo
 * arrastraría el driver de Postgres al bundle del navegador.
 */
export function PremiumBadge() {
  return (
    <span className="bg-primary/10 text-primary ml-auto rounded-sm px-1.5 py-0.5 text-2xs font-semibold tracking-wide uppercase">
      Pro
    </span>
  );
}
