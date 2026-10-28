import Link from "next/link";
import { BrandLogo } from "@/components/shared/brand-logo";
import { PortalNav } from "@/components/layout/portal-nav";
import { AppSignature } from "@/components/shared/app-signature";
import { SessionMonitor } from "@/components/layout/session-monitor";
import { requireOrgUser } from "@/lib/auth/session";
import { requireCurrentOrg } from "@/lib/org";
import { ROLE_LABELS } from "@/lib/labels";

const LINKS = [
  { href: "/propietario", label: "Mis propiedades" },
  { href: "/propietario/cuenta", label: "Mi cuenta" },
];

/**
 * Vista del propietario del inmueble: sin menú lateral y de solo lectura.
 * Solo el estado de cuenta de sus propiedades; nada de nombres de inquilinos.
 */
export default async function PropertyOwnerLayout({ children }: { children: React.ReactNode }) {
  const { session } = await requireOrgUser(["PROPERTY_OWNER"]);
  const org = await requireCurrentOrg();

  return (
    <div className="flex min-h-svh flex-col">
      <SessionMonitor />
      <header className="glass sticky top-0 z-10">
        <div className="mx-auto flex h-14 w-full max-w-4xl items-center gap-3 px-4">
          <Link href="/propietario" className="flex min-w-0 items-center gap-2.5">
            <BrandLogo brandName={org.brandName} logoUrl={org.logoUrl} size="sm" />
            <span className="truncate font-semibold">{org.brandName}</span>
          </Link>
          <div className="ml-auto">
            <PortalNav userName={session.name} links={LINKS} roleLabel={ROLE_LABELS.PROPERTY_OWNER} />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 space-y-6 p-4 sm:p-6">{children}</main>
      <footer className="text-muted-foreground mx-auto flex w-full max-w-4xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-xs">
        {org.contactEmail || org.contactPhone ? (
          <p className="text-pretty">
            ¿Dudas sobre tu estado de cuenta? Escribe a{" "}
            {org.contactEmail ? (
              <a href={`mailto:${org.contactEmail}`} className="underline">
                {org.contactEmail}
              </a>
            ) : null}
            {org.contactEmail && org.contactPhone ? " o llama al " : ""}
            {org.contactPhone ? (
              <a href={`tel:${org.contactPhone}`} className="underline">
                {org.contactPhone}
              </a>
            ) : null}
            .
          </p>
        ) : null}
        <AppSignature className="ml-auto" />
      </footer>
    </div>
  );
}
