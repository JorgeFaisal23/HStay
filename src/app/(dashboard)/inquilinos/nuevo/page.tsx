import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { requireOrgUser } from "@/lib/auth/session";
import { getAssignableUnits } from "@/lib/queries/tenants";
import { NewTenantForm } from "./new-tenant-form";
import { canEmailLinks } from "@/server/auth/links";
import { UserQuotaNote } from "@/components/shared/user-quota-note";
import { userQuota } from "@/server/user-quota";

export const metadata: Metadata = { title: "Nuevo inquilino" };

export default async function NewTenantPage({
  searchParams,
}: {
  searchParams: Promise<{ unidad?: string }>;
}) {
  const { db } = await requireOrgUser(["OWNER", "ADMIN"]);
  const { unidad } = await searchParams;
  const [units, quota] = await Promise.all([getAssignableUnits(db), userQuota(db)]);

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
        title="Nuevo inquilino"
        description="Se crea su perfil y su acceso al portal. Si ya sabes qué unidad ocupará, puedes registrar el contrato en el mismo paso."
      />

      {quota.full ? <UserQuotaNote active={quota.active} max={quota.max} /> : null}

      <Card className="max-w-3xl">
        <CardContent>
          <NewTenantForm units={units} defaultUnitId={unidad} canInvite={await canEmailLinks()} />
        </CardContent>
      </Card>
    </>
  );
}
