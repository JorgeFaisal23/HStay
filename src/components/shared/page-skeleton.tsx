import { Skeleton } from "@/components/ui/skeleton";

/**
 * Esqueleto de una página estándar (encabezado, indicadores y una tarjeta).
 * Lo usan los loading.tsx: imita la forma de la pantalla que viene en lugar
 * de mostrar un spinner, así el cambio de ruta no produce saltos.
 */
export function PageSkeleton({ stats = 4 }: { stats?: number }) {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando…</span>
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-full max-w-sm" />
      </div>
      {stats > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: stats }, (_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : null}
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}
