import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  BedDouble,
  Building2,
  CalendarDays,
  ExternalLink,
  FileText,
  Receipt,
  Ruler,
  ShowerHead,
  UserPlus,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { ButtonLink } from "@/components/shared/button-link";
import { Amount } from "@/components/shared/amount";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getBuildingsForSelect,
  getUnitDetail,
} from "@/lib/queries/properties";
import { requireOrgUser } from "@/lib/auth/session";
import { canEdit } from "@/lib/permissions";
import { SHOW_AIRBNB_INTEGRATION } from "@/lib/features";
import {
  daysBetween,
  deadlineLabel,
  inputDate,
  longDate,
  money,
  periodLabel,
  shortDate,
} from "@/lib/format";
import {
  BOOKING_SOURCE_LABELS,
  CHARGE_STATUS_LABELS,
  CHARGE_STATUS_TONES,
  SERVICE_TYPE_LABELS,
  SPLIT_MODE_LABELS,
  UNIT_STATUS_LABELS,
  UNIT_STATUS_TONES,
  UNIT_TYPE_LABELS,
} from "@/lib/labels";
import { ConfirmDelete } from "@/components/shared/confirm-delete";
import { ServiceAccountCard } from "@/components/services/service-account-card";
import { AddServiceDialog } from "@/components/services/add-service-dialog";
import { EditBookingDialog, NewBookingDialog } from "@/components/bookings/new-booking-dialog";
import { CancelBookingButton } from "@/components/bookings/cancel-booking-button";
import { deleteUnit } from "@/server/actions/properties";
import { EditUnitDialog } from "./edit-unit-dialog";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { db } = await requireOrgUser(["OWNER", "ADMIN"]);
  const { id } = await params;
  const unit = await getUnitDetail(db, id);
  return { title: unit ? `Unidad ${unit.code}` : "Unidad" };
}

