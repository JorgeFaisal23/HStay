import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheck, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { Amount } from "@/components/shared/amount";
import { ButtonLink } from "@/components/shared/button-link";
import { Callout } from "@/components/shared/callout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EditBookingDialog, NewBookingDialog } from "@/components/bookings/new-booking-dialog";
import { CancelBookingButton } from "@/components/bookings/cancel-booking-button";
import { Timeline, TimelineLegend } from "@/app/(dashboard)/calendario/timeline";
import { requireOrgUser } from "@/lib/auth/session";
import { captureBuildingIds } from "@/lib/capture";
import { getBookings } from "@/lib/queries/bookings";
import { getCalendarData } from "@/lib/queries/calendar";
import { getBookableUnits } from "@/lib/queries/properties";
import { inputDate, periodKey, periodLabel, shiftPeriod, shortDate } from "@/lib/format";
import { BOOKING_SOURCE_LABELS, BOOKING_STATUS_LABELS, BOOKING_STATUS_TONES } from "@/lib/labels";

export const metadata: Metadata = { title: "Reservas" };

const PERIOD = /^\d{4}-\d{2}$/;

/**
 * Vista de Captura: registrar, corregir y cancelar reservas, y ver la
 * ocupación del mes, solo de las propiedades asignadas a esta persona. Todo
 * pasa por `captureBuildingIds`; los contratos de largo plazo se ven como
 * "ocupada" sin nombre ni renta del inquilino.
 */
