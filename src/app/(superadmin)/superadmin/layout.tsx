import Link from "next/link";
import { LogOut } from "lucide-react";
import { AppWordmark } from "@/components/shared/app-mark";
import { SessionMonitor } from "@/components/layout/session-monitor";
import { Button } from "@/components/ui/button";
import { logout } from "@/app/login/actions";
import { requireSuperadmin } from "@/lib/auth/session";

/**
 * Panel de la plataforma. Layout propio y sobrio, con la marca del producto:
 * aquí no hay una arrendadora en contexto, se administran todas.
 */
export default async function SuperadminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSuperadmin();

  return (
    <div className="flex min-h-svh flex-col">
      <SessionMonitor />
      <header className="glass sticky top-0 z-10">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4">
          <Link href="/superadmin" className="flex items-center">
            <AppWordmark />
          </Link>
          <span className="text-muted-foreground hidden border-l pl-3 text-sm sm:inline">
            Plataforma
          </span>
          <nav className="flex items-center gap-3 border-l pl-3 text-sm">
            <Link href="/superadmin" className="text-muted-foreground hover:text-foreground transition-colors">
              Arrendadoras
            </Link>
            <Link
              href="/superadmin/usuarios"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Usuarios
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/superadmin/cuenta"
              className="text-muted-foreground hover:text-foreground hidden text-sm sm:inline"
            >
              {session.name}
            </Link>
            <form action={logout}>
              <Button type="submit" variant="ghost" size="sm">
                <LogOut className="size-4" aria-hidden />
                Salir
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 p-4 sm:p-6">
        {children}
      </main>
    </div>
  );
}
