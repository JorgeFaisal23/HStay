import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, Mail, Phone, UserPlus, Users } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { ButtonLink } from "@/components/shared/button-link";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { requireUser } from "@/lib/auth/session";
import { canEdit } from "@/lib/permissions";
import { getTenants } from "@/lib/queries/tenants";
import { deadlineLabel, initials, money, shortDate } from "@/lib/format";
import { CHARGE_STATUS_LABELS, CHARGE_STATUS_TONES } from "@/lib/labels";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Inquilinos" };

export default async function TenantsPage() {
  const session = await requireUser(["OWNER", "ADMIN"]);
  const tenants = await getTenants(session.organizationId);
  const editable = canEdit(session.role);

  const withLease = tenants.filter((t) => t.hasLease).length;

  return (
    <>
      <PageHeader
        title="Inquilinos"
        description={
          tenants.length === 0
            ? "Aquí vivirán los perfiles de tus inquilinos y huéspedes."
            : `${tenants.length} ${tenants.length === 1 ? "perfil" : "perfiles"} · ${withLease} con contrato vigente.`
        }
        action={
          editable ? (
            <ButtonLink href="/inquilinos/nuevo">
              <UserPlus className="size-4" aria-hidden />
              Nuevo inquilino
            </ButtonLink>
          ) : null
        }
      />

      {tenants.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Todavía no hay inquilinos"
          description="Al dar de alta un inquilino se crea su perfil y su acceso al portal, donde podrá consultar su contrato y sus pagos."
          actions={
            editable ? (
              <ButtonLink href="/inquilinos/nuevo" size="sm">
                Dar de alta al primero
              </ButtonLink>
            ) : undefined
          }
        />
      ) : (
        <Card>
          <CardContent>
            <ul className="divide-y">
              {tenants.map((tenant) => (
                <li key={tenant.id}>
                  {/* Rejilla de columnas fijas: el aviso de vencimiento vive
                      dentro de la columna del contrato, así una fila con aviso
                      y otra sin él siguen alineadas. */}
                  <Link
                    href={`/inquilinos/${tenant.id}`}
                    className="hover:bg-accent/60 -mx-2 grid grid-cols-1 gap-x-4 gap-y-2 rounded-md px-2 py-3 transition sm:grid-cols-[minmax(0,1fr)_15rem_9rem] sm:items-center"
                  >
                    {/* ------------------------------------------- persona */}
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar className="size-10">
                        <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                          {initials(tenant.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{tenant.name}</p>
                        <p className="text-muted-foreground flex flex-wrap items-center gap-x-3 text-xs">
                          <span className="inline-flex items-center gap-1">
                            <Mail className="size-3" aria-hidden />
                            {tenant.email ?? "Sin correo"}
                          </span>
                          {tenant.phone ? (
                            <span className="inline-flex items-center gap-1">
                              <Phone className="size-3" aria-hidden />
                              {tenant.phone}
                            </span>
                          ) : null}
                        </p>
                      </div>
                    </div>

                    {/* ------------------------------------------ contrato */}
                    <div className="min-w-0 text-sm">
                      {tenant.hasLease ? (
                        <>
                          <p className="truncate font-medium">
                            {tenant.buildingName} · {tenant.unitCode}
                          </p>
                          <p className="text-xs tabular-nums">
                            <span className="text-muted-foreground">
                              {money(tenant.rentAmount)}
                            </span>
                            <span className="text-muted-foreground"> · </span>
                            <ContractDeadline
                              daysLeft={tenant.daysLeft}
                              endDate={tenant.endDate!}
                            />
                          </p>
                        </>
                      ) : (
                        <p className="text-muted-foreground text-xs">
                          Sin unidad asignada
                        </p>
                      )}
                    </div>

                    {/* --------------------------------- estado del cobro */}
                    <div className="sm:justify-self-end">
                      {!tenant.hasLease ? (
                        <StatusBadge tone="neutral">Sin contrato</StatusBadge>
                      ) : tenant.currentChargeStatus ? (
                        <StatusBadge
                          tone={CHARGE_STATUS_TONES[tenant.currentChargeStatus]}
                        >
                          {CHARGE_STATUS_LABELS[tenant.currentChargeStatus]}
                        </StatusBadge>
                      ) : (
                        <span className="text-muted-foreground text-xs">
                          Sin cargo este mes
                        </span>
                      )}
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

/**
 * Vencimiento del contrato dentro de la línea de datos.
 *
 * Cuando falta poco, la propia frase se tiñe y gana un icono en lugar de
 * mostrarse como etiqueta aparte: así el aviso no empuja al resto de la fila y
 * las filas con y sin aviso quedan alineadas. El color nunca va solo, siempre
 * acompaña al texto.
 */
function ContractDeadline({
  daysLeft,
  endDate,
}: {
  daysLeft: number | null;
  endDate: Date;
}) {
  if (daysLeft === null || daysLeft > 60) {
    return (
      <span className="text-muted-foreground">hasta el {shortDate(endDate)}</span>
    );
  }

  const urgent = daysLeft <= 30;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-medium",
        urgent
          ? "text-rose-600 dark:text-rose-400"
          : "text-amber-600 dark:text-amber-400",
      )}
    >
      <CalendarClock className="size-3 shrink-0" aria-hidden />
      {deadlineLabel(daysLeft)}
    </span>
  );
}