export default async function UnitPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { session, db } = await requireOrgUser(["OWNER", "ADMIN"]);
  const { id } = await params;
  const [unit, buildings] = await Promise.all([
    getUnitDetail(db, id),
    getBuildingsForSelect(db),
  ]);

  if (!unit) notFound();

  const editable = canEdit(session.role);
  const lease = unit.activeLease;
  const daysLeft = lease ? daysBetween(new Date(), lease.endDate) : null;
  const isShortTerm = unit.status === "SHORT_TERM";

  return (
    <>
      <Link
        href={`/edificios/${unit.building.id}`}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {unit.building.name}
      </Link>

      <PageHeader
        title={`Unidad ${unit.code}`}
        description={`${UNIT_TYPE_LABELS[unit.type]} en ${unit.building.name} · ${
          isShortTerm && unit.rates.nightly !== null
            ? `${money(unit.rates.nightly, unit.currency)} por noche`
            : `${money(unit.baseRent, unit.currency)} al mes`
        }.`}
        action={
          editable ? (
            <div className="flex flex-wrap gap-2">
              <ConfirmDelete
                label="Eliminar"
                title={`¿Eliminar la unidad ${unit.code}?`}
                description="Se borra la unidad con sus servicios. Solo es posible si nunca tuvo contratos, reservas ni servicios capturados."
                confirmLabel="Eliminar unidad"
                action={deleteUnit.bind(null, unit.id)}
              />
              <EditUnitDialog
                unitId={unit.id}
                buildings={buildings}
                defaults={{
                  buildingId: unit.building.id,
                  code: unit.code,
                  name: unit.name,
                  type: unit.type,
                  status: unit.status,
                  floor: unit.floor,
                  bedrooms: unit.bedrooms,
                  bathrooms: unit.bathrooms,
                  sizeM2: unit.sizeM2,
                  baseRent: unit.baseRent,
                  nightlyRate: unit.rates.nightly,
                  weeklyRate: unit.rates.weekly,
                  monthlyRate: unit.rates.monthly,
                  description: unit.description,
                }}
              />
            </div>
          ) : null
        }
      />

      <Tabs defaultValue="general">
        <TabsList className="w-full overflow-x-auto sm:w-auto">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="servicios">Servicios</TabsTrigger>
          <TabsTrigger value="contrato">
            {isShortTerm ? "Reservas" : "Contrato"}
          </TabsTrigger>
          <TabsTrigger value="pagos">Pagos</TabsTrigger>
        </TabsList>

        {/* ----------------------------------------------------- general */}
        <TabsContent value="general" className="space-y-4 pt-4">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle>Datos de la unidad</CardTitle>
                <StatusBadge tone={UNIT_STATUS_TONES[unit.status]}>
                  {UNIT_STATUS_LABELS[unit.status]}
                </StatusBadge>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Detail icon={Building2} label="Propiedad" value={unit.building.name} />
                <Detail
                  icon={BedDouble}
                  label="Recámaras"
                  value={String(unit.bedrooms)}
                />
                <Detail
                  icon={ShowerHead}
                  label="Baños"
                  value={String(unit.bathrooms)}
                />
                <Detail
                  icon={Ruler}
                  label="Superficie"
                  value={unit.sizeM2 ? `${unit.sizeM2} m²` : "—"}
                />
              </dl>

              {unit.description ? (
                <div>
                  <p className="text-muted-foreground text-xs">Descripción</p>
                  <p className="mt-1 text-sm text-pretty">{unit.description}</p>
                </div>
              ) : null}

              <dl className="bg-muted/50 grid grid-cols-2 gap-3 rounded-lg p-4 sm:grid-cols-4">
                <div>
                  <dt className="text-muted-foreground text-xs">Renta mensual</dt>
                  <dd className="mt-0.5 text-lg">
                    <Amount value={unit.baseRent} currency={unit.currency} />
                  </dd>
                </div>
                {(
                  [
                    ["Por noche", unit.rates.nightly],
                    ["Por semana", unit.rates.weekly],
                    ["Por mes (estancia)", unit.rates.monthly],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-muted-foreground text-xs">{label}</dt>
                    <dd className="mt-0.5 text-lg">
                      {value === null ? (
                        <span className="text-muted-foreground text-sm">Sin tarifa</span>
                      ) : (
                        <Amount value={value} currency={unit.currency} />
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>

          {unit.airbnb ? (
            <Card>
              <CardHeader>
                <CardTitle>Publicada en Airbnb</CardTitle>
                <CardDescription>
                  Las reservas de este anuncio aparecen en el calendario global.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{unit.airbnb.listingName}</p>
                  <p className="text-muted-foreground text-xs">
                    {unit.airbnb.lastSyncedAt
                      ? `Última sincronización: ${shortDate(unit.airbnb.lastSyncedAt)}`
                      : "Sin sincronizar"}
                  </p>
                </div>
                {SHOW_AIRBNB_INTEGRATION ? (
                  <ButtonLink href="/integraciones" variant="outline" size="sm">
                    <ExternalLink className="size-4" aria-hidden />
                    Ver conexión
                  </ButtonLink>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        {/* --------------------------------------------------- servicios */}
        <TabsContent value="servicios" className="space-y-4 pt-4">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle>Servicios de esta unidad</CardTitle>
                  <CardDescription>
                    Marca cuáles van incluidos en la renta y guarda el número de
                    contrato de cada recibo.
                  </CardDescription>
                </div>
                {editable ? (
                  <AddServiceDialog
                    target={{ scope: "UNIT", unitId: unit.id }}
                    existingTypes={unit.serviceAccounts.map((a) => a.type)}
                  />
                ) : null}
              </div>
            </CardHeader>
            <CardContent>
              {unit.serviceAccounts.length === 0 ? (
                <EmptyState
                  icon={Receipt}
                  title="Esta unidad no tiene servicios propios"
                  description="Agrega los servicios que se contratan solo para esta unidad, como su medidor de luz o su internet."
                />
              ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                  {unit.serviceAccounts.map((account) => (
                    <ServiceAccountCard
                      key={account.id}
                      account={account}
                      editable={editable}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {unit.building.serviceAccounts.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Servicios del edificio</CardTitle>
                <CardDescription>
                  Recibos globales de {unit.building.name} que se reparten entre
                  sus unidades. Se administran desde la propiedad.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <ul className="grid gap-3 sm:grid-cols-2">
                  {unit.building.serviceAccounts.map((account) => (
                    <li key={account.id} className="rounded-lg border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium">
                          {SERVICE_TYPE_LABELS[account.type]}
                        </p>
                        <StatusBadge
                          tone={account.includedInRent ? "success" : "neutral"}
                        >
                          {account.includedInRent ? "Incluido" : "Aparte"}
                        </StatusBadge>
                      </div>
                      <p className="text-muted-foreground mt-1 text-xs">
                        Contrato {account.contractNumber ?? "—"} ·{" "}
                        {SPLIT_MODE_LABELS[account.splitMode]}
                      </p>
                    </li>
                  ))}
                </ul>
                <ButtonLink
                  href={`/edificios/${unit.building.id}`}
                  variant="outline"
                  size="sm"
                >
                  Administrar en la propiedad
                </ButtonLink>
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        {/* ------------------------------------------ contrato / reservas */}
        <TabsContent value="contrato" className="space-y-4 pt-4">
          {isShortTerm ? (
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <CardTitle>Reservas próximas</CardTitle>
                    <CardDescription>
                      Estancias confirmadas para esta unidad.
                    </CardDescription>
                  </div>
                  {editable ? (
                    <NewBookingDialog
                      unitId={unit.id}
                      units={[{ id: unit.id, label: unit.code, rates: unit.rates, currency: unit.currency }]}
                    />
                  ) : null}
                </div>
              </CardHeader>
              <CardContent>
                {unit.bookings.length === 0 ? (
                  <EmptyState
                    icon={CalendarDays}
                    title="Sin reservas próximas"
                    description="Las reservas que registres o que lleguen de Airbnb aparecerán aquí y en el calendario global."
                  />
                ) : (
                  <ul className="divide-y">
                    {unit.bookings.map((booking) => (
                      <li
                        key={booking.id}
                        className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0"
                      >
                        <div>
                          <p className="text-sm font-medium">
                            {booking.guestName}
                          </p>
                          <p className="text-muted-foreground text-xs">
                            {BOOKING_SOURCE_LABELS[booking.source]} ·{" "}
                            {booking.guests}{" "}
                            {booking.guests === 1 ? "huésped" : "huéspedes"}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="text-sm tabular-nums">
                              {shortDate(booking.checkIn)} →{" "}
                              {shortDate(booking.checkOut)}
                            </p>
                            <p className="text-muted-foreground text-xs">
                              <Amount value={booking.totalAmount} currency={unit.currency} className="font-normal" />
                            </p>
                          </div>
                          {editable && booking.source !== "AIRBNB" ? (
                            <>
                              <EditBookingDialog
                                units={[{ id: unit.id, label: unit.code, rates: unit.rates, currency: unit.currency }]}
                                booking={{
                                  id: booking.id,
                                  unitId: unit.id,
                                  source: booking.source === "DIRECT" ? "DIRECT" : "MANUAL",
                                  guestName: booking.guestName,
                                  guestEmail: booking.guestEmail,
                                  guestPhone: booking.guestPhone,
                                  checkIn: inputDate(booking.checkIn),
                                  checkOut: inputDate(booking.checkOut),
                                  guests: booking.guests,
                                  totalAmount: booking.totalAmount,
                                  notes: booking.notes,
                                }}
                              />
                              <CancelBookingButton
                                bookingId={booking.id}
                                guestName={booking.guestName}
                              />
                            </>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ) : lease ? (
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle>Contrato vigente</CardTitle>
                  {daysLeft !== null && daysLeft <= 60 ? (
                    <StatusBadge tone={daysLeft <= 30 ? "danger" : "warning"}>
                      {deadlineLabel(daysLeft)}
                    </StatusBadge>
                  ) : (
                    <StatusBadge tone="success">Vigente</StatusBadge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
                  <div>
                    <p className="text-muted-foreground text-xs">Inquilino</p>
                    <p className="font-medium">{lease.tenant.name}</p>
                    <p className="text-muted-foreground text-xs">
                      {[lease.tenant.email, lease.tenant.phone].filter(Boolean).join(" · ") ||
                        "Sin datos de contacto"}
                    </p>
                  </div>
                  <ButtonLink
                    href={`/inquilinos/${lease.tenant.id}`}
                    variant="outline"
                    size="sm"
                  >
                    Ver ficha
                  </ButtonLink>
                </div>

                <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Detail label="Inicio" value={longDate(lease.startDate)} />
                  <Detail label="Vencimiento" value={longDate(lease.endDate)} />
                  <Detail label="Renta" value={money(lease.rentAmount, unit.currency)} />
                  <Detail
                    label="Día de pago"
                    value={`Día ${lease.paymentDay} de cada mes`}
                  />
                </dl>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent>
                <EmptyState
                  icon={FileText}
                  title="Esta unidad no tiene contrato activo"
                  description="Asigna un inquilino para registrar la vigencia, la renta y empezar a generar los cobros mensuales."
                  actions={
                    editable ? (
                      <>
                        <ButtonLink href={`/inquilinos/asignar?unidad=${unit.id}`} size="sm">
                          <UserPlus className="size-4" aria-hidden />
                          Inquilino registrado
                        </ButtonLink>
                        <ButtonLink href={`/inquilinos/nuevo?unidad=${unit.id}`} size="sm" variant="outline">
                          Inquilino nuevo
                        </ButtonLink>
                      </>
                    ) : undefined
                  }
                />
              </CardContent>
            </Card>
          )}

          {unit.pastLeases.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Contratos anteriores</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-y text-sm">
                  {unit.pastLeases.map((past) => (
                    <li
                      key={past.id}
                      className="flex items-center justify-between gap-2 py-2 first:pt-0 last:pb-0"
                    >
                      <span>{past.tenantName}</span>
                      <span className="text-muted-foreground text-xs tabular-nums">
                        {shortDate(past.startDate)} — {shortDate(past.endDate)}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        {/* ------------------------------------------------------- pagos */}
        <TabsContent value="pagos" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Historial de renta</CardTitle>
              <CardDescription>
                Últimos cargos generados para esta unidad.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!lease || lease.charges.length === 0 ? (
                <EmptyState
                  icon={Receipt}
                  title="Sin cargos registrados"
                  description="Los cargos de renta se generan cada mes desde la sección de Cobros."
                  actions={
                    editable ? (
                      <ButtonLink href="/pagos" variant="outline" size="sm">
                        Ir a Cobros
                      </ButtonLink>
                    ) : undefined
                  }
                />
              ) : (
                <ul className="divide-y">
                  {lease.charges.map((charge) => (
                    <li
                      key={charge.id}
                      className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0"
                    >
                      <div>
                        <p className="text-sm font-medium">
                          {periodLabel(charge.period)}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          Vence el {shortDate(charge.dueDate)}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Amount value={charge.amount} currency={unit.currency} className="text-sm font-medium" />
                        <StatusBadge tone={CHARGE_STATUS_TONES[charge.status]}>
                          {CHARGE_STATUS_LABELS[charge.status]}
                        </StatusBadge>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}

function Detail({
  icon: Icon,
  label,
  value,
}: {
  icon?: typeof Building2;
  label: string;
  value: string;
}) {
  return (
    <div>
      <dt className="text-muted-foreground flex items-center gap-1.5 text-xs">
        {Icon ? <Icon className="size-3.5" aria-hidden /> : null}
        {label}
      </dt>
      <dd className="mt-0.5 text-sm font-medium text-pretty">{value}</dd>
    </div>
  );
}
