import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, FileSignature } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ButtonLink } from "@/components/shared/button-link";
import { Card, CardContent } from "@/components/ui/card";
import { requireOrgUser } from "@/lib/auth/session";
import { getAssignableUnits, getTenantsWithoutLease } from "@/lib/queries/tenants";
import { NewLeaseForm } from "./new-lease-form";

export const metadata: Metadata = { title: "Nuevo contrato" };

/**
 * Contrato para un inquilino que ya está registrado. Se llega desde su ficha
 * (?inquilino=) o desde una unidad libre (?unidad=).
 */
export default async function NewLeasePage({
  searchParams,
}: {
  searchParams: Promise<{ inquilino?: string; unidad?: string }>;
}) {
  const { db } = await requireOrgUser(["OWNER", "ADMIN"]);
  const { inquilino, unidad } = await searchParams;
  const [tenants, units] = await Promise.all([getTenantsWithoutLease(db), getAssignableUnits(db)]);

  const back = inquilino ? `/inquilinos/${inquilino}` : unidad ? `/unidades/${unidad}` : "/inquilinos";

  return (
    <>
      <Link
        href={back}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Volver
      </Link>

      <PageHeader
        title="Nuevo contrato"
        description="Asigna una unidad libre a un inquilino que ya está registrado. Si es alguien nuevo, dalo de alta y registra el contrato en el mismo paso."
        action={
          <ButtonLink href={unidad ? `/inquilinos/nuevo?unidad=${unidad}` : "/inquilinos/nuevo"} variant="outline">
            Inquilino nuevo
          </ButtonLink>
        }
      />

      {tenants.length === 0 || units.length === 0 ? (
        <EmptyState
          icon={FileSignature}
          title={tenants.length === 0 ? "No hay inquilinos sin contrato" : "No hay unidades libres"}
          description={
            tenants.length === 0
              ? "Todos tus inquilinos activos ya tienen contrato. Da de alta uno nuevo."
              : "Todas las unidades tienen contrato vigente o están en mantenimiento."
          }
        />
      ) : (
        <Card className="max-w-3xl">
          <CardContent>
            <NewLeaseForm
              tenants={tenants}
              units={units}
              defaultTenantId={tenants.some((t) => t.id === inquilino) ? inquilino : undefined}
              defaultUnitId={units.some((u) => u.id === unidad) ? unidad : undefined}
              cancelHref={back}
            />
          </CardContent>
        </Card>
      )}
    </>
  );
}
