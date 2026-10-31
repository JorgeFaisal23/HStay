import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheck, CalendarPlus, Search } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ButtonLink } from "@/components/shared/button-link";
import { Field, NativeSelect } from "@/components/shared/form-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { requireUser } from "@/lib/auth/session";
import { getBookings, getBuildingOptions, type BookingFilters } from "@/lib/queries/bookings";
import { money, shortDate } from "@/lib/format";
import { BOOKING_SOURCE_LABELS } from "@/lib/labels";
import { isIsoDay } from "@/lib/services/booking-dates";

export const metadata: Metadata = { title: "Reservas" };

const STATUS_OPTIONS = [
  { value: "", label: "Activas" },
  { value: "CANCELLED", label: "Canceladas" },
  { value: "ALL", label: "Todas" },
] as const;

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    edificio?: string;
    desde?: string;
    hasta?: string;
    estado?: string;
  }>;
}) {
  const session = await requireUser(["OWNER", "ADMIN"]);
  const params = await searchParams;

  const filters: BookingFilters = {
    q: params.q?.slice(0, 100) || undefined,
    buildingId: params.edificio || undefined,
    from: params.desde && isIsoDay(params.desde) ? params.desde : undefined,
    to: params.hasta && isIsoDay(params.hasta) ? params.hasta : undefined,
    status:
      params.estado === "CANCELLED" || params.estado === "ALL" ? params.estado : undefined,
  };

  const [bookings, buildings] = await Promise.all([
    getBookings(filters, session.organizationId),
    getBuildingOptions(session.organizationId),
  ]);

  const hasFilters = Boolean(
    filters.q || filters.buildingId || filters.from || filters.to || filters.status,
  );

  return (
    <>
      <PageHeader
        title="Reservas"
        description="Estancias cortas por noche, semana o mes. Busca por huésped o unidad y filtra por fechas; sin fechas se muestran las estancias actuales y futuras."
        action={
          <ButtonLink href="/reservas/nueva">
            <CalendarPlus className="size-4" aria-hidden />
            Nueva reserva
          </ButtonLink>
        }
      />

      {/* --------------------------------------------------------- filtros */}
      <Card>
        <CardContent>
          <form
            method="get"
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))_auto] lg:items-end"
          >
            <Field label="Buscar" htmlFor="q">
              <Input
                id="q"
                name="q"
                defaultValue={filters.q}
                placeholder="Huésped, correo, teléfono o unidad"
              />
            </Field>
            <Field label="Propiedad" htmlFor="edificio">
              <NativeSelect id="edificio" name="edificio" defaultValue={filters.buildingId ?? ""}>
                <option value="">Todas</option>
                {buildings.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Desde" htmlFor="desde">
              <Input id="desde" name="desde" type="date" defaultValue={filters.from} />
            </Field>
            <Field label="Hasta" htmlFor="hasta">
              <Input id="hasta" name="hasta" type="date" defaultValue={filters.to} />
            </Field>
            <Field label="Estado" htmlFor="estado">
              <NativeSelect id="estado" name="estado" defaultValue={filters.status ?? ""}>
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <div className="flex gap-2">
              <Button type="submit">
                <Search className="size-4" aria-hidden />
                Buscar
              </Button>
              {hasFilters ? (
                <ButtonLink href="/reservas" variant="ghost">
                  Limpiar
                </ButtonLink>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* ----------------------------------------------------------- lista */}
      {bookings.length === 0 ? (
        <EmptyState
          icon={CalendarCheck}
          title={hasFilters ? "No hay reservas con esos filtros" : "No hay reservas próximas"}
          description={
            hasFilters
              ? "Prueba con otras fechas o con otra búsqueda. Para ver reservas pasadas, elige una fecha en “Desde”."
              : "Captura aquí las estancias cortas. Aparecerán en el calendario en cuanto las guardes."
          }
          actions={
            <ButtonLink href="/reservas/nueva" size="sm">
              Capturar reserva
            </ButtonLink>
          }
        />
      ) : (
        <Card>
          <CardContent>
            <p className="text-muted-foreground mb-2 text-xs">
              {bookings.length} {bookings.length === 1 ? "reserva" : "reservas"}
              {bookings.length === 300 ? " (se muestran las primeras 300; afina los filtros)" : ""}
            </p>
            <ul className="divide-y">
              {bookings.map((b) => (
                <li key={b.id}>
                  <Link
                    href={`/reservas/${b.id}`}
                    className="hover:bg-accent/60 -mx-2 grid grid-cols-1 gap-x-4 gap-y-1 rounded-md px-2 py-3 transition sm:grid-cols-[minmax(0,1fr)_14rem_9rem] sm:items-center"
                  >
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 font-medium">
                        <span className="truncate">{b.guestName}</span>
                        {b.status === "CANCELLED" ? (
                          <Badge variant="destructive">Cancelada</Badge>
                        ) : null}
                      </p>
                      <p className="text-muted-foreground truncate text-xs">
                        {b.buildingName} · {b.unitCode} · {BOOKING_SOURCE_LABELS[b.source]} ·{" "}
                        {b.guests} {b.guests === 1 ? "huésped" : "huéspedes"}
                      </p>
                    </div>
                    <div className="text-sm tabular-nums">
                      {shortDate(b.checkIn)} → {shortDate(b.checkOut)}
                      <span className="text-muted-foreground block text-xs">
                        {b.nights} {b.nights === 1 ? "noche" : "noches"}
                      </span>
                    </div>
                    <div className="text-sm tabular-nums sm:text-right">
                      {money(b.totalAmount, b.currency)}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </>
  );
}
