import type { Metadata } from "next";
import Link from "next/link";
import { KeyRound } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Amount } from "@/components/shared/amount";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { UserQuotaNote } from "@/components/shared/user-quota-note";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOrgUser } from "@/lib/auth/session";
import { getOwnersBoard } from "@/lib/queries/owners";
import { userQuota } from "@/server/user-quota";
import { CreateOwnerDialog, OwnerRowActions } from "./owner-controls";

export const metadata: Metadata = { title: "Propietarios" };

/**
 * Dueños de los inmuebles que administra la arrendadora, con lo pendiente de
 * entregarle a cada uno. El detalle y las entregas están en su ficha.
 */
export default async function OwnersPage() {
  const { db } = await requireOrgUser(["OWNER", "ADMIN"]);
  const [owners, quota] = await Promise.all([getOwnersBoard(db), userQuota(db)]);

  return (
    <>
      <PageHeader
        title="Propietarios"
        description="Dueños de los inmuebles que administras: lo cobrado, lo gastado y lo pendiente de entregarles."
        action={<CreateOwnerDialog atLimit={quota.full} />}
      />

      <UserQuotaNote active={quota.active} max={quota.max} />

      <Card>
        <CardHeader>
          <CardTitle>Propietarios con acceso</CardTitle>
          <CardDescription>
            Cada propietario ve solo el estado de cuenta de sus propiedades, sin nombres de inquilinos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {owners.length === 0 ? (
            <EmptyState
              icon={KeyRound}
              title="Aún no hay propietarios"
              description="Si administras inmuebles de otras personas, agrégalas para rendirles cuentas. Las propiedades sin propietario son de tu arrendadora."
            />
          ) : (
            <ul className="divide-y">
              {owners.map((owner) => (
                <li
                  key={owner.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <Link
                    href={`/propietarios/${owner.id}`}
                    className="hover:bg-accent/60 -mx-2 min-w-0 flex-1 rounded-lg px-2 py-1 transition-colors"
                  >
                    <p className="truncate text-sm font-medium">{owner.name}</p>
                    <p className="text-muted-foreground truncate text-xs">
                      {owner.buildings.length === 0
                        ? "Sin propiedades asignadas"
                        : owner.buildings.map((b) => b.name).join(" · ")}
                    </p>
                  </Link>
                  <div className="flex flex-wrap items-center gap-3">
                    {owner.buildings.length > 0 ? (
                      <span className="text-right text-sm">
                        <Amount value={owner.pending} tone={owner.pending < 0 ? "danger" : undefined} />
                        <span className="text-muted-foreground block text-xs">
                          {owner.pending < 0 ? "entregado de más" : "por entregar"}
                        </span>
                      </span>
                    ) : null}
                    {owner.active ? null : <StatusBadge tone="neutral">Desactivado</StatusBadge>}
                    <OwnerRowActions
                      // Un propietario siempre tiene correo (CHECK en la base).
                      owner={{ id: owner.id, name: owner.name, email: owner.email ?? "", active: owner.active }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
