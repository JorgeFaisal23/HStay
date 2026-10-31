import type { Metadata } from "next";
import Link from "next/link";
import { Building2, PauseCircle, Plus, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { ButtonLink } from "@/components/shared/button-link";
import { BrandLogo } from "@/components/shared/brand-logo";
import { Card, CardContent } from "@/components/ui/card";
import { requireSuperadmin } from "@/lib/auth/session";
import { listOrganizations } from "@/server/superadmin/queries";
import { shortDate } from "@/lib/format";

export const metadata: Metadata = { title: "Arrendadoras" };

export default async function SuperadminHomePage() {
  await requireSuperadmin();
  const orgs = await listOrganizations();

  const active = orgs.filter((o) => o.status === "ACTIVE").length;
  const premium = orgs.filter((o) => o.plan === "PREMIUM").length;
  const suspended = orgs.length - active;

  return (
    <>
      <PageHeader
        title="Arrendadoras"
        description="Los clientes de la plataforma. Desde aquí se dan de alta, se cambia su plan y se suspende o reactiva su acceso."
        action={
          <ButtonLink href="/superadmin/organizaciones/nueva">
            <Plus className="size-4" aria-hidden />
            Nueva arrendadora
          </ButtonLink>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Activas" value={String(active)} icon={Building2} tone="brand" />
        <StatCard label="En Premium" value={String(premium)} icon={Sparkles} />
        <StatCard
          label="Suspendidas"
          value={String(suspended)}
          icon={PauseCircle}
          tone={suspended > 0 ? "danger" : "default"}
        />
      </div>

      {orgs.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="Todavía no hay arrendadoras"
          description="Da de alta la primera: se crea con su dueño y una contraseña temporal para que entre."
          actions={
            <ButtonLink href="/superadmin/organizaciones/nueva" size="sm">
              Nueva arrendadora
            </ButtonLink>
          }
        />
      ) : (
        <Card>
          <CardContent>
            <ul className="divide-y">
              {orgs.map((org) => (
                <li key={org.id}>
                  <Link
                    href={`/superadmin/organizaciones/${org.id}`}
                    className="hover:bg-accent/50 -mx-2 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md px-2 py-3"
                  >
                    <BrandLogo brandName={org.brandName} logoUrl={org.logoUrl} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{org.name}</p>
                      <p className="text-muted-foreground truncate text-xs">
                        /a/{org.slug}/login · alta el {shortDate(org.createdAt)}
                      </p>
                    </div>
                    <p className="text-muted-foreground text-xs tabular-nums">
                      {count(org.buildings, "propiedad", "propiedades")} ·{" "}
                      {count(org.units, "unidad", "unidades")} ·{" "}
                      {count(org.activeLeases, "contrato", "contratos")} ·{" "}
                      {org.activeUsers} de {org.maxUsers} usuarios
                    </p>
                    <div className="flex gap-2">
                      {org.activeUsers > org.maxUsers ? (
                        <StatusBadge tone="warning">Excede lo contratado</StatusBadge>
                      ) : null}
                      <StatusBadge tone={org.plan === "PREMIUM" ? "info" : "neutral"}>
                        {org.plan === "PREMIUM" ? "Premium" : "Gratuito"}
                      </StatusBadge>
                      <StatusBadge tone={org.status === "ACTIVE" ? "success" : "danger"}>
                        {org.status === "ACTIVE" ? "Activa" : "Suspendida"}
                      </StatusBadge>
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

function count(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}
