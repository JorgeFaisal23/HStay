"use client";

import { ChevronDown, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PremiumBadge } from "@/components/premium/premium-badge";

/**
 * Descargas en CSV (se abren en Excel). Los enlaces van a
 * /reportes/exportar/{tipo}; sin Premium el botón queda deshabilitado y lo
 * explica el distintivo.
 */
export function ExportMenu({
  enabled,
  months,
}: {
  enabled: boolean;
  /** Periodos ofrecidos para cobros y gastos, con su nombre. */
  months: { period: string; label: string }[];
}) {
  if (!enabled) {
    return (
      <Button variant="outline" disabled>
        <Download className="size-4" aria-hidden />
        Exportar
        <PremiumBadge />
      </Button>
    );
  }

  const link = (href: string, label: string) => (
    <DropdownMenuItem key={href} render={<a href={href} download />}>
      {label}
    </DropdownMenuItem>
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline">
            <Download className="size-4" aria-hidden />
            Exportar
            <ChevronDown className="size-4" aria-hidden />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
          CSV, se abre en Excel
        </DropdownMenuLabel>
        {link("/reportes/exportar/pendientes", "Pendientes de hoy")}
        <DropdownMenuSeparator />
        {months.map((m) => link(`/reportes/exportar/cobros?mes=${m.period}`, `Cobros de ${m.label}`))}
        <DropdownMenuSeparator />
        {months.map((m) => link(`/reportes/exportar/gastos?mes=${m.period}`, `Gastos de ${m.label}`))}
        <DropdownMenuSeparator />
        {link("/reportes/exportar/propietarios", "Cuentas de propietarios")}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
