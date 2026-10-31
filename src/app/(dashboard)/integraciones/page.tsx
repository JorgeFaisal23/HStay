import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, Plug, Wifi } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { ButtonLink } from "@/components/shared/button-link";
import { Callout } from "@/components/shared/callout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireOrgUser } from "@/lib/auth/session";
import { canEdit } from "@/lib/permissions";
import { shortDate } from "@/lib/format";
import { BOOKING_SOURCE_CLASSES } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { SyncButton } from "./sync-button";

export const metadata: Metadata = { title: "Integraciones" };

export default async function IntegrationsPage() {
  const { session, db } = await requireOrgUser(["OWNER", "ADMIN"]);
  const editable = canEdit(session.role);

  const connections = await db.airbnbConnection.findMany({
    orderBy: { listingName: "asc" },
    select: {
      id: true,
      listingName: true,
      listingUrl: true,
      status: true,
      lastSyncedAt: true,
      unit: {
        select: {
          id: true,
          code: true,
          building: { select: { name: true } },
          _count: {
            select: {
              bookings: { where: { source: "AIRBNB", status: "CONFIRMED" } },
            },
          },
        },
      },
    },
  });

  const totalBookings = connections.reduce(
    (sum, c) => sum + c.unit._count.bookings,
    0,
  );

  return (
    <>
      <PageHeader
        title="Integraciones"
        description="Conecta tus anuncios de renta vacacional para que sus reservas aparezcan en el calendario global."
        action={
          editable && connections.length > 0 ? (
            <SyncButton variant="default" size="default" />
          ) : null
        }
      />

      {/* Aviso honesto sobre el alcance de la demo. */}
      <Callout tone="info" title="Sincronización simulada en esta demostración">
        Airbnb no ofrece una API pública de reservas; la vía real es importar el
        enlace iCal de cada anuncio, que es unidireccional y se actualiza cada
        cierto tiempo. La plataforma ya guarda ese enlace por unidad y el
        importador está listo para conectarse.
      </Callout>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className={cn("flex size-10 items-center justify-center rounded-md", BOOKING_SOURCE_CLASSES.AIRBNB)}>
                <Wifi className="size-5" aria-hidden />
              </span>
              <div>
                <CardTitle>Airbnb</CardTitle>
                <CardDescription>
                  {connections.length}{" "}
                  {connections.length === 1
                    ? "anuncio conectado"
                    : "anuncios conectados"}{" "}
                  · {totalBookings} reservas importadas
                </CardDescription>
              </div>
            </div>
            <StatusBadge tone={connections.length > 0 ? "success" : "neutral"}>
              {connections.length > 0 ? "Conectado" : "Sin conectar"}
            </StatusBadge>
          </div>
        </CardHeader>
        <CardContent>
          {connections.length === 0 ? (
            <EmptyState
              icon={Plug}
              title="Todavía no hay anuncios conectados"
              description="Marca una unidad como “Renta corta” y registra el enlace iCal de su anuncio para traer sus reservas al calendario."
              actions={
                <ButtonLink href="/edificios" variant="outline" size="sm">
                  Ir a propiedades
                </ButtonLink>
              }
            />
          ) : (
            <ul className="divide-y">
              {connections.map((connection) => (
                <li
                  key={connection.id}
                  className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {connection.listingName}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      <Link
                        href={`/unidades/${connection.unit.id}`}
                        className="hover:underline"
                      >
                        {connection.unit.building.name} · Unidad{" "}
                        {connection.unit.code}
                      </Link>{" "}
                      · {connection.unit._count.bookings} reservas ·{" "}
                      {connection.lastSyncedAt
                        ? `sincronizado el ${shortDate(connection.lastSyncedAt)}`
                        : "sin sincronizar"}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {connection.listingUrl ? (
                      <a
                        href={connection.listingUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
                      >
                        Ver anuncio
                        <ExternalLink className="size-3" aria-hidden />
                      </a>
                    ) : null}
                    {editable ? (
                      <SyncButton
                        connectionId={connection.id}
                        listingName={connection.listingName}
                      />
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Otros canales, como camino de producto. */}
      <Card>
        <CardHeader>
          <CardTitle>Otros canales</CardTitle>
          <CardDescription>
            Próximamente podrás conectar más plataformas de renta vacacional.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-3 sm:grid-cols-3">
            {["Booking.com", "Vrbo", "Google Calendar"].map((channel) => (
              <li
                key={channel}
                className="flex items-center justify-between rounded-lg border border-dashed p-3"
              >
                <span className="text-sm">{channel}</span>
                <StatusBadge tone="neutral">Próximamente</StatusBadge>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </>
  );
}
