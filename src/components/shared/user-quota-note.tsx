import { Callout } from "@/components/shared/callout";

/**
 * Cuántos usuarios contratados usa la arrendadora. Lleno, explica cómo liberar
 * un lugar o conseguir más: el número solo lo cambia la plataforma.
 */
export function UserQuotaNote({ active, max }: { active: number; max: number }) {
  const summary = `Usuarios contratados: ${active} de ${max} en uso. Cuentan el dueño, el equipo y los inquilinos con acceso activo.`;

  if (active < max) {
    return <p className="text-muted-foreground text-sm tabular-nums">{summary}</p>;
  }
  return (
    <Callout tone="warning" title="Ya usas todos tus usuarios contratados">
      {summary} Para dar de alta a alguien más, desactiva una cuenta que ya no use
      o pide a la plataforma más usuarios.
    </Callout>
  );
}
