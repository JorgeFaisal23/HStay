import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { AppMark } from "@/components/shared/app-mark";
import { Card, CardContent } from "@/components/ui/card";
import { APP, APP_VERSION_LABEL } from "@/lib/app";
import { requireOrgUser } from "@/lib/auth/session";
import { requireCurrentOrg } from "@/lib/org";
import { BrandForm } from "./brand-form";

export const metadata: Metadata = { title: "Personalización" };

export default async function BrandPage() {
  await requireOrgUser(["OWNER"]);
  const org = await requireCurrentOrg();

  return (
    <>
      <PageHeader
        title="Personalización"
        description="Ajusta la identidad visual de tu arrendadora. Los cambios se aplican a todo: el panel, el portal de tus inquilinos y la pantalla de acceso."
      />

      {/* La pantalla edita la marca del arrendador, así que conviene decir aquí
          —donde surge la duda— qué parte de la identidad no se toca. */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <AppMark className="size-9" />
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="text-sm font-medium">
              {APP.name} · {APP.tagline}
            </p>
            <p className="text-muted-foreground text-sm text-pretty">
              {APP.name} es el software que estás usando; su nombre y su
              distintivo son fijos y aparecen solo en los márgenes. Lo que
              configuras abajo es la marca de tu arrendadora: es la que ven tus
              inquilinos en el portal y en la pantalla de acceso.
            </p>
          </div>
          <span className="text-muted-foreground shrink-0 text-xs">
            {APP_VERSION_LABEL}
          </span>
        </CardContent>
      </Card>

      <BrandForm
        initial={{
          brandName: org.brandName,
          logoUrl: org.logoUrl,
          primaryColor: org.primaryColor,
          radius: org.radius,
          fontFamily: org.fontFamily,
          contactEmail: org.contactEmail,
          contactPhone: org.contactPhone,
        }}
      />
    </>
  );
}
