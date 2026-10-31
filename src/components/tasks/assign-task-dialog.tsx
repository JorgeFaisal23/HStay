"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FormError, NativeSelect } from "@/components/shared/form-field";
import { ROLE_LABELS } from "@/lib/labels";
import type { AssignTarget } from "@/lib/today";
import type { Role } from "@/generated/prisma/enums";
import { assignTask, scheduleCleaning } from "@/server/actions/tasks";

export type StaffOption = { id: string; name: string; role: Role };

/**
 * Elegir quién hace una tarea. Para la limpieza de una reserva crea la tarea
 * la primera vez; después solo cambia el responsable.
 */
export function AssignTaskDialog({ target, staff }: { target: AssignTarget; staff: StaffOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [assigneeId, setAssigneeId] = useState(target.assigneeId ?? staff[0]?.id ?? "");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const id = `assignee-${target.type === "task" ? target.taskId : target.bookingId}`;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setError(undefined);
          setAssigneeId(target.assigneeId ?? staff[0]?.id ?? "");
        }
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline">
            <UserCheck className="size-4" aria-hidden />
            {target.assigneeId ? "Reasignar" : "Asignar"}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{target.assigneeId ? "Cambiar responsable" : "Asignar responsable"}</DialogTitle>
          <DialogDescription>{target.title}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <Field
            label="Responsable"
            htmlFor={id}
            hint="Lo verá en su lista de tareas. Para dar de alta a alguien de Operación, ve a Equipo."
          >
            <NativeSelect id={id} value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
              <option value="">Sin responsable</option>
              {staff.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name} · {ROLE_LABELS[person.role]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <FormError message={error} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setError(undefined);
                const chosen = assigneeId || null;
                const result =
                  target.type === "task"
                    ? await assignTask(target.taskId, chosen)
                    : await scheduleCleaning(target.bookingId, chosen);
                if (result.error) {
                  setError(result.error);
                  return;
                }
                setOpen(false);
                toast.success(chosen ? "Responsable asignado." : "La tarea quedó sin responsable.");
                router.refresh();
              })
            }
          >
            {pending ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
