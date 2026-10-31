import { AppSidebar } from "@/components/layout/app-sidebar";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { requireOrgUser } from "@/lib/auth/session";
import { requireCurrentOrg } from "@/lib/org";
import { sweepOrgSafely } from "@/lib/db/sweep";
import { ROLE_LABELS } from "@/lib/labels";
import { ReadOnlyNotice } from "@/components/layout/read-only-notice";
import { SessionMonitor } from "@/components/layout/session-monitor";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { session } = await requireOrgUser(["OWNER", "ADMIN", "VIEWER"]);
  // Contratos vencidos y cobros atrasados se marcan al abrir (máx. 1 vez/hora).
  await sweepOrgSafely(session.orgId);
  const org = await requireCurrentOrg();

  return (
    <SidebarProvider>
      <SessionMonitor />
      <AppSidebar
        brandName={org.brandName}
        logoUrl={org.logoUrl}
        user={{
          name: session.name,
          email: session.email,
          role: session.role,
        }}
        isPremiumPlan={org.plan === "PREMIUM"}
      />
      <SidebarInset>
        <header className="glass sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-1 h-4" />
          <span className="text-muted-foreground truncate text-sm">
            {org.name}
          </span>
          <span className="text-muted-foreground/60 ml-auto hidden text-xs sm:inline">
            {ROLE_LABELS[session.role]}
          </span>
        </header>

        {session.role === "VIEWER" ? <ReadOnlyNotice /> : null}

        <main className="flex-1 space-y-6 p-4 sm:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
