import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/shared/form-field";

export type LeaseFormDefaults = {
  startDate: string; // AAAA-MM-DD
  endDate: string;
  rentAmount: number;
  depositAmount: number | null;
  paymentDay: number;
  notes: string | null;
};

/** Campos de un contrato; los usan editar y renovar. */
export function LeaseFormFields({ defaults }: { defaults: LeaseFormDefaults }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Inicio del contrato" htmlFor="startDate" required>
          <Input
            id="startDate"
            name="startDate"
            type="date"
            required
            defaultValue={defaults.startDate}
          />
        </Field>
        <Field label="Vencimiento" htmlFor="endDate" required>
          <Input
            id="endDate"
            name="endDate"
            type="date"
            required
            defaultValue={defaults.endDate}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Renta mensual" htmlFor="rentAmount" required>
          <Input
            id="rentAmount"
            name="rentAmount"
            type="number"
            min={0}
            step="0.01"
            required
            defaultValue={defaults.rentAmount}
            className="tabular-nums"
          />
        </Field>
        <Field label="Depósito" htmlFor="depositAmount">
          <Input
            id="depositAmount"
            name="depositAmount"
            type="number"
            min={0}
            step="0.01"
            defaultValue={defaults.depositAmount ?? undefined}
            className="tabular-nums"
          />
        </Field>
        <Field
          label="Día de pago"
          htmlFor="paymentDay"
          required
          hint="Del 1 al 31. En meses cortos, el último día."
        >
          <Input
            id="paymentDay"
            name="paymentDay"
            type="number"
            min={1}
            max={31}
            required
            defaultValue={defaults.paymentDay}
            className="tabular-nums"
          />
        </Field>
      </div>

      <Field label="Notas" htmlFor="notes">
        <Textarea id="notes" name="notes" rows={2} defaultValue={defaults.notes ?? ""} />
      </Field>
    </div>
  );
}
