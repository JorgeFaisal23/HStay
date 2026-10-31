import type { Metadata } from "next";
import Link from "next/link";
import { FileText } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Amount } from "@/components/shared/amount";
import { ComingSoon } from "@/components/premium/coming-soon-badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireOrgUser } from "@/lib/auth/session";
import { longDate, toNumber } from "@/lib/format";

export const metadata: Metadata = { title: "Contratos" };

export default async function ContractsPage() {
  const { db } = await requireOrgUser(["OWNER", "ADMIN"]);

  const leases = await db.lease.findMany({
    where: { status: "ACTIVE" },
    orderBy: { endDate: "asc" },
    select: {
      id: true,
      endDate: true,
      rentAmount: true,
      tenant: { select: { id: true, name: true } },
      unit: {
        select: { code: true, building: { select: { name: true, currency: true } } },
      },
    },
  });

  return (
    <>
      <PageHeader
        title="Contratos"
        description="Los contratos vigentes de todas tus propiedades, del más próximo a vencer al más lejano."
      />

      <ComingSoon
        title="Plantillas y firma digital"
        description="Generar el contrato en PDF desde tus propias cláusulas, con los datos de la unidad y del inquilino ya llenos, y recoger la firma desde el celular. Será parte del plan Premium."
        points={[
          "Mientras tanto, la vigencia, la renta y el depósito se registran en la ficha de cada inquilino.",
          "Renovar, terminar o cancelar un contrato se hace desde esa misma ficha.",
        ]}
      />

      <Card>
        <CardHeader>
          <CardTitle>Contratos vigentes</CardTitle>
          <CardDescription>
            {leases.length} {leases.length === 1 ? "contrato" : "contratos"}.
            Abre uno para ver sus cobros o cambiarlo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {leases.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No hay contratos vigentes"
              description="Asigna una unidad a un inquilino para registrar su contrato."
            />
          ) : (
            <ul className="divide-y">
              {leases.map((lease) => (
                <li key={lease.id}>
                  <Link
                    href={`/inquilinos/${lease.tenant.id}`}
                    className="hover:bg-accent/60 -mx-2 flex flex-wrap items-center justify-between gap-3 rounded-lg px-2 py-3 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{lease.tenant.name}</p>
                      <p className="text-muted-foreground text-xs">
                        {lease.unit.building.name} · Unidad {lease.unit.code} ·
                        hasta {longDate(lease.endDate)}
                      </p>
                    </div>
                    <Amount value={toNumber(lease.rentAmount)} currency={lease.unit.building.currency} className="text-sm" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
