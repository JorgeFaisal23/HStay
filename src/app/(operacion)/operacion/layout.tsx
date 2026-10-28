import { BrandLogo } from "@/components/shared/brand-logo";
import { PortalNav } from "@/components/layout/portal-nav";
import { AppSignature } from "@/components/shared/app-signature";
import { SessionMonitor } from "@/components/layout/session-monitor";
import { requireOrgUser } from "@/lib/auth/session";
import { requireCurrentOrg } from "@/lib/org";
import { ROLE_LABELS } from "@/lib/labels";

const LINKS = [
  { href: "/operacion", label: "Mis tareas" },
  { href: "/operacion/cuenta", label: "Mi cuenta" },
];

/**
 * Vista del personal de Operación: sin menú lateral y pensada para el
 * celular. Solo sus tareas; nada de cobros ni de inquilinos.
 */
export default async function OperationsLayout({ children }: { children: React.ReactNode }) {
  const { session } = await requireOrgUser(["OPERATIONS"]);
  const org = await requireCurrentOrg();

  return (
    <div className="flex min-h-svh flex-col">
      <SessionMonitor />
      <header className="glass sticky top-0 z-10">
        <div className="mx-auto flex h-14 w-full max-w-2xl items-center gap-3 px-4">
          <BrandLogo brandName={org.brandName} logoUrl={org.logoUrl} size="sm" />
          <span className="truncate font-semibold">{org.brandName}</span>
          <div className="ml-auto">
            <PortalNav userName={session.name} links={LINKS} roleLabel={ROLE_LABELS.OPERATIONS} />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 p-4 sm:p-6">{children}</main>
      <footer className="text-muted-foreground mx-auto flex w-full max-w-2xl justify-end px-4 py-6 text-xs">
        <AppSignature />
      </footer>
    </div>
  );
}
