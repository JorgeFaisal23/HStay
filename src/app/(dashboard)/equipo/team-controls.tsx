"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
  setCaptureBuildings,
  setStaffActive,
  type AccessResult,
  type StaffRole,
} from "@/server/actions/team";
import { ROLE_LABELS } from "@/lib/labels";
import { useFormAction } from "@/hooks/use-form-action";
import { BuildingPicker } from "@/components/team/building-picker";

type BuildingOption = { id: string; name: string };

export function InviteStaffDialog({
  atLimit = false,
  buildings,
}: {
  atLimit?: boolean;
  /** Para asignar propiedades a un usuario de Captura. */
  buildings: BuildingOption[];
}) {
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
        <InviteForm key={formKey} buildings={buildings} onClose={() => {
          setOpen(false);
          router.refresh();
        }} />
      </DialogContent>
    </Dialog>
  );
}

function InviteForm({ onClose, buildings }: { onClose: () => void; buildings: BuildingOption[] }) {
  const [state, setState] = useState<AccessResult>({});
  const [pending, startTransition] = useTransition();
  const [role, setRole] = useState<StaffRole>("ADMIN");

  // onSubmit en vez de action: si hay un error, lo capturado no se borra.
  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => setState(await inviteStaff({}, formData)));
  }

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
    <form onSubmit={onSubmit}>
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
          <NativeSelect
            id="staff-role"
            name="role"
            value={role}
            onChange={(e) => setRole(e.target.value as StaffRole)}
          >
            <option value="ADMIN">Administrativo: propiedades, servicios, cobros e inquilinos</option>
            <option value="VIEWER">Consulta: solo resumen y calendario</option>
            <option value="OPERATIONS">Operación: solo sus tareas de limpieza y reparación</option>
            <option value="CAPTURE">Captura: solo reservas de las propiedades que elijas</option>
          </NativeSelect>
        </Field>
        {role === "CAPTURE" ? <BuildingPicker buildings={buildings} idPrefix="invite" /> : null}
        <FormError message={state.error} />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Dar acceso"}
        </Button>
      </DialogFooter>
    </form>
  );
}

const STAFF_ROLE_OPTIONS: StaffRole[] = ["ADMIN", "VIEWER", "OPERATIONS", "CAPTURE"];

export function StaffRowActions({
  member,
  buildings,
}: {
  member: {
    id: string;
    name: string;
    email: string;
    role: StaffRole;
    active: boolean;
    /** Propiedades asignadas (solo Captura). */
    buildingIds: string[];
  };
  buildings: BuildingOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [buildingsOpen, setBuildingsOpen] = useState(false);

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
          {member.role === "CAPTURE" ? (
            <DropdownMenuItem onClick={() => setBuildingsOpen(true)}>Elegir propiedades</DropdownMenuItem>
          ) : null}
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
      {member.role === "CAPTURE" ? (
        <CaptureBuildingsDialog
          open={buildingsOpen}
          onOpenChange={setBuildingsOpen}
          member={member}
          buildings={buildings}
        />
      ) : null}
    </div>
  );
}

/** Propiedades en las que trabaja alguien de Captura. */
function CaptureBuildingsDialog({
  open,
  onOpenChange,
  member,
  buildings,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: { id: string; name: string; buildingIds: string[] };
  buildings: BuildingOption[];
}) {
  const router = useRouter();
  // onSubmit en vez de action: si hay un error, lo marcado no se borra.
  const { onSubmit, pending, error, clearError } = useFormAction(
    (formData) => setCaptureBuildings(member.id, formData),
    {
      onSuccess: () => {
        onOpenChange(false);
        toast.success("Propiedades actualizadas.");
        router.refresh();
      },
    },
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) clearError();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>Propiedades de {member.name}</DialogTitle>
            <DialogDescription>
              Solo verá y registrará reservas de las propiedades que marques.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <BuildingPicker buildings={buildings} defaultSelected={member.buildingIds} idPrefix={`m-${member.id}`} />
            <FormError message={error} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : "Guardar propiedades"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
