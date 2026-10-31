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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Amount } from "@/components/shared/amount";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { ButtonLink } from "@/components/shared/button-link";
import { ReceiptBadge } from "@/components/payments/receipt-viewer";
import { Callout } from "@/components/shared/callout";
import { TenantControls } from "./tenant-controls";
import { LeaseActions } from "@/components/leases/lease-actions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { requireOrgUser } from "@/lib/auth/session";
import { canEdit } from "@/lib/permissions";
import { getTenantDetail } from "@/lib/queries/tenants";
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
  SERVICE_TYPE_LABELS,
} from "@/lib/labels";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { db } = await requireOrgUser(["OWNER", "ADMIN"]);
  const { id } = await params;
  const tenant = await getTenantDetail(db, id);
  return { title: tenant?.name ?? "Inquilino" };
}

export default async function TenantDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ acceso?: string }>;
}) {
  const { session, db } = await requireOrgUser(["OWNER", "ADMIN"]);
  const [{ id }, { acceso }] = await Promise.all([params, searchParams]);
  const tenant = await getTenantDetail(db, id);

  if (!tenant) notFound();

  const editable = canEdit(session.role);
  const lease = tenant.activeLease;
  const pendingCharges =
    tenant.charges.filter((c) => c.status !== "PAID");

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
            <ButtonLink href={`/inquilinos/asignar?inquilino=${tenant.id}`}>Asignar unidad</ButtonLink>
          ) : null
        }
      />

      {editable ? (
        <TenantControls
          tenant={{
            id: tenant.id,
            name: tenant.name,
            email: tenant.email,
            phone: tenant.phone,
            documentId: tenant.documentId,
            notes: tenant.notes,
            active: tenant.active,
          }}
        />
      ) : null}

      {!tenant.active ? (
        <Callout tone="warning" title="Acceso al portal desactivado">
          No puede entrar a su portal. Su historial se conserva.
        </Callout>
      ) : null}
      {acceso === "invitacion" ? (
        <Callout tone="success" title="Invitación enviada">
          Le enviamos a {tenant.email} un enlace para crear su contraseña y entrar a su portal.
        </Callout>
      ) : null}
      {acceso === "pendiente" ? (
        <Callout tone="warning" title="No se pudo enviar la invitación">
          Genera un acceso con el botón &quot;Acceso al portal&quot; para entregarle una contraseña temporal.
        </Callout>
      ) : null}

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
              <div className="min-w-0">
                <CardTitle className="truncate">{tenant.name}</CardTitle>
                <CardDescription>
                  Alta el {shortDate(tenant.createdAt)}
                </CardDescription>
              </div>
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
            {editable && lease ? (
              <LeaseActions
                lease={{
                  id: lease.id,
                  startDate: lease.startDate,
                  endDate: lease.endDate,
                  rentAmount: lease.rentAmount,
                  depositAmount: lease.depositAmount || null,
                  paymentDay: lease.paymentDay,
                  tenantName: tenant.name,
                }}
              />
            ) : null}
          </CardHeader>
          <CardContent>
            {!lease ? (
              <EmptyState
                icon={FileText}
                title="Sin contrato vigente"
                description="Este inquilino no tiene una unidad asignada actualmente."
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

                <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Detail label="Inicio" value={longDate(lease.startDate)} />
                  <Detail label="Vencimiento" value={longDate(lease.endDate)} />
                  <Detail label="Renta" value={money(lease.rentAmount)} />
                  <Detail
                    label="Depósito"
                    value={lease.depositAmount ? money(lease.depositAmount) : "—"}
                  />
                </dl>

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
            {editable && pendingCharges.length > 0 ? (
              <ButtonLink href="/pagos" variant="outline" size="sm">
                <CreditCard className="size-4" aria-hidden />
                Registrar pago
              </ButtonLink>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          {tenant.charges.length === 0 ? (
            <EmptyState
              icon={CreditCard}
              title="Sin cargos registrados"
              description="Los cargos de renta se generan cada mes desde la sección de Cobros."
            />
          ) : (
            <Table className="min-w-lg">
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Periodo</TableHead>
                  <TableHead scope="col">Vencimiento</TableHead>
                  <TableHead scope="col" className="text-right">Monto</TableHead>
                  <TableHead scope="col" className="text-right">Pagado</TableHead>
                  <TableHead scope="col" className="text-right">Estado</TableHead>
                  <TableHead scope="col">
                    <span className="sr-only">Comprobante</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenant.charges.map((charge) => (
                  <TableRow key={charge.id}>
                    <TableCell className="font-medium">
                      {periodLabel(charge.period)}
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {shortDate(charge.dueDate)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Amount value={charge.amount} />
                    </TableCell>
                    <TableCell className="text-muted-foreground text-right text-xs tabular-nums">
                      {charge.paidAt
                        ? `${shortDate(charge.paidAt)}${charge.method ? ` · ${charge.method}` : ""}`
                        : "—"}
                      {charge.status === "PARTIAL" ? (
                        <span className="block">
                          Abonado <Amount value={charge.paidAmount} />
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right">
                      <StatusBadge tone={CHARGE_STATUS_TONES[charge.status]}>
                        {CHARGE_STATUS_LABELS[charge.status]}
                      </StatusBadge>
                    </TableCell>
                    <TableCell className="text-right">
                      {charge.receiptUrl ? (
                        <ReceiptBadge
                          receiptUrl={charge.receiptUrl}
                          title={`${tenant.name} · ${money(charge.amount)}`}
                          subtitle={periodLabel(charge.period)}
                        />
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {tenant.pastLeases.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Contratos anteriores</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {tenant.pastLeases.map((past) => (
                <li
                  key={past.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0"
                >
                  <span>
                    {past.buildingName} · {past.unitCode}
                  </span>
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {shortDate(past.startDate)} — {shortDate(past.endDate)} ·{" "}
                    {LEASE_STATUS_LABELS[past.status]}
                    {past.endReason ? ` · ${past.endReason}` : ""}
                  </span>
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
