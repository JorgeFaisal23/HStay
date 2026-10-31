import type { Metadata } from "next";
import { Building2 } from "lucide-react";
import { Amounts } from "@/components/shared/amount";
import { totalByCurrency } from "@/lib/currency";
import { EmptyState } from "@/components/shared/empty-state";
import { OwnerStatementCard } from "@/components/owners/owner-statement-card";
import { requireOrgUser } from "@/lib/auth/session";
import { getMyOwnerAccount } from "@/lib/queries/owners";

export const metadata: Metadata = { title: "Mis propiedades" };

/**
 * Estado de cuenta del propietario: lo pendiente de entregarle por cada
 * propiedad suya, el detalle por mes y las entregas. Solo lectura.
 */
export default async function PropertyOwnerHomePage() {
  const { session, db } = await requireOrgUser(["PROPERTY_OWNER"]);
  const buildings = await getMyOwnerAccount(db, session.sub);
  const withStatement = buildings.filter((b) => b.statement);
  // Cada propiedad en su moneda: el total se lleva por moneda.
  const pending = totalByCurrency(withStatement, (b) => b.currency, (b) => b.statement?.pending ?? 0);
  const firstName = session.name.split(" ")[0];

  return (
    <>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">Hola, {firstName}</h1>
        {withStatement.length > 1 ? (
          <p className="text-muted-foreground text-sm text-pretty">
            Pendiente de entregarte en total: <Amounts value={pending} className="text-foreground" />
          </p>
        ) : (
          <p className="text-muted-foreground text-sm text-pretty">
            Lo cobrado, lo gastado y lo que se te ha entregado de tus propiedades.
          </p>
        )}
      </div>

      {withStatement.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="Aún no tienes propiedades asignadas"
          description="Cuando tu administrador asigne una propiedad a tu nombre, aquí verás su estado de cuenta."
        />
      ) : (
        withStatement.map((b) => (
          <OwnerStatementCard
            key={b.id}
            title={b.name}
            description={`${b.address}${b.city ? `, ${b.city}` : ""}`}
            statement={b.statement!}
            currency={b.currency}
            receiptHref={(payoutId) => `/propietario/entregas/${payoutId}/comprobante`}
          />
        ))
      )}
    </>
  );
}
