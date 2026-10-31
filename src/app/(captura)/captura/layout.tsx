import { BrandLogo } from "@/components/shared/brand-logo";
import { PortalNav } from "@/components/layout/portal-nav";
import { AppSignature } from "@/components/shared/app-signature";
import { SessionMonitor } from "@/components/layout/session-monitor";
import { requireOrgUser } from "@/lib/auth/session";
import { requireCurrentOrg } from "@/lib/org";
import { ROLE_LABELS } from "@/lib/labels";

const LINKS = [
  { href: "/captura", label: "Reservas" },
  { href: "/captura/cuenta", label: "Mi cuenta" },
];

/**
 * Vista de Captura: sin menú lateral y pensada también para el celular.
 * Solo las reservas de las propiedades que se le asignaron; nada de cobros,
 * inquilinos ni reportes (ver src/lib/capture.ts).
 */
export default async function CaptureLayout({ children }: { children: React.ReactNode }) {
  const { session } = await requireOrgUser(["CAPTURE"]);
  const org = await requireCurrentOrg();

  return (
    <div className="flex min-h-svh flex-col">
      <SessionMonitor />
      <header className="glass sticky top-0 z-10">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-3 px-4">
          <BrandLogo brandName={org.brandName} logoUrl={org.logoUrl} size="sm" />
          <span className="truncate font-semibold">{org.brandName}</span>
          <div className="ml-auto">
            <PortalNav userName={session.name} links={LINKS} roleLabel={ROLE_LABELS.CAPTURE} />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 p-4 sm:p-6">{children}</main>
      <footer className="text-muted-foreground mx-auto flex w-full max-w-5xl justify-end px-4 py-6 text-xs">
        <AppSignature />
      </footer>
    </div>
  );
}
