"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Banknote,
  Building2,
  CalendarCheck,
  CalendarRange,
  FileSignature,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  Palette,
  Plug,
  Receipt,
  Sparkles,
  Users,
  Users2,
  BarChart3,
  Wrench,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { BrandLogo } from "@/components/shared/brand-logo";
import { AppSignature } from "@/components/shared/app-signature";
import { PremiumBadge } from "@/components/premium/premium-badge";
import { canAccessPath } from "@/lib/permissions";
import { SHOW_AIRBNB_INTEGRATION } from "@/lib/features";
import type { Role } from "@/lib/auth/jwt";
import { UserMenu } from "./user-menu";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  premium?: boolean;
  /** Si es false, la entrada no se muestra (ver src/lib/features.ts). */
  enabled?: boolean;
};

const MAIN_NAV: NavItem[] = [
  { href: "/hoy", label: "Hoy", icon: ListChecks },
  { href: "/dashboard", label: "Resumen", icon: LayoutDashboard },
  { href: "/edificios", label: "Propiedades", icon: Building2 },
  { href: "/calendario", label: "Calendario", icon: CalendarRange },
  { href: "/reservas", label: "Reservas", icon: CalendarCheck },
  { href: "/tareas", label: "Tareas", icon: Wrench },
  { href: "/servicios", label: "Servicios", icon: Receipt },
  { href: "/pagos", label: "Cobros", icon: Banknote },
  { href: "/inquilinos", label: "Inquilinos", icon: Users },
  { href: "/propietarios", label: "Propietarios", icon: KeyRound },
  { href: "/contratos", label: "Contratos", icon: FileSignature },
  { href: "/equipo", label: "Equipo", icon: Users2 },
  {
    href: "/integraciones",
    label: "Integraciones",
    icon: Plug,
    enabled: SHOW_AIRBNB_INTEGRATION,
  },
];

const PREMIUM_NAV: NavItem[] = [
  { href: "/reportes", label: "Reportes", icon: BarChart3, premium: true },
];

export function AppSidebar({
  brandName,
  logoUrl,
  user,
  isPremiumPlan,
}: {
  brandName: string;
  logoUrl: string | null;
  /** `support`: el staff de la plataforma en modo soporte. */
  user: { name: string; email: string; role: Role; support?: boolean };
  isPremiumPlan: boolean;
}) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  // El rol de consulta solo ve lo que puede abrir: mostrarle entradas que lo
  // rebotarían al hacer clic sería confuso.
  const mainItems = MAIN_NAV.filter(
    (item) => item.enabled !== false && canAccessPath(user.role, item.href, { support: user.support }),
  );
  const showPremium = user.role !== "VIEWER";

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2.5 px-1 py-1.5">
          <BrandLogo brandName={brandName} logoUrl={logoUrl} size="sm" />
          <div className="grid flex-1 leading-tight group-data-[collapsible=icon]:hidden">
            <span className="truncate text-sm font-semibold">{brandName}</span>
            <span className="text-muted-foreground truncate text-xs">
              {isPremiumPlan ? "Plan Premium" : "Plan gratuito"}
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Gestión</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    isActive={isActive(item.href)}
                    tooltip={item.label}
                    render={<Link href={item.href} />}
                  >
                    <item.icon aria-hidden />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {showPremium ? (
          <SidebarGroup>
            <SidebarGroupLabel>Premium</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {PREMIUM_NAV.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={isActive(item.href)}
                      tooltip={item.label}
                      render={<Link href={item.href} />}
                    >
                      <item.icon aria-hidden />
                      <span>{item.label}</span>
                      {!isPremiumPlan ? <PremiumBadge /> : null}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={isActive("/premium")}
                    tooltip="Planes"
                    render={<Link href="/premium" />}
                  >
                    <Sparkles aria-hidden />
                    <span>Planes</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}

        {user.role === "OWNER" ? (
          <SidebarGroup className="mt-auto">
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={isActive("/configuracion/marca")}
                    tooltip="Personalización"
                    render={<Link href="/configuracion/marca" />}
                  >
                    <Palette aria-hidden />
                    <span>Personalización</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}
      </SidebarContent>

      <SidebarFooter>
        <UserMenu user={user} />
        {/* El encabezado del menú lleva la marca del arrendador; el pie dice
            con qué software está trabajando. Se oculta al colapsar porque en
            modo icono no hay ancho para texto. */}
        <AppSignature
          showVersion
          className="px-2 pb-1 group-data-[collapsible=icon]:hidden"
        />
      </SidebarFooter>
    </Sidebar>
  );
}
