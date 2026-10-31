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
import { ROLE_LABELS, SUPPORT_ACTOR_LABEL } from "@/lib/labels";
import { recentSupportSessions } from "@/lib/queries/support";
import { ReadOnlyNotice } from "@/components/layout/read-only-notice";
import { SupportBanner } from "@/components/layout/support-banner";
import { SupportNotice } from "@/components/layout/support-notice";
import { SessionMonitor } from "@/components/layout/session-monitor";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { session, db } = await requireOrgUser(["OWNER", "ADMIN", "VIEWER"]);
  // Contratos vencidos y cobros atrasados se marcan al abrir (máx. 1 vez/hora).
  await sweepOrgSafely(session.orgId);
  const org = await requireCurrentOrg();

  // En modo soporte, la barra con la salida; para el dueño y el equipo
  // administrativo, el aviso de quién de la plataforma entró.
  const support = session.support && session.supportSessionId ? session.support : null;
  const supportSessions =
    !support && (session.role === "OWNER" || session.role === "ADMIN")
      ? await recentSupportSessions(db)
      : [];

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
          support: Boolean(support),
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
            {support ? SUPPORT_ACTOR_LABEL : ROLE_LABELS[session.role]}
          </span>
        </header>

        {support ? (
          <SupportBanner orgName={org.name} expiresAt={new Date(support.expiresAt * 1000)} />
        ) : null}
        <SupportNotice sessions={supportSessions} />
        {session.role === "VIEWER" ? <ReadOnlyNotice /> : null}

        <main className="flex-1 space-y-6 p-4 sm:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
