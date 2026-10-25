import type { Metadata } from "next";
import { Building2, MapPin, Plus } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Amount } from "@/components/shared/amount";
import { EmptyState } from "@/components/shared/empty-state";
import { ButtonLink } from "@/components/shared/button-link";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { getBuildingsOverview } from "@/lib/queries/properties";
import { requireOrgUser } from "@/lib/auth/session";
import { requireCurrentOrg } from "@/lib/org";
import { PlanUsage } from "@/components/shared/plan-usage";
import { canEdit } from "@/lib/permissions";
import { NewBuildingDialog } from "./new-building-dialog";

export const metadata: Metadata = { title: "Propiedades" };

export default async function BuildingsPage() {
  const { session, db } = await requireOrgUser(["OWNER", "ADMIN"]);
  const [buildings, org] = await Promise.all([getBuildingsOverview(db), requireCurrentOrg()]);
  const editable = canEdit(session.role);

  const totalUnits = buildings.reduce((sum, b) => sum + b.totalUnits, 0);
  const totalOccupied = buildings.reduce((sum, b) => sum + b.occupiedUnits, 0);

  return (
    <>
      <PageHeader
        title="Propiedades"
        description={
          buildings.length === 0
            ? "Registra tu primer inmueble para empezar."
            : `${buildings.length} ${buildings.length === 1 ? "propiedad" : "propiedades"} · ${totalOccupied} de ${totalUnits} unidades ocupadas.`
        }
        action={editable ? <NewBuildingDialog /> : null}
      />

      {buildings.length > 0 ? (
        <PlanUsage plan={org.plan} buildings={buildings.length} units={totalUnits} />
      ) : null}

      {buildings.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="Todavía no hay propiedades"
          description="Una propiedad es el inmueble que agrupa tus unidades en renta: un edificio, una casa o un local. Empieza por darla de alta y después agregas los cuartos."
          actions={editable ? <NewBuildingDialog /> : undefined}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {buildings.map((building) => (
            <Card key={building.id} className="flex flex-col">
              <CardContent className="flex flex-1 flex-col gap-4">
                <div className="space-y-1">
                  <h2 className="leading-tight font-semibold text-balance">
                    {building.name}
                  </h2>
                  <p className="text-muted-foreground flex items-start gap-1.5 text-sm">
                    <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    <span className="text-pretty">
                      {building.address}
                      {building.city ? `, ${building.city}` : ""}
                    </span>
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="text-muted-foreground">Ocupación</span>
                    <span className="font-medium tabular-nums">
                      {building.occupiedUnits}/{building.totalUnits} ·{" "}
                      {building.occupancyRate}%
                    </span>
                  </div>
                  <Progress value={building.occupancyRate} />
                </div>

                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-muted-foreground text-xs">
                      Renta mensual
                    </dt>
                    <dd className="font-medium tabular-nums">
                      <Amount value={building.monthlyRent} compact className="font-medium" />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">
                      Servicios del mes
                    </dt>
                    <dd className="font-medium tabular-nums">
                      {building.servicesThisMonth === 0
                        ? "Sin capturar"
                        : <Amount value={building.servicesThisMonth} className="font-medium" />}
                    </dd>
                  </div>
                </dl>

                <div className="mt-auto flex gap-2 pt-1">
                  <ButtonLink
                    href={`/edificios/${building.id}`}
                    variant="outline"
                    className="flex-1"
                  >
                    Ver unidades
                  </ButtonLink>
                  {editable ? (
                    <ButtonLink
                      href={`/unidades/nueva?edificio=${building.id}`}
                      variant="ghost"
                      aria-label={`Agregar unidad a ${building.name}`}
                    >
                      <Plus className="size-4" aria-hidden />
                    </ButtonLink>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
