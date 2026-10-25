import type { Metadata } from "next";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  BedDouble,
  CalendarClock,
  Receipt,
  Sparkles,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Amount } from "@/components/shared/amount";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { ButtonLink } from "@/components/shared/button-link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { getDashboardData } from "@/lib/queries/dashboard";
import { requireOrgUser } from "@/lib/auth/session";
import { requireCurrentOrg } from "@/lib/org";
import { canEdit } from "@/lib/permissions";
import { deadlineLabel, moneyCompact, money, periodLabel, shortDate } from "@/lib/format";
import { BOOKING_SOURCE_LABELS } from "@/lib/labels";

export const metadata: Metadata = { title: "Resumen" };

export default async function DashboardPage() {
  const { session, db } = await requireOrgUser(["OWNER", "ADMIN", "VIEWER"]);
  const [data, org] = await Promise.all([getDashboardData(db), requireCurrentOrg()]);
  const editable = canEdit(session.role);

  const firstName = session.name.split(" ")[0];

  return (
    <>
      <PageHeader
        title={`Hola, ${firstName}`}
        description={`Así va ${periodLabel(data.period).toLowerCase()} en tus propiedades.`}
        action={
          editable ? (
            <ButtonLink href="/servicios">
                <Receipt className="size-4" aria-hidden />
                Capturar servicios
              </ButtonLink>
          ) : null
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Ocupación"
          value={`${data.occupancyRate}%`}
          hint={`${data.occupied} de ${data.totalUnits} unidades ocupadas`}
          icon={BedDouble}
          tone="brand"
        />
        <StatCard
          label="Renta cobrada este mes"
          value={<Amount value={data.collected} compact />}
          hint={`De ${moneyCompact(data.expectedIncome)} esperados`}
          icon={Banknote}
        />
        <StatCard
          label="Gasto en servicios"
          value={<Amount value={data.servicesTotal} compact />}
          hint={
            data.servicesMissing > 0
              ? `Faltan ${data.servicesMissing} montos por capturar`
              : "Todos los montos capturados"
          }
          icon={Receipt}
        />
        <StatCard
          label="Cobros vencidos"
          value={data.overdueCount === 0 ? "Ninguno" : String(data.overdueCount)}
          hint={
            data.overdueCount === 0
              ? "Todos los inquilinos al corriente"
              : `${money(data.overdueAmount)} por recuperar`
          }
          icon={AlertTriangle}
          tone={data.overdueCount > 0 ? "danger" : "default"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* ---------------------------------------------- requiere atención */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Requiere tu atención</CardTitle>
            <CardDescription>
              Lo que conviene resolver antes de que se convierta en problema.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.overdueCount === 0 &&
            data.expiringSoon.length === 0 &&
            data.servicesMissing === 0 ? (
              <EmptyState
                title="Todo en orden"
                description="No hay pagos vencidos, contratos por vencer ni montos de servicios pendientes de capturar."
              />
            ) : (
              <>
                {data.overdueCount > 0 ? (
                  <AttentionRow
                    tone="danger"
                    title={`${data.overdueCount} ${data.overdueCount === 1 ? "cobro vencido" : "cobros vencidos"}`}
                    detail={`${money(data.overdueAmount)} sin liquidar.`}
                    href="/pagos"
                    cta="Ver cobros"
                  />
                ) : null}

                {data.servicesMissing > 0 ? (
                  <AttentionRow
                    tone="warning"
                    title={`${data.servicesMissing} servicios sin monto este mes`}
                    detail="Puedes copiar los montos del mes anterior en un clic."
                    href="/servicios"
                    cta="Capturar"
                  />
                ) : null}

                {data.expiringSoon.map((lease) => (
                  <AttentionRow
                    key={lease.id}
                    tone={lease.daysLeft <= 30 ? "danger" : "warning"}
                    title={`Contrato de ${lease.tenantName} por vencer`}
                    detail={`${lease.buildingName} · Unidad ${lease.unitCode} · ${deadlineLabel(lease.daysLeft)}, el ${shortDate(lease.endDate)}.`}
                    href={`/inquilinos/${lease.tenantId}`}
                    cta="Ver ficha"
                  />
                ))}
              </>
            )}
          </CardContent>
        </Card>

        {/* ---------------------------------------------- ocupación */}
        <Card>
          <CardHeader>
            <CardTitle>Ocupación por propiedad</CardTitle>
            <CardDescription>
              {data.availableUnits} disponible
              {data.availableUnits === 1 ? "" : "s"} ·{" "}
              {data.maintenanceUnits} en mantenimiento
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {data.buildings.map((building) => (
              <div key={building.id} className="space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium">
                    {building.name}
                  </span>
                  <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                    {building.occupied}/{building.total}
                  </span>
                </div>
                <Progress value={building.rate} />
              </div>
            ))}
            <ButtonLink href="/edificios" variant="outline" className="w-full">
                Ver propiedades
                <ArrowRight className="size-4" aria-hidden />
              </ButtonLink>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* ---------------------------------------------- próximas llegadas */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Próximas llegadas</CardTitle>
            <CardDescription>
              Reservas de corta estancia confirmadas.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.upcomingBookings.length === 0 ? (
              <EmptyState
                icon={CalendarClock}
                title="Sin reservas próximas"
                description="Cuando lleguen reservas de Airbnb o directas aparecerán aquí."
                actions={
                  <ButtonLink href="/calendario" variant="outline" size="sm">Abrir calendario</ButtonLink>
                }
              />
            ) : (
              <ul className="divide-y">
                {data.upcomingBookings.map((booking) => (
                  <li
                    key={booking.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {booking.guestName}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {booking.buildingName} · Unidad {booking.unitCode} ·{" "}
                        {BOOKING_SOURCE_LABELS[booking.source]}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm tabular-nums">
                        {shortDate(booking.checkIn)} →{" "}
                        {shortDate(booking.checkOut)}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        <Amount value={booking.totalAmount} className="font-normal" />
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* ---------------------------------------------- upsell premium */}
        {org.plan === "FREE" && session.role !== "VIEWER" ? (
          <Card className="border-primary/30 bg-primary/5 h-fit">
            <CardHeader>
              <div className="bg-primary/10 text-primary flex size-9 items-center justify-center rounded-md">
                <Sparkles className="size-4" aria-hidden />
              </div>
              <CardTitle className="mt-2">Saca más de tus datos</CardTitle>
              <CardDescription className="text-pretty">
                Con Premium registras propiedades y unidades sin límite y
                abres los reportes de rentabilidad y ocupación de cada
                propiedad.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ButtonLink href="/premium" className="w-full">Ver qué incluye</ButtonLink>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
}

function AttentionRow({
  tone,
  title,
  detail,
  href,
  cta,
}: {
  tone: "danger" | "warning";
  title: string;
  detail: string;
  href: string;
  cta: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={tone}>
            {tone === "danger" ? "Urgente" : "Por hacer"}
          </StatusBadge>
          <p className="text-sm font-medium text-pretty">{title}</p>
        </div>
        <p className="text-muted-foreground text-xs text-pretty">{detail}</p>
      </div>
      <ButtonLink href={href} size="sm" variant="outline">
        {cta}
      </ButtonLink>
    </div>
  );
}
