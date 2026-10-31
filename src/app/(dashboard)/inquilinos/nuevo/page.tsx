import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { getAssignableUnits } from "@/lib/queries/tenants";
import { NewTenantForm } from "./new-tenant-form";

export const metadata: Metadata = { title: "Nuevo inquilino" };

export default async function NewTenantPage({
  searchParams,
}: {
  searchParams: Promise<{ unidad?: string }>;
}) {
  const session = await requireUser(["OWNER", "ADMIN"]);
  const { unidad } = await searchParams;
  const units = await getAssignableUnits(session.organizationId);

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

      <Card className="max-w-3xl">
        <CardContent>
          <NewTenantForm units={units} defaultUnitId={unidad} />
        </CardContent>
      </Card>
    </>
  );
}
