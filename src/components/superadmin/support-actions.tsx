"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ResetAccessDialog } from "@/components/auth/reset-access-dialog";
import {
  supportForceLogout,
  supportResetAccess,
  supportSetUserActive,
  supportUnlockLogin,
} from "@/server/superadmin/actions";
import type { Role } from "@/generated/prisma/enums";

export type SupportAccount = {
  id: string;
  name: string;
  /** Nulo solo en inquilinos sin acceso al portal. */
  email: string | null;
  role: Role;
  active: boolean;
  hasSession: boolean;
  lockedUntil: Date | null;
};

/**
 * Soporte de plataforma sobre una cuenta de cualquier arrendadora: nuevo
 * acceso, cierre de sesión, desbloqueo y activación. Cada acción queda en la
 * bitácora de su arrendadora.
 */
export function SupportActions({ account }: { account: SupportAccount }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const run = (action: () => Promise<{ error?: string }>, success: string) =>
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setConfirmOpen(false);
      toast.success(success);
      router.refresh();
    });

  const deactivate = () =>
    run(() => supportSetUserActive(account.id, false), "Acceso desactivado.");

  const isOwner = account.role === "OWNER";

  return (
    <div className="flex items-center gap-1">
      {account.active && account.email ? (
        <ResetAccessDialog email={account.email} action={() => supportResetAccess(account.id)} />
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              disabled={pending}
              aria-label={`Soporte para ${account.name}`}
            >
              <MoreHorizontal className="size-4" aria-hidden />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            disabled={!account.hasSession}
            onClick={() => run(() => supportForceLogout(account.id), "Sesión cerrada.")}
          >
            Cerrar su sesión
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!account.lockedUntil}
            onClick={() => run(() => supportUnlockLogin(account.id), "Cuenta desbloqueada.")}
          >
            Desbloquear intentos de acceso
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {account.active ? (
            <DropdownMenuItem onClick={() => setConfirmOpen(true)}>
              Desactivar acceso
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              onClick={() =>
                run(() => supportSetUserActive(account.id, true), "Acceso reactivado.")
              }
            >
              Reactivar acceso
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Desactivar a {account.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {isOwner
                ? "Es el dueño: la arrendadora quedará sin nadie que la administre hasta que lo reactives. Su sesión se cierra en el acto. Para sacar a todos sus usuarios, usa Suspender acceso en la arrendadora."
                : "Sale de inmediato y no podrá volver a entrar hasta que lo reactives. Su historial se conserva."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button variant="destructive" disabled={pending} onClick={deactivate}>
              {pending ? "Desactivando…" : isOwner ? "Desactivar al dueño" : "Desactivar"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
