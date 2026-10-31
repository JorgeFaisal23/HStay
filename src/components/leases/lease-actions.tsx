"use client";

import { useState } from "react";
import { useFormAction } from "@/hooks/use-form-action";
import { useRouter } from "next/navigation";
import { CalendarPlus, CalendarX, Ban, Pencil } from "lucide-react";
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
import { Field, FormError } from "@/components/shared/form-field";
import { cancelLease, endLease, renewLease, updateLease } from "@/server/actions/leases";
import { localDateInput } from "./lease-terms-fields";

type LeaseInfo = {
  id: string;
  startDate: Date;
  endDate: Date;
  rentAmount: number;
  depositAmount: number | null;
  paymentDay: number;
  tenantName: string;
};

/** Diálogo con un formulario que llama a una acción del contrato. */
function LeaseDialog({
  trigger,
  title,
  description,
  submitLabel,
  destructive,
  action,
  success,
  children,
}: {
  trigger: React.ReactElement;
  title: string;
  description: string;
  submitLabel: string;
  destructive?: boolean;
  action: (formData: FormData) => Promise<{ error?: string }>;
  success: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // onSubmit en vez de action: si hay un error, lo capturado no se borra.
  const { onSubmit, pending, error, clearError } = useFormAction(action, {
    onSuccess: () => {
      setOpen(false);
      toast.success(success);
      router.refresh();
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
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {children}
            <FormError message={error} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Volver
            </Button>
            <Button type="submit" variant={destructive ? "destructive" : "default"} disabled={pending}>
              {pending ? "Guardando…" : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Corregir, renovar, terminar o cancelar un contrato vigente. */
export function LeaseActions({ lease }: { lease: LeaseInfo }) {
  const currentEnd = localDateInput(0, lease.endDate);
  // Un día antes del vencimiento: el inicio tiene que quedar antes.
  const lastStart = localDateInput(0, new Date(lease.endDate.getTime() - 86_400_000));

  return (
    <div className="flex flex-wrap gap-2">
      <LeaseDialog
        trigger={
          <Button variant="outline" size="sm">
            <Pencil className="size-4" aria-hidden />
            Editar
          </Button>
        }
        title="Editar contrato"
        description="Corrige datos que se capturaron mal. Los cargos ya generados no cambian; los siguientes usan los datos nuevos. El vencimiento se cambia con Renovar o Terminar."
        submitLabel="Guardar cambios"
        success="Contrato actualizado."
        action={(formData) => updateLease(lease.id, formData)}
      >
        <Field label="Inicio del contrato" htmlFor="edit-start" required>
          <Input
            id="edit-start"
            name="startDate"
            type="date"
            required
            max={lastStart}
            defaultValue={localDateInput(0, lease.startDate)}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Renta mensual" htmlFor="edit-rent" required>
            <Input
              id="edit-rent"
              name="rentAmount"
              type="number"
              min={0}
              step="0.01"
              required
              defaultValue={lease.rentAmount}
              className="text-right tabular-nums"
            />
          </Field>
          <Field label="Depósito" htmlFor="edit-deposit">
            <Input
              id="edit-deposit"
              name="depositAmount"
              type="number"
              min={0}
              step="0.01"
              defaultValue={lease.depositAmount ?? undefined}
              className="text-right tabular-nums"
            />
          </Field>
        </div>
        <Field
          label="Día de pago"
          htmlFor="edit-payday"
          required
          hint="Del 1 al 31. En meses más cortos, el último día."
        >
          <Input
            id="edit-payday"
            name="paymentDay"
            type="number"
            min={1}
            max={31}
            required
            defaultValue={lease.paymentDay}
            className="text-right tabular-nums"
          />
        </Field>
      </LeaseDialog>

      <LeaseDialog
        trigger={
          <Button variant="outline" size="sm">
            <CalendarPlus className="size-4" aria-hidden />
            Renovar
          </Button>
        }
        title="Renovar contrato"
        description={`Extiende la vigencia del contrato de ${lease.tenantName}. Una renta nueva aplica a los cargos que aún no se generan.`}
        submitLabel="Renovar"
        success="Contrato renovado."
        action={(formData) => renewLease(lease.id, formData)}
      >
        <Field label="Nuevo vencimiento" htmlFor="renew-end" required>
          <Input
            id="renew-end"
            name="endDate"
            type="date"
            required
            min={currentEnd}
            defaultValue={localDateInput(12, lease.endDate)}
          />
        </Field>
        <Field label="Renta mensual" htmlFor="renew-rent" hint="Déjala igual si no cambia.">
          <Input
            id="renew-rent"
            name="rentAmount"
            type="number"
            min={0}
            step={50}
            defaultValue={lease.rentAmount}
            className="text-right tabular-nums"
          />
        </Field>
      </LeaseDialog>

      <LeaseDialog
        trigger={
          <Button variant="outline" size="sm">
            <CalendarX className="size-4" aria-hidden />
            Terminar
          </Button>
        }
        title="Terminar contrato"
        description="Con la fecha de hoy (o anterior) termina ya y la unidad queda disponible. Con una fecha futura, termina solo ese día. Los cargos de meses posteriores sin pagos se borran."
        submitLabel="Terminar contrato"
        destructive
        success="Contrato actualizado."
        action={(formData) => endLease(lease.id, formData)}
      >
        <Field label="Fecha de terminación" htmlFor="end-date" required>
          <Input
            id="end-date"
            name="endDate"
            type="date"
            required
            max={currentEnd}
            defaultValue={localDateInput()}
          />
        </Field>
        <Field label="Motivo" htmlFor="end-reason" hint="Opcional. Queda en la bitácora y en el historial.">
          <Input id="end-reason" name="reason" placeholder="El inquilino se mudó" maxLength={200} />
        </Field>
      </LeaseDialog>

      <LeaseDialog
        trigger={
          <Button variant="ghost" size="sm">
            <Ban className="size-4" aria-hidden />
            Cancelar
          </Button>
        }
        title="Cancelar contrato"
        description="Para un contrato capturado por error o que no llegó a empezar: se anula junto con sus cargos. Si ya tiene pagos, termínalo en su lugar."
        submitLabel="Cancelar contrato"
        destructive
        success="Contrato cancelado."
        action={(formData) => cancelLease(lease.id, formData)}
      >
        <Field label="Motivo" htmlFor="cancel-reason">
          <Input id="cancel-reason" name="reason" placeholder="Capturado por error" maxLength={200} />
        </Field>
      </LeaseDialog>
    </div>
  );
}
