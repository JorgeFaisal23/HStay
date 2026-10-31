import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Building2 } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { ButtonLink } from "@/components/shared/button-link";
import { OwnerStatementCard } from "@/components/owners/owner-statement-card";
import { RecordPayoutDialog } from "@/components/owners/record-payout-dialog";
import { UndoPayoutButton } from "@/components/owners/undo-payout-button";
import { requireOrgUser } from "@/lib/auth/session";
import { getOwnerDetail } from "@/lib/queries/owners";
import { money, shortDate } from "@/lib/format";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { db } = await requireOrgUser(["OWNER", "ADMIN"]);
  const { id } = await params;
  const owner = await getOwnerDetail(db, id);
  return { title: owner?.name ?? "Propietario" };
}

/** Ficha del propietario: estado de cuenta de cada propiedad suya y sus entregas. */
export default async function OwnerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { db } = await requireOrgUser(["OWNER", "ADMIN"]);
  const { id } = await params;
  const owner = await getOwnerDetail(db, id);
  if (!owner) notFound();

  const contact = [owner.email, owner.phone].filter(Boolean).join(" · ");
  // Una sola acción sólida por pantalla: con varias propiedades, todas van en outline.
  const single = owner.buildings.length === 1;

  return (
    <>
      <Link
        href="/propietarios"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Propietarios
      </Link>

      <PageHeader
        title={owner.name}
        description={`${contact}. Lo pendiente de entregarle por cada propiedad suya.`}
        action={owner.active ? null : <StatusBadge tone="neutral">Acceso desactivado</StatusBadge>}
      />

      {owner.buildings.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="Sin propiedades asignadas"
          description="Abre la ficha de una propiedad y elige a este propietario en la sección Propietario."
          actions={
            <ButtonLink href="/edificios" size="sm" variant="outline">
              Ir a Propiedades
            </ButtonLink>
          }
        />
      ) : (
        owner.buildings.map((b) =>
          b.statement ? (
            <OwnerStatementCard
              key={b.id}
              title={b.name}
              description={`${b.units} ${b.units === 1 ? "unidad" : "unidades"}`}
              statement={b.statement}
              currency={b.currency}
              receiptHref={(payoutId) => `/propietarios/entregas/${payoutId}/comprobante`}
              actions={
                <>
                  <ButtonLink href={`/edificios/${b.id}`} variant="outline">
                    Ver propiedad
                  </ButtonLink>
                  <RecordPayoutDialog
                    buildingId={b.id}
                    buildingName={b.name}
                    ownerName={owner.name}
                    pending={b.statement.pending}
                    currency={b.currency}
                    variant={single ? "default" : "outline"}
                  />
                </>
              }
              payoutAction={(payout) => (
                <UndoPayoutButton
                  payoutId={payout.id}
                  description={`${money(payout.amount, b.currency)} del ${shortDate(payout.paidOn)}`}
                />
              )}
            />
          ) : null,
        )
      )}
    </>
  );
}
