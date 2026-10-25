import type { Metadata } from "next";
import {
  BedDouble,
  CalendarCheck,
  CalendarDays,
  Home,
  MapPin,
  Ruler,
  ShowerHead,
} from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { ButtonLink } from "@/components/shared/button-link";
import { SubmitProofDialog } from "@/components/payments/submit-proof-dialog";
import { Amount } from "@/components/shared/amount";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireOrgUser } from "@/lib/auth/session";
import { getPortalData } from "@/lib/queries/portal";
import { deadlineLabel, longDate, money, periodLabel, shortDate } from "@/lib/format";
import {
  BOOKING_SOURCE_LABELS,
  CHARGE_STATUS_LABELS,
  CHARGE_STATUS_TONES,
  PROOF_STATUS_LABELS,
  PROOF_STATUS_TONES,
  UNIT_TYPE_LABELS,
} from "@/lib/labels";

export const metadata: Metadata = { title: "Mi vivienda" };

export default async function PortalHomePage() {
  const { session, db } = await requireOrgUser(["TENANT"]);
  const data = await getPortalData(db, session.sub);

  const firstName = session.name.split(" ")[0];

  return (
    <>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Hola, {firstName}
        </h1>
        <p className="text-muted-foreground text-sm text-pretty">
          Aquí puedes consultar los datos de tu {data.booking ? "reserva" : "contrato"} y
          tus pagos.
        </p>
      </div>

      {/* ------------------------------------------------------ contrato */}
      {data.lease ? (
        <>
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <CardTitle>
                    {data.lease.unit.buildingName} · Unidad{" "}
                    {data.lease.unit.code}
                  </CardTitle>
                  <CardDescription className="flex items-center gap-1.5">
                    <MapPin className="size-3.5 shrink-0" aria-hidden />
                    {data.lease.unit.buildingAddress}
                    {data.lease.unit.city ? `, ${data.lease.unit.city}` : ""}
                  </CardDescription>
                </div>
                <StatusBadge
                  tone={data.lease.daysLeft <= 30 ? "warning" : "success"}
                >
                  {data.lease.daysLeft <= 30
                    ? deadlineLabel(data.lease.daysLeft)
                    : "Contrato vigente"}
                </StatusBadge>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="bg-brand-soft flex flex-wrap items-center justify-between gap-4 rounded-lg p-4">
                <div>
                  <p className="text-muted-foreground text-xs">Tu renta mensual</p>
                  <Amount
                    value={data.lease.rentAmount}
                    className="text-3xl tracking-tight"
                  />
                </div>
                <div className="text-right">
                  <p className="text-muted-foreground text-xs">Día de pago</p>
                  <p className="text-lg font-medium">
                    Día {data.lease.paymentDay} de cada mes
                  </p>
                </div>
              </div>

              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Detail
                  icon={Home}
                  label="Tipo"
                  value={UNIT_TYPE_LABELS[data.lease.unit.type]}
                />
                <Detail
                  icon={BedDouble}
                  label="Recámaras"
                  value={String(data.lease.unit.bedrooms)}
                />
                <Detail
                  icon={ShowerHead}
                  label="Baños"
                  value={String(data.lease.unit.bathrooms)}
                />
                <Detail
                  icon={Ruler}
                  label="Superficie"
                  value={
                    data.lease.unit.sizeM2 ? `${data.lease.unit.sizeM2} m²` : "—"
                  }
                />
              </dl>

              <dl className="grid grid-cols-2 gap-4 border-t pt-4 sm:grid-cols-3">
                <Detail
                  icon={CalendarDays}
                  label="Inicio del contrato"
                  value={longDate(data.lease.startDate)}
                />
                <Detail
                  icon={CalendarCheck}
                  label="Vencimiento"
                  value={longDate(data.lease.endDate)}
                />
                <Detail
                  label="Depósito en garantía"
                  value={
                    data.lease.depositAmount
                      ? money(data.lease.depositAmount)
                      : "—"
                  }
                />
              </dl>

              {data.lease.unit.description ? (
                <p className="text-muted-foreground border-t pt-4 text-sm text-pretty">
                  {data.lease.unit.description}
                </p>
              ) : null}
            </CardContent>
          </Card>

          {/* ------------------------------------------- próximo pago */}
          <Card>
            <CardHeader>
              <CardTitle>Tu próximo pago</CardTitle>
            </CardHeader>
            <CardContent>
              {!data.nextCharge ? (
                <EmptyState
                  title="Estás al corriente"
                  description="No tienes cargos pendientes. Gracias por tu puntualidad."
                />
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-muted-foreground text-xs">
                      {periodLabel(data.nextCharge.period)} · vence el{" "}
                      {shortDate(data.nextCharge.dueDate)}
                    </p>
                    <Amount
                      value={data.nextCharge.amount - data.nextCharge.paidAmount}
                      className="block text-2xl tracking-tight"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <StatusBadge
                      tone={CHARGE_STATUS_TONES[data.nextCharge.status]}
                    >
                      {CHARGE_STATUS_LABELS[data.nextCharge.status]}
                    </StatusBadge>
                    {data.nextCharge.lastProof?.status === "SUBMITTED" ? (
                      <StatusBadge tone={PROOF_STATUS_TONES.SUBMITTED}>
                        Comprobante {PROOF_STATUS_LABELS.SUBMITTED.toLowerCase()}
                      </StatusBadge>
                    ) : (
                      <SubmitProofDialog
                        chargeId={data.nextCharge.id}
                        periodName={periodLabel(data.nextCharge.period)}
                        remaining={data.nextCharge.amount - data.nextCharge.paidAmount}
                        resend={data.nextCharge.lastProof?.status === "REJECTED"}
                        variant="default"
                      />
                    )}
                    <ButtonLink href="/portal/pagos" variant="link" className="px-0">
                      Ver todos
                    </ButtonLink>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : data.booking ? (
        /* ------------------------------------------------------ reserva */
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <CardTitle>
                  {data.booking.buildingName} · Unidad {data.booking.unitCode}
                </CardTitle>
                <CardDescription className="flex items-center gap-1.5">
                  <MapPin className="size-3.5 shrink-0" aria-hidden />
                  {data.booking.buildingAddress}
                </CardDescription>
              </div>
              <StatusBadge tone="success">Reserva confirmada</StatusBadge>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border p-4">
                <p className="text-muted-foreground text-xs">Llegada</p>
                <p className="text-lg font-medium">
                  {longDate(data.booking.checkIn)}
                </p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-muted-foreground text-xs">Salida</p>
                <p className="text-lg font-medium">
                  {longDate(data.booking.checkOut)}
                </p>
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Detail
                label="Huéspedes"
                value={String(data.booking.guests)}
              />
              <Detail
                label="Total de la estancia"
                value={money(data.booking.totalAmount)}
              />
              <Detail
                label="Reservado por"
                value={BOOKING_SOURCE_LABELS[data.booking.source]}
              />
            </dl>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent>
            <EmptyState
              icon={Home}
              title="Todavía no tienes una vivienda asignada"
              description="En cuanto el administrador registre tu contrato o tu reserva, la verás aquí con todos sus datos."
            />
          </CardContent>
        </Card>
      )}

      {/* Un contrato terminado puede dejar saldo: se sigue mostrando. */}
      {!data.lease && data.balance > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Saldo pendiente</CardTitle>
            <CardDescription>De un contrato anterior.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-4">
            <Amount value={data.balance} className="text-2xl" tone="danger" />
            <ButtonLink href="/portal/pagos" variant="outline" size="sm">
              Ver detalle
            </ButtonLink>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}

function Detail({
  icon: Icon,
  label,
  value,
}: {
  icon?: typeof Home;
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
