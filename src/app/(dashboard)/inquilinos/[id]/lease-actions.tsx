"use client";

import { useState } from "react";
import { useFormAction } from "@/hooks/use-form-action";
import { CalendarX, KeyRound, Pencil, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { LeaseFormFields } from "@/components/leases/lease-form-fields";
import { assignLease, endLease, renewLease, updateLease } from "@/server/actions/leases";
import { money } from "@/lib/format";
import type { ActionResult } from "@/server/actions/properties";
import type { LeaseStatus } from "@/generated/prisma/enums";

export type LeaseActionData = {
  id: string;
  status: LeaseStatus;
  startDate: string;
  endDate: string;
  rentAmount: number;
  depositAmount: number | null;
  paymentDay: number;
  notes: string | null;
  canRenew: boolean;
  renewal: { startDate: string; endDate: string; months: number };
};

/** Botones de editar, renovar y terminar para un contrato. */
export function LeaseActions({
  lease,
  label,
  size = "sm",
}: {
  lease: LeaseActionData;
  /** "CHICHEN 124 · DEP 1", para los títulos de los diálogos. */
  label: string;
  size?: "sm" | "default";
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <EditLeaseDialog lease={lease} label={label} size={size} />
      {lease.canRenew ? <RenewLeaseDialog lease={lease} label={label} size={size} /> : null}
      {lease.status === "ACTIVE" ? <EndLeaseDialog lease={lease} label={label} size={size} /> : null}
    </div>
  );
}

// ------------------------------------------------------------------ base

function Submit({
  children,
  destructive,
  pending,
}: {
  children: string;
  destructive?: boolean;
  pending: boolean;
}) {
  return (
    <Button type="submit" disabled={pending} variant={destructive ? "destructive" : "default"}>
      {pending ? "Guardando…" : children}
    </Button>
  );
}

function ActionDialog({
  trigger,
  title,
  description,
  action,
  hidden,
  success,
  submitLabel,
  destructive,
  children,
}: {
  trigger: React.ReactElement;
  title: string;
  description: string;
  action: (prev: ActionResult, formData: FormData) => Promise<ActionResult>;
  /** Campos ocultos que identifican el registro (leaseId, tenantId…). */
  hidden: Record<string, string>;
  success: string;
  submitLabel: string;
  destructive?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  // onSubmit en vez de action: si hay error, lo capturado no se borra.
  const { onSubmit, pending, error, clearError } = useFormAction(action, {
    onSuccess: () => {
      setOpen(false);
      toast.success(success);
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) clearError();
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={onSubmit}>
          {Object.entries(hidden).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className="text-pretty">{description}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {children}
            <FormError message={error} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Submit destructive={destructive} pending={pending}>
              {submitLabel}
            </Submit>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------ editar

function EditLeaseDialog({ lease, label, size }: { lease: LeaseActionData; label: string; size: "sm" | "default" }) {
  return (
    <ActionDialog
      trigger={
        <Button variant="outline" size={size}>
          <Pencil className="size-4" aria-hidden />
          Editar
        </Button>
      }
      title={`Editar contrato · ${label}`}
      description="Corrige fechas, renta o día de pago. Los cargos que ya se generaron no cambian; los siguientes usarán los datos nuevos."
      action={updateLease}
      hidden={{ leaseId: lease.id }}
      success="Contrato actualizado."
      submitLabel="Guardar cambios"
    >
      <LeaseFormFields defaults={lease} />
    </ActionDialog>
  );
}

// ------------------------------------------------------------------ renovar

function RenewLeaseDialog({ lease, label, size }: { lease: LeaseActionData; label: string; size: "sm" | "default" }) {
  const wasActive = lease.status === "ACTIVE";
  return (
    <ActionDialog
      trigger={
        <Button variant="outline" size={size}>
          <RefreshCw className="size-4" aria-hidden />
          Renovar
        </Button>
      }
      title={`Renovar contrato · ${label}`}
      description={
        wasActive
          ? "Se crea el siguiente periodo y el contrato actual se cierra. Las fechas son una propuesta; ajústalas si se pactó otra cosa."
          : "Se crea un contrato vigente a partir del anterior. Las fechas propuestas cubren el periodo actual; ajústalas a lo que se pactó."
      }
      action={renewLease}
      hidden={{ leaseId: lease.id }}
      success="Contrato renovado."
      submitLabel="Renovar"
    >
      <LeaseFormFields
        defaults={{
          startDate: lease.renewal.startDate,
          endDate: lease.renewal.endDate,
          rentAmount: lease.rentAmount,
          depositAmount: lease.depositAmount,
          paymentDay: lease.paymentDay,
          notes: null,
        }}
      />
    </ActionDialog>
  );
}

// ------------------------------------------------------------------ terminar

function EndLeaseDialog({ lease, label, size }: { lease: LeaseActionData; label: string; size: "sm" | "default" }) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <ActionDialog
      trigger={
        <Button variant="outline" size={size}>
          <CalendarX className="size-4" aria-hidden />
          Terminar
        </Button>
      }
      title={`Terminar contrato · ${label}`}
      description="El contrato se cierra en la fecha de salida y la unidad queda disponible. Los cargos pendientes no se borran."
      action={endLease}
      hidden={{ leaseId: lease.id }}
      success="Contrato terminado."
      submitLabel="Terminar contrato"
      destructive
    >
      <Field label="Fecha de salida" htmlFor="endDate" required>
        <Input
          id="endDate"
          name="endDate"
          type="date"
          required
          min={lease.startDate}
          defaultValue={today < lease.endDate ? today : lease.endDate}
        />
      </Field>
      <Field label="Motivo" htmlFor="reason" hint="Opcional. Se guarda en las notas del contrato.">
        <Textarea id="reason" name="reason" rows={2} placeholder="Se mudó, no renovó, etc." />
      </Field>
    </ActionDialog>
  );
}

// ------------------------------------------------------------------ asignar

/** Hoy y la misma fecha dentro de N meses, en AAAA-MM-DD. */
function isoFromToday(monthsAhead: number) {
  const date = new Date();
  date.setMonth(date.getMonth() + monthsAhead);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Crea un contrato para este mismo inquilino. Sustituye al antiguo botón que
 * llevaba a "Nuevo inquilino" y duplicaba a la persona.
 */
export function AssignLeaseDialog({
  tenantId,
  tenantName,
  units,
}: {
  tenantId: string;
  tenantName: string;
  units: { id: string; code: string; buildingName: string; baseRent: number }[];
}) {
  const [unitId, setUnitId] = useState("");
  const selected = units.find((u) => u.id === unitId);

  return (
    <ActionDialog
      trigger={
        <Button>
          <KeyRound className="size-4" aria-hidden />
          Asignar unidad
        </Button>
      }
      title={`Asignar unidad · ${tenantName}`}
      description="Registra el contrato de largo plazo de este inquilino. Para estancias cortas (noches, semanas) usa Reservas."
      action={assignLease}
      hidden={{ tenantId }}
      success="Unidad asignada."
      submitLabel="Asignar"
    >
      <Field label="Unidad" htmlFor="unitId" required>
        <NativeSelect
          id="unitId"
          name="unitId"
          required
          value={unitId}
          onChange={(e) => setUnitId(e.target.value)}
        >
          <option value="" disabled>
            {units.length ? "Elige la unidad…" : "No hay unidades sin contrato vigente"}
          </option>
          {units.map((unit) => (
            <option key={unit.id} value={unit.id}>
              {unit.buildingName} · {unit.code} — {money(unit.baseRent)}
            </option>
          ))}
        </NativeSelect>
      </Field>
      {/* key: al cambiar de unidad se propone su renta base. */}
      <LeaseFormFields
        key={unitId}
        defaults={{
          startDate: isoFromToday(0),
          endDate: isoFromToday(12),
          rentAmount: selected?.baseRent ?? 0,
          depositAmount: selected?.baseRent ?? null,
          paymentDay: 1,
          notes: null,
        }}
      />
    </ActionDialog>
  );
}
