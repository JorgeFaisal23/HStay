import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { getBuildingsForSelect } from "@/lib/queries/properties";
import { requireOrgUser } from "@/lib/auth/session";
import { NewUnitForm } from "./new-unit-form";

export const metadata: Metadata = { title: "Nueva unidad" };

export default async function NewUnitPage({
  searchParams,
}: {
  searchParams: Promise<{ edificio?: string }>;
}) {
  const { db } = await requireOrgUser(["OWNER", "ADMIN"]);
  const { edificio } = await searchParams;
  const buildings = await getBuildingsForSelect(db);

  const backHref = edificio ? `/edificios/${edificio}` : "/edificios";

  return (
    <>
      <Link
        href={backHref}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Volver
      </Link>

      <PageHeader
        title="Nueva unidad"
        description="Da de alta un cuarto, departamento o local dentro de una de tus propiedades."
      />

      <Card className="max-w-2xl">
        <CardContent>
          <NewUnitForm buildings={buildings} defaultBuildingId={edificio} />
        </CardContent>
      </Card>
    </>
  );
}
