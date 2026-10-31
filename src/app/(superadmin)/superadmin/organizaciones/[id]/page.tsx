import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { BrandLogo } from "@/components/shared/brand-logo";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireSuperadmin } from "@/lib/auth/session";
import { getOrganizationDetail } from "@/server/superadmin/queries";
import { ROLE_LABELS } from "@/lib/labels";
import { shortDate } from "@/lib/format";
import { SupportActions } from "@/components/superadmin/support-actions";
import {
  OrganizationDetailsForm,
  PlanControl,
  UserQuotaControl,
  StatusControl,
} from "./org-controls";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  await requireSuperadmin();
  const { id } = await params;
  const org = await getOrganizationDetail(id);
  return { title: org?.name ?? "Arrendadora" };
}

export default async function OrganizationPage({ params }: Params) {
  await requireSuperadmin();
  const { id } = await params;
  const org = await getOrganizationDetail(id);
  if (!org) notFound();

  const loginPath = `/a/${org.slug}/login`;
  const used = org.activeUsers;
  const overQuota = used.total > org.maxUsers;

  return (
    <>
      <Link
        href="/superadmin"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Arrendadoras
      </Link>

      <div className="flex items-start gap-3">
        <BrandLogo brandName={org.brandName} logoUrl={org.logoUrl} size="lg" />
        <PageHeader
          className="flex-1"
          title={org.name}
          description={`Cliente desde el ${shortDate(org.createdAt)}. Marca: ${org.brandName}.`}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <StatusBadge tone={org.status === "ACTIVE" ? "success" : "danger"}>
          {org.status === "ACTIVE" ? "Acceso activo" : "Acceso suspendido"}
        </StatusBadge>
        <StatusBadge tone={org.plan === "PREMIUM" ? "info" : "neutral"}>
          {org.plan === "PREMIUM" ? "Premium" : "Plan gratuito"}
        </StatusBadge>
        <Link
          href={loginPath}
          target="_blank"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs underline-offset-4 hover:underline"
        >
          {loginPath}
          <ExternalLink className="size-3" aria-hidden />
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Count label="Propiedades" value={org.buildings} />
        <Count label="Unidades" value={org.units} />
        <Count label="Contratos vigentes" value={org.activeLeases} />
        <Count label="Inquilinos" value={org.tenants} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Usuarios contratados</CardTitle>
          <CardDescription>
            El software se cobra por usuario. Cada cuenta activa ocupa un lugar;
            las desactivadas no cuentan. Solo la plataforma cambia este número.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            <p className="text-2xl font-semibold tabular-nums">
              {used.total}
              <span className="text-muted-foreground text-base font-normal">
                {" "}
                de {org.maxUsers} en uso
              </span>
            </p>
            <p className="text-muted-foreground text-sm tabular-nums">
              {used.owner} {used.owner === 1 ? "dueño" : "dueños"} · {used.staff} de equipo ·{" "}
              {used.tenants} {used.tenants === 1 ? "inquilino" : "inquilinos"}
              {used.propertyOwners > 0
                ? ` · ${used.propertyOwners} ${used.propertyOwners === 1 ? "propietario" : "propietarios"}`
                : null}
            </p>
            {overQuota ? (
              <StatusBadge tone="warning">
                {used.total - org.maxUsers} por encima de lo contratado
              </StatusBadge>
            ) : null}
          </div>
          <UserQuotaControl orgId={org.id} maxUsers={org.maxUsers} activeUsers={used.total} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Datos</CardTitle>
            <CardDescription>
              Nombre interno y el identificador de su acceso con marca. La marca
              visible (logo, color) la configura el dueño.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <OrganizationDetailsForm orgId={org.id} name={org.name} slug={org.slug} />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Plan</CardTitle>
              <CardDescription>
                {org.plan === "PREMIUM"
                  ? "Sin límite de propiedades ni unidades; con reportes y bitácora. No cambia los usuarios contratados."
                  : "Plan gratuito: las secciones Premium se ven bloqueadas."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PlanControl orgId={org.id} plan={org.plan} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Acceso</CardTitle>
              <CardDescription>
                {org.status === "ACTIVE"
                  ? "Suspender saca a todos sus usuarios y les impide entrar. No borra nada."
                  : "Nadie de esta arrendadora puede entrar. Sus datos siguen intactos."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <StatusControl orgId={org.id} name={org.name} status={org.status} />
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Equipo</CardTitle>
          <CardDescription>
            Personas con acceso al panel de la arrendadora. La plataforma da
            soporte a cualquiera de ellas; cada intervención queda en su bitácora.{" "}
            <Link
              href={`/superadmin/usuarios?org=${org.id}&rol=TENANT`}
              className="text-foreground underline-offset-4 hover:underline"
            >
              Ver inquilinos
            </Link>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {org.staff.map((member) => (
              <li
                key={member.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{member.name}</p>
                  <p className="text-muted-foreground truncate text-xs">
                    {member.email ?? "Sin correo"} · alta el {shortDate(member.createdAt)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone={member.active ? "success" : "neutral"}>
                    {ROLE_LABELS[member.role]}
                    {member.active ? "" : " · inactivo"}
                  </StatusBadge>
                  {member.lockedUntil ? (
                    <StatusBadge tone="danger">Acceso bloqueado</StatusBadge>
                  ) : null}
                  <SupportActions account={member} />
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <Card className="gap-0 py-4">
      <CardContent className="px-5">
        <p className="text-muted-foreground text-sm">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}
