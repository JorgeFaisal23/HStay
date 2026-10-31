import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  BadgeCheck,
  CreditCard,
  FileText,
  Mail,
  MapPin,
  Phone,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { ButtonLink } from "@/components/shared/button-link";
import { ReceiptBadge } from "@/components/payments/receipt-viewer";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getSession, requireUser } from "@/lib/auth/session";
import { canEdit } from "@/lib/permissions";
import { getAssignableUnits, getTenantDetail } from "@/lib/queries/tenants";
import {
  deadlineLabel,
  initials,
  longDate,
  money,
  periodLabel,
  shortDate,
} from "@/lib/format";
import {
  CHARGE_STATUS_LABELS,
  CHARGE_STATUS_TONES,
  LEASE_STATUS_LABELS,
  LEASE_STATUS_TONES,
  SERVICE_TYPE_LABELS,
} from "@/lib/labels";
import { EditTenantDialog } from "./edit-tenant-dialog";
import { AssignLeaseDialog, LeaseActions } from "./lease-actions";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const session = await getSession();
  const { id } = await params;
  const tenant = await getTenantDetail(id, session?.organizationId);
  return { title: tenant?.name ?? "Inquilino" };
}

export default async function TenantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireUser(["OWNER", "ADMIN"]);
  const { id } = await params;
  const [tenant, assignableUnits] = await Promise.all([
    getTenantDetail(id, session.organizationId),
    getAssignableUnits(session.organizationId),
  ]);

  if (!tenant) notFound();

  const editable = canEdit(session.role);
  const lease = tenant.activeLease;
  const pendingCharges =
    lease?.charges.filter((c) => c.status !== "PAID") ?? [];

  return (
    <>
      <Link
        href="/inquilinos"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Inquilinos
      </Link>

      <PageHeader
        title={tenant.name}
        description={
          lease
            ? `${lease.unit.buildingName} · Unidad ${lease.unit.code}`
            : "Sin contrato vigente."
        }
        action={
          editable && !lease ? (
            <AssignLeaseDialog
              tenantId={tenant.id}
              tenantName={tenant.name}
              units={assignableUnits}
            />
          ) : null
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* ------------------------------------------------------- perfil */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Avatar className="size-12">
                <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                  {initials(tenant.name)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <CardTitle className="truncate">{tenant.name}</CardTitle>
                <CardDescription>
                  Alta el {shortDate(tenant.createdAt)}
                </CardDescription>
              </div>
              {editable ? (
                <EditTenantDialog
                  tenant={{
                    id: tenant.id,
                    name: tenant.name,
                    email: tenant.email,
                    phone: tenant.phone,
                    documentId: tenant.documentId,
                    notes: tenant.notes,
                  }}
                />
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="flex items-center gap-2">
              <Mail className="text-muted-foreground size-4 shrink-0" aria-hidden />
              {tenant.email ? (
                <a href={`mailto:${tenant.email}`} className="truncate hover:underline">
                  {tenant.email}
                </a>
              ) : (
                <span className="text-muted-foreground">Sin correo · sin acceso al portal</span>
              )}
            </p>
            {tenant.phone ? (
              <p className="flex items-center gap-2">
                <Phone className="text-muted-foreground size-4 shrink-0" aria-hidden />
                <a href={`tel:${tenant.phone}`} className="hover:underline">
                  {tenant.phone}
                </a>
              </p>
            ) : null}
            {tenant.documentId ? (
              <p className="flex items-center gap-2">
                <BadgeCheck
                  className="text-muted-foreground size-4 shrink-0"
                  aria-hidden
                />
                <span className="tabular-nums">{tenant.documentId}</span>
              </p>
            ) : null}
            {tenant.notes ? (
              <p className="text-muted-foreground border-t pt-3 text-xs text-pretty">
                {tenant.notes}
              </p>
            ) : null}
          </CardContent>
        </Card>

        {/* ----------------------------------------------------- contrato */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>Contrato</CardTitle>
              {lease ? (
                lease.daysLeft <= 60 ? (
                  <StatusBadge tone={lease.daysLeft <= 30 ? "danger" : "warning"}>
                    {deadlineLabel(lease.daysLeft)}
                  </StatusBadge>
                ) : (
                  <StatusBadge tone="success">Vigente</StatusBadge>
                )
              ) : null}
            </div>
          </CardHeader>
          <CardContent>
            {!lease ? (
              <EmptyState
                icon={FileText}
                title="Sin contrato vigente"
                description={
                  tenant.otherLeases.length > 0
                    ? "Sus contratos anteriores están abajo; desde ahí puedes renovarlos."
                    : "Este inquilino no tiene una unidad asignada actualmente."
                }
              />
            ) : (
              <div className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
                  <div className="min-w-0">
                    <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                      <MapPin className="size-3" aria-hidden />
                      {lease.unit.buildingAddress}
                    </p>
                    <p className="font-medium">
                      {lease.unit.buildingName} · Unidad {lease.unit.code}
                    </p>
                  </div>
                  <ButtonLink
                    href={`/unidades/${lease.unit.id}`}
                    variant="outline"
                    size="sm"
                  >
                    Ver unidad
                  </ButtonLink>
                </div>

                <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                  <Detail label="Inicio" value={longDate(lease.startDate)} />
                  <Detail label="Vencimiento" value={longDate(lease.endDate)} />
                  <Detail label="Renta" value={money(lease.rentAmount, lease.terms.currency)} />
                  <Detail
                    label="Depósito"
                    value={lease.depositAmount ? money(lease.depositAmount, lease.terms.currency) : "—"}
                  />
                  <Detail label="Día de pago" value={`Día ${lease.paymentDay}`} />
                </dl>

                {lease.notes ? (
                  <p className="text-muted-foreground text-xs whitespace-pre-line text-pretty">
                    {lease.notes}
                  </p>
                ) : null}

                {editable ? (
                  <LeaseActions
                    lease={lease.terms}
                    label={`${lease.unit.buildingName} · ${lease.unit.code}`}
                  />
                ) : null}

                <div className="space-y-2">
                  <p className="text-sm font-medium">Servicios de la unidad</p>
                  <ul className="flex flex-wrap gap-2">
                    {lease.services.length === 0 ? (
                      <li className="text-muted-foreground text-xs">
                        No hay servicios registrados para esta unidad.
                      </li>
                    ) : (
                      lease.services.map((service) => (
                        <li key={service.type}>
                          <StatusBadge
                            tone={service.includedInRent ? "success" : "neutral"}
                          >
                            {SERVICE_TYPE_LABELS[service.type]}:{" "}
                            {service.includedInRent ? "incluido" : "aparte"}
                          </StatusBadge>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* -------------------------------------------------------- pagos */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Historial de pagos</CardTitle>
              <CardDescription>
                {pendingCharges.length === 0
                  ? "Al corriente en todos sus cargos."
                  : `${pendingCharges.length} ${pendingCharges.length === 1 ? "cargo pendiente" : "cargos pendientes"}.`}
              </CardDescription>
            </div>
            {editable && lease ? (
              <ButtonLink href="/pagos" variant="outline" size="sm">
                <CreditCard className="size-4" aria-hidden />
                Registrar pago
              </ButtonLink>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          {!lease || lease.charges.length === 0 ? (
            <EmptyState
              icon={CreditCard}
              title="Sin cargos registrados"
              description="Los cargos de renta se generan cada mes desde la sección de Cobros."
            />
          ) : (
            <div className="-mx-6 overflow-x-auto px-6">
              <table className="w-full min-w-lg text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b text-left">
                    <th scope="col" className="py-2 font-medium">Periodo</th>
                    <th scope="col" className="py-2 font-medium">Vencimiento</th>
                    <th scope="col" className="py-2 text-right font-medium">Monto</th>
                    <th scope="col" className="py-2 text-right font-medium">Pagado</th>
                    <th scope="col" className="py-2 text-right font-medium">Estado</th>
                    <th scope="col" className="py-2 text-right font-medium">
                      <span className="sr-only">Comprobante</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {lease.charges.map((charge) => (
                    <tr key={charge.id} className="border-b last:border-0">
                      <td className="py-2.5 font-medium">
                        {periodLabel(charge.period)}
                      </td>
                      <td className="text-muted-foreground py-2.5 tabular-nums">
                        {shortDate(charge.dueDate)}
                      </td>
                      <td className="py-2.5 text-right tabular-nums">
                        {money(charge.amount)}
                      </td>
                      <td className="text-muted-foreground py-2.5 text-right text-xs tabular-nums">
                        {charge.paidAt
                          ? `${shortDate(charge.paidAt)}${charge.method ? ` · ${charge.method}` : ""}`
                          : "—"}
                      </td>
                      <td className="py-2.5 text-right">
                        <StatusBadge tone={CHARGE_STATUS_TONES[charge.status]}>
                          {CHARGE_STATUS_LABELS[charge.status]}
                        </StatusBadge>
                      </td>
                      <td className="py-2.5 text-right">
                        {charge.receiptUrl ? (
                          <ReceiptBadge
                            receiptUrl={charge.receiptUrl}
                            title={`${tenant.name} · ${money(charge.amount)}`}
                            subtitle={periodLabel(charge.period)}
                          />
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {tenant.otherLeases.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{lease ? "Otros contratos" : "Contratos anteriores"}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {tenant.otherLeases.map((other) => (
                <li key={other.id} className="space-y-2 py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link href={`/unidades/${other.unitId}`} className="font-medium hover:underline">
                      {other.buildingName} · {other.unitCode}
                    </Link>
                    <StatusBadge tone={LEASE_STATUS_TONES[other.status]}>
                      {LEASE_STATUS_LABELS[other.status]}
                    </StatusBadge>
                  </div>
                  <p className="text-muted-foreground text-xs tabular-nums">
                    {shortDate(other.startDate)} — {shortDate(other.endDate)} ·{" "}
                    {money(other.rentAmount, other.currency)} · día {other.paymentDay}
                  </p>
                  {other.notes ? (
                    <p className="text-muted-foreground text-xs whitespace-pre-line text-pretty">
                      {other.notes}
                    </p>
                  ) : null}
                  {editable ? (
                    <LeaseActions
                      lease={other}
                      label={`${other.buildingName} · ${other.unitCode}`}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-pretty">{value}</dd>
    </div>
  );
}