export default async function CapturePage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; edificio?: string; q?: string; reserva?: string }>;
}) {
  const { session, db } = await requireOrgUser(["CAPTURE"]);
  const params = await searchParams;
  const allowed = await captureBuildingIds(db, session.sub);
  const firstName = session.name.split(" ")[0];

  if (allowed.length === 0) {
    return (
      <>
        <h1 className="text-2xl font-semibold tracking-tight">Hola, {firstName}</h1>
        <EmptyState
          icon={CalendarCheck}
          title="Aún no tienes propiedades asignadas"
          description="Pide al administrador que te asigne las propiedades en las que vas a registrar reservas."
        />
      </>
    );
  }

  const period = params.mes && PERIOD.test(params.mes) ? params.mes : periodKey(new Date());
  const buildingId = params.edificio && allowed.includes(params.edificio) ? params.edificio : undefined;
  const q = params.q?.trim().slice(0, 100) || undefined;

  const [units, calendar, bookings] = await Promise.all([
    getBookableUnits(db, allowed),
    getCalendarData(db, period, buildingId, undefined, {
      buildingIds: allowed,
      privateLeases: true,
      bookingHref: (id) => `/captura?reserva=${id}`,
    }),
    getBookings(db, { buildingIds: allowed, q, id: params.reserva || undefined, buildingId }),
  ]);

  const link = (next: Partial<{ mes: string; edificio: string }>) => {
    const query = new URLSearchParams();
    const mes = next.mes ?? period;
    const edificio = "edificio" in next ? next.edificio : buildingId;
    if (mes) query.set("mes", mes);
    if (edificio) query.set("edificio", edificio);
    return `/captura?${query.toString()}`;
  };

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">Hola, {firstName}</h1>
          <p className="text-muted-foreground text-sm text-pretty">
            Reservas de {calendar.buildings.map((b) => b.name).join(", ")}.
          </p>
        </div>
        {units.length > 0 ? <NewBookingDialog units={units} variant="default" /> : null}
      </div>

      {/* ------------------------------------------------------ calendario */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Ocupación de {periodLabel(period).toLowerCase()}</CardTitle>
              <CardDescription>Haz clic en una reserva para corregirla o cancelarla.</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <ButtonLink href={link({ mes: shiftPeriod(period, -1) })} variant="outline" size="icon" aria-label="Mes anterior">
                <ChevronLeft className="size-4" aria-hidden />
              </ButtonLink>
              <ButtonLink href={link({ mes: shiftPeriod(period, 1) })} variant="outline" size="icon" aria-label="Mes siguiente">
                <ChevronRight className="size-4" aria-hidden />
              </ButtonLink>
              {period !== periodKey(new Date()) ? (
                <ButtonLink href={link({ mes: periodKey(new Date()) })} variant="ghost">
                  Hoy
                </ButtonLink>
              ) : null}
            </div>
          </div>
          {calendar.buildings.length > 1 ? (
            <nav aria-label="Propiedad" className="flex flex-wrap gap-2 pt-2">
              <ButtonLink href={link({ edificio: undefined })} variant={buildingId ? "outline" : "default"} size="sm">
                Todas
              </ButtonLink>
              {calendar.buildings.map((b) => (
                <ButtonLink
                  key={b.id}
                  href={link({ edificio: b.id })}
                  variant={buildingId === b.id ? "default" : "outline"}
                  size="sm"
                >
                  {b.name}
                </ButtonLink>
              ))}
            </nav>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-3">
          <TimelineLegend />
          <Timeline
            rows={calendar.rows}
            year={calendar.year}
            month={calendar.month}
            totalDays={calendar.totalDays}
            linkable
          />
        </CardContent>
      </Card>

      {/* --------------------------------------------------------- lista */}
      <Card>
        <CardHeader>
          <CardTitle>{params.reserva ? "Reserva" : "Reservas actuales y próximas"}</CardTitle>
          {params.reserva ? (
            <Callout tone="info">
              Estás viendo una sola reserva.{" "}
              <Link href={link({})} className="font-medium underline underline-offset-4">
                Ver todas
              </Link>
            </Callout>
          ) : (
            <form method="get" role="search" className="flex flex-wrap items-center gap-2 pt-2">
              <input type="hidden" name="mes" value={period} />
              {buildingId ? <input type="hidden" name="edificio" value={buildingId} /> : null}
              <Input
                name="q"
                type="search"
                aria-label="Buscar huésped o unidad"
                placeholder="Huésped, teléfono o unidad"
                defaultValue={q}
                className="w-64"
              />
              <Button type="submit" variant="outline">
                <Search className="size-4" aria-hidden />
                Buscar
              </Button>
            </form>
          )}
        </CardHeader>
        <CardContent>
          {bookings.length === 0 ? (
            <EmptyState
              icon={CalendarCheck}
              title={q ? "No hay reservas con esa búsqueda" : "No hay reservas próximas"}
              description="Las reservas que registres aparecen aquí y en el calendario."
            />
          ) : (
            <ul className="divide-y">
              {bookings.map((b) => {
                const manageable = b.source !== "AIRBNB" && b.status === "CONFIRMED";
                return (
                  <li
                    key={b.id}
                    className="grid grid-cols-1 gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_12rem_8rem_auto] sm:items-center"
                  >
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        <span className="truncate">{b.guestName}</span>
                        {b.status !== "CONFIRMED" ? (
                          <StatusBadge tone={BOOKING_STATUS_TONES[b.status]}>{BOOKING_STATUS_LABELS[b.status]}</StatusBadge>
                        ) : null}
                      </p>
                      <p className="text-muted-foreground truncate text-xs">
                        {b.buildingName} · {b.unitCode} · {BOOKING_SOURCE_LABELS[b.source]} · {b.guests}{" "}
                        {b.guests === 1 ? "huésped" : "huéspedes"}
                      </p>
                    </div>
                    <div className="text-sm tabular-nums">
                      {shortDate(b.checkIn)} → {shortDate(b.checkOut)}
                      <span className="text-muted-foreground block text-xs">
                        {b.nights} {b.nights === 1 ? "noche" : "noches"}
                      </span>
                    </div>
                    <div className="text-sm sm:text-right">
                      <Amount value={b.totalAmount} currency={b.currency} />
                    </div>
                    <div className="flex flex-wrap items-center gap-1 sm:justify-end">
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
          )}
        </CardContent>
      </Card>
    </>
  );
}
