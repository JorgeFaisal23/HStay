"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { MoreHorizontal, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FormError, NativeSelect } from "@/components/shared/form-field";
import { AccessDeliveryNotice } from "@/components/auth/access-delivery-notice";
import { ResetAccessDialog } from "@/components/auth/reset-access-dialog";
import {
  changeStaffRole,
  inviteStaff,
  resetStaffAccess,
  setStaffActive,
  type AccessResult,
  type StaffRole,
} from "@/server/actions/team";
import { ROLE_LABELS } from "@/lib/labels";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Guardando…" : "Dar acceso"}
    </Button>
  );
}

export function InviteStaffDialog({ atLimit = false }: { atLimit?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // Cada vez que se abre, el formulario se monta de nuevo y empieza en blanco.
  const [formKey, setFormKey] = useState(0);

  // El diálogo siempre queda montado: si al dar de alta se llenan los usuarios
  // contratados, solo se deshabilita el botón. Desmontarlo perdería la contraseña
  // temporal que se está mostrando. La lista se refresca al cerrar.
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setFormKey((k) => k + 1);
        else router.refresh();
      }}
    >
      <DialogTrigger
        render={
          <Button
            disabled={atLimit}
            title={atLimit ? "Ya usas todos tus usuarios contratados" : undefined}
          >
            <UserPlus className="size-4" aria-hidden />
            Agregar usuario
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <InviteForm key={formKey} onClose={() => {
          setOpen(false);
          router.refresh();
        }} />
      </DialogContent>
    </Dialog>
  );
}

function InviteForm({ onClose }: { onClose: () => void }) {
  const [state, formAction] = useActionState<AccessResult, FormData>(inviteStaff, {});

  if (state.ok && state.delivery) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Usuario agregado</DialogTitle>
          <DialogDescription>Ya tiene acceso al panel de tu arrendadora.</DialogDescription>
        </DialogHeader>
        <AccessDeliveryNotice delivery={state.delivery} />
        <DialogFooter>
          <Button onClick={onClose}>Listo</Button>
        </DialogFooter>
      </>
    );
  }

  return (
    <form action={formAction}>
      <DialogHeader>
        <DialogTitle>Agregar usuario al equipo</DialogTitle>
        <DialogDescription>
          Recibe un enlace por correo para elegir su contraseña o, sin correo
          configurado, una contraseña temporal que tú le entregas.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-4">
        <Field label="Nombre completo" htmlFor="staff-name" required>
          <Input id="staff-name" name="name" required placeholder="Daniela Ruiz" />
        </Field>
        <Field label="Correo" htmlFor="staff-email" required>
          <Input id="staff-email" name="email" type="email" required placeholder="daniela@ejemplo.com" />
        </Field>
        <Field label="Rol" htmlFor="staff-role">
          <NativeSelect id="staff-role" name="role" defaultValue="ADMIN">
            <option value="ADMIN">Administrativo: propiedades, servicios, cobros e inquilinos</option>
            <option value="VIEWER">Consulta: solo resumen y calendario</option>
            <option value="OPERATIONS">Operación: solo sus tareas de limpieza y reparación</option>
          </NativeSelect>
        </Field>
        <FormError message={state.error} />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Submit />
      </DialogFooter>
    </form>
  );
}

const STAFF_ROLE_OPTIONS: StaffRole[] = ["ADMIN", "VIEWER", "OPERATIONS"];

export function StaffRowActions({
  member,
}: {
  member: { id: string; name: string; email: string; role: StaffRole; active: boolean };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const run = (action: () => Promise<{ error?: string }>, success: string) =>
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(success);
      router.refresh();
    });

  return (
    <div className="flex items-center gap-1">
      {member.active ? (
        <ResetAccessDialog email={member.email} action={() => resetStaffAccess(member.id)} />
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon" disabled={pending} aria-label={`Opciones de ${member.name}`}>
              <MoreHorizontal className="size-4" aria-hidden />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          {member.active
            ? STAFF_ROLE_OPTIONS.filter((role) => role !== member.role).map((role) => (
                <DropdownMenuItem
                  key={role}
                  onClick={() => run(() => changeStaffRole(member.id, role), "Rol actualizado.")}
                >
                  Cambiar a {ROLE_LABELS[role]}
                </DropdownMenuItem>
              ))
            : null}
          <DropdownMenuItem
            onClick={() =>
              run(
                () => setStaffActive(member.id, !member.active),
                member.active ? "Acceso desactivado." : "Acceso reactivado.",
              )
            }
          >
            {member.active ? "Desactivar acceso" : "Reactivar acceso"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
