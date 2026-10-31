import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { requireSuperadmin } from "@/lib/auth/session";
import { NewOrganizationForm } from "./new-organization-form";

export const metadata: Metadata = { title: "Nueva arrendadora" };

export default async function NewOrganizationPage() {
  await requireSuperadmin();

  return (
    <>
      <Link
        href="/superadmin"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Arrendadoras
      </Link>

      <PageHeader
        title="Nueva arrendadora"
        description="Se crea la arrendadora con su dueño. El dueño entra con una contraseña temporal y desde ahí configura su marca, sus propiedades y su equipo."
      />

      <Card className="max-w-3xl">
        <CardContent>
          <NewOrganizationForm />
        </CardContent>
      </Card>
    </>
  );
}
