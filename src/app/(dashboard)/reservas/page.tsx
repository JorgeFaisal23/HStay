import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheck, CalendarRange, Search } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { Amount } from "@/components/shared/amount";
import { ButtonLink } from "@/components/shared/button-link";
import { Callout } from "@/components/shared/callout";
import { Field, NativeSelect } from "@/components/shared/form-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EditBookingDialog, NewBookingDialog } from "@/components/bookings/new-booking-dialog";
import { CancelBookingButton } from "@/components/bookings/cancel-booking-button";
import { requireOrgUser } from "@/lib/auth/session";
import { canEdit } from "@/lib/permissions";
import { BOOKINGS_LIMIT, getBookings, type BookingFilters } from "@/lib/queries/bookings";
import { getBookableUnits, getBuildingsForSelect } from "@/lib/queries/properties";
import { inputDate, periodKey, shortDate } from "@/lib/format";
import {
  BOOKING_SOURCE_LABELS,
  BOOKING_STATUS_LABELS,
  BOOKING_STATUS_TONES,
} from "@/lib/labels";

export const metadata: Metadata = { title: "Reservas" };

const DAY = /^\d{4}-\d{2}-\d{2}$/;

const STATUS_OPTIONS = [
  { value: "", label: "Confirmadas" },
  { value: "CANCELLED", label: "Canceladas" },
  { value: "ALL", label: "Todas" },
] as const;

/**
 * Estancias cortas en lista: para encontrar una reserva por huésped, unidad o
 * fechas sin recorrer el calendario mes por mes, y corregirla o cancelarla.
 */
export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    edificio?: string;
    desde?: string;
    hasta?: string;
    estado?: string;
    reserva?: string;
  }>;
}) {
  const { session, db } = await requireOrgUser(["OWNER", "ADMIN"]);
  const params = await searchParams;
  const editable = canEdit(session.role);

  const filters: BookingFilters = {
    q: params.q?.trim().slice(0, 100) || undefined,
    buildingId: params.edificio || undefined,
    from: params.desde && DAY.test(params.desde) ? params.desde : undefined,
    to: params.hasta && DAY.test(params.hasta) ? params.hasta : undefined,
    status: params.estado === "CANCELLED" || params.estado === "ALL" ? params.estado : undefined,
    id: params.reserva || undefined,
  };

  const [bookings, buildings, units] = await Promise.all([
    getBookings(db, filters),
    getBuildingsForSelect(db),
    editable ? getBookableUnits(db) : Promise.resolve([]),
  ]);

  const hasFilters = Boolean(
    filters.q || filters.buildingId || filters.from || filters.to || filters.status || filters.id,
  );

  return (
    <>
      <PageHeader
        title="Reservas"
        description="Estancias cortas por noche, semana o mes. Busca por huésped o unidad y filtra por fechas; sin fechas ves las actuales y las próximas."
        action={
          editable && units.length > 0 ? <NewBookingDialog units={units} variant="default" /> : null
        }
      />

      {filters.id ? (
        <Callout tone="info">
          Estás viendo una sola reserva.{" "}
          <Link href="/reservas" className="font-medium underline underline-offset-4">
            Ver todas
          </Link>
        </Callout>
      ) : (
        <Card>
          <CardContent>
            <form
              method="get"
              className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))_auto] lg:items-end"
            >
              <Field label="Buscar" htmlFor="q">
                <Input
                  id="q"
                  name="q"
                  type="search"
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
                <Button type="submit" variant="outline">
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
      )}

      {bookings.length === 0 ? (
        <EmptyState
          icon={CalendarCheck}
          title={hasFilters ? "No hay reservas con esos filtros" : "No hay reservas próximas"}
          description={
            hasFilters
              ? "Prueba con otra búsqueda u otras fechas. Para ver estancias pasadas, elige una fecha en “Desde”."
              : "Registra aquí las estancias cortas. Aparecen en el calendario en cuanto las guardas."
          }
          actions={
            editable && units.length > 0 && !hasFilters ? (
              <NewBookingDialog units={units} variant="outline" />
            ) : undefined
          }
        />
      ) : (
        <Card>
          <CardContent>
            <p className="text-muted-foreground mb-2 text-xs tabular-nums">
              {bookings.length} {bookings.length === 1 ? "reserva" : "reservas"}
              {bookings.length === BOOKINGS_LIMIT ? `: se muestran las primeras ${BOOKINGS_LIMIT}, afina los filtros` : ""}
            </p>
            <ul className="divide-y">
              {bookings.map((b) => {
                const manageable = editable && b.source !== "AIRBNB" && b.status === "CONFIRMED";
                return (
                  <li
                    key={b.id}
                    className="grid grid-cols-1 gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_13rem_8rem_auto] sm:items-center"
                  >
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        <span className="truncate">{b.guestName}</span>
                        {b.status !== "CONFIRMED" ? (
                          <StatusBadge tone={BOOKING_STATUS_TONES[b.status]}>
                            {BOOKING_STATUS_LABELS[b.status]}
                          </StatusBadge>
                        ) : null}
                      </p>
                      <p className="text-muted-foreground truncate text-xs">
                        {b.buildingName} · {b.unitCode} · {BOOKING_SOURCE_LABELS[b.source]} ·{" "}
                        {b.guests} {b.guests === 1 ? "huésped" : "huéspedes"}
                        {b.guestPhone ? ` · ${b.guestPhone}` : ""}
                      </p>
                    </div>
                    <div className="text-sm tabular-nums">
                      {shortDate(b.checkIn)} → {shortDate(b.checkOut)}
                      <span className="text-muted-foreground block text-xs">
                        {b.nights} {b.nights === 1 ? "noche" : "noches"}
                      </span>
                    </div>
                    <div className="text-sm sm:text-right">
                      <Amount value={b.totalAmount} />
                    </div>
                    <div className="flex flex-wrap items-center gap-1 sm:justify-end">
                      <ButtonLink
                        href={`/calendario?mes=${periodKey(b.checkIn)}&edificio=${b.buildingId}`}
                        variant="ghost"
                        size="sm"
                        aria-label={`Ver la reserva de ${b.guestName} en el calendario`}
                      >
                        <CalendarRange className="size-4" aria-hidden />
                        Calendario
                      </ButtonLink>
                      {manageable ? (
                        <>
                          <EditBookingDialog
                            units={units}
                            booking={{
                              id: b.id,
                              unitId: b.unitId,
                              source: b.source === "DIRECT" ? "DIRECT" : "MANUAL",
                              guestName: b.guestName,
                              guestEmail: b.guestEmail,
                              guestPhone: b.guestPhone,
                              checkIn: inputDate(b.checkIn),
                              checkOut: inputDate(b.checkOut),
                              guests: b.guests,
                              totalAmount: b.totalAmount,
                              notes: b.notes,
                            }}
                          />
                          <CancelBookingButton bookingId={b.id} guestName={b.guestName} />
                        </>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </>
  );
}
