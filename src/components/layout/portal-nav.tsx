"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { logout } from "@/app/login/actions";

export type NavLink = { href: string; label: string };

const TENANT_LINKS: NavLink[] = [
  { href: "/portal", label: "Mi vivienda" },
  { href: "/portal/pagos", label: "Mis pagos" },
  { href: "/portal/servicios", label: "Servicios" },
  { href: "/portal/reportes", label: "Reportes" },
  { href: "/portal/cuenta", label: "Mi cuenta" },
];

/**
 * Navegación de las vistas sin menú lateral: el portal del inquilino y "Mis
 * tareas" de Operación. En celular el menú de la cuenta hace de navegación.
 */
export function PortalNav({
  userName,
  links = TENANT_LINKS,
  roleLabel = "Inquilino",
}: {
  userName: string;
  links?: NavLink[];
  roleLabel?: string;
}) {
  const LINKS = links;
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-1">
      <nav className="hidden items-center gap-1 sm:flex">
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm transition-colors",
              pathname === link.href
                ? "bg-primary/10 text-primary font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-accent",
            )}
          >
            {link.label}
          </Link>
        ))}
      </nav>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon" aria-label="Mi cuenta">
              <Avatar className="size-7">
                <AvatarFallback className="bg-primary/10 text-primary text-2xs font-semibold">
                  {initials(userName)}
                </AvatarFallback>
              </Avatar>
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel className="font-normal">
            <p className="text-sm font-medium">{userName}</p>
            <p className="text-muted-foreground text-xs">{roleLabel}</p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {/* En celular el menú también hace de navegación. */}
          <div className="sm:hidden">
            {LINKS.map((link) => (
              <DropdownMenuItem key={link.href} render={<Link href={link.href} />}>
                {link.label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
          </div>
          <DropdownMenuItem
            onClick={() => {
              void logout();
            }}
          >
            <LogOut className="size-4" aria-hidden />
            Cerrar sesión
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
