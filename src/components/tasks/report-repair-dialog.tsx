"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Wrench } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FormError, NativeSelect } from "@/components/shared/form-field";
import { ReceiptPicker } from "@/components/payments/receipt-picker";
import { ROLE_LABELS } from "@/lib/labels";
import type { StaffOption } from "@/components/tasks/assign-task-dialog";
import { reportRepair, reportRepairFromPortal } from "@/server/actions/tasks";

/**
 * Reportar una reparación. Con `units` es el equipo: elige la unidad y, si
 * quiere, el responsable. Sin `units` es el inquilino desde su portal: la
 * unidad es la suya.
 */
export function ReportRepairDialog({
  units,
  staff = [],
  variant = "default",
}: {
  units?: { id: string; label: string }[];
  staff?: StaffOption[];
  variant?: "default" | "outline";
}) {
  const router = useRouter();
  const team = units !== undefined;
  const [open, setOpen] = useState(false);
  const [unitId, setUnitId] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const reset = () => {
    setUnitId("");
    setAssigneeId("");
    setTitle("");
    setDescription("");
    setPhoto(null);
    setError(undefined);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger
        render={
          <Button variant={variant}>
            <Wrench className="size-4" aria-hidden />
            {team ? "Reportar reparación" : "Reportar un problema"}
          </Button>
        }
      />
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{team ? "Reportar reparación" : "Reportar un problema"}</DialogTitle>
          <DialogDescription>
            {team
              ? "Queda en Mantenimiento hasta que alguien la cierre con foto y costo."
              : "Lo recibe el administrador. Aquí verás cuándo lo atienden y cuándo queda resuelto."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {team ? (
            <Field label="Unidad" htmlFor="repair-unit" required>
              <NativeSelect id="repair-unit" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
                <option value="" disabled>
                  Elige la unidad
                </option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          ) : null}

          <Field label="¿Qué pasa?" htmlFor="repair-title" required>
            <Input
              id="repair-title"
              value={title}
              maxLength={120}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Gotea la llave del lavabo"
            />
          </Field>

          <Field label="Detalles" htmlFor="repair-description">
            <Textarea
              id="repair-description"
              rows={3}
              maxLength={1000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Desde cuándo pasa, dónde está, si se puede entrar a la unidad…"
            />
          </Field>

          <ReceiptPicker
            value={photo}
            onChange={setPhoto}
            onProcessingChange={setProcessing}
            label="Foto del problema"
            hint="Ayuda a saber qué material llevar."
          />

          {team && staff.length > 0 ? (
            <Field label="Responsable" htmlFor="repair-assignee">
              <NativeSelect id="repair-assignee" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
                <option value="">Asignar después</option>
                {staff.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name} · {ROLE_LABELS[person.role]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          ) : null}

          <FormError message={error} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            disabled={pending || processing || title.trim().length < 3 || (team && !unitId)}
            onClick={() =>
              startTransition(async () => {
                setError(undefined);
                const fields = { title, description: description || undefined, photoUrl: photo ?? undefined };
                const result = team
                  ? await reportRepair({ ...fields, unitId, assigneeId: assigneeId || null })
                  : await reportRepairFromPortal(fields);
                if (result.error) {
                  setError(result.error);
                  return;
                }
                setOpen(false);
                reset();
                toast.success(team ? "Reparación reportada." : "Reporte enviado al administrador.");
                router.refresh();
              })
            }
          >
            {pending ? "Enviando…" : "Enviar reporte"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
