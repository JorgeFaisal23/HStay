import { Input } from "@/components/ui/input";
import { Field } from "@/components/shared/form-field";

/** Fecha local en formato YYYY-MM-DD, opcionalmente N meses adelante. */
export function localDateInput(monthsAhead = 0, from = new Date()) {
  const date = new Date(from);
  date.setMonth(date.getMonth() + monthsAhead);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Condiciones de un contrato: vigencia, renta, depósito y día de pago. Los
 * nombres coinciden con lo que lee el servidor (readLeaseTerms). Quien lo usa
 * debe darle una `key` por unidad, para que la renta sugerida cambie al
 * cambiar de unidad.
 */
export function LeaseTermsFields({ baseRent }: { baseRent?: number }) {
  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Inicio del contrato" htmlFor="startDate" required>
          <Input id="startDate" name="startDate" type="date" required defaultValue={localDateInput()} />
        </Field>
        <Field label="Vencimiento" htmlFor="endDate" required>
          <Input id="endDate" name="endDate" type="date" required defaultValue={localDateInput(12)} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Renta mensual" htmlFor="rentAmount" required>
          <Input
            id="rentAmount"
            name="rentAmount"
            type="number"
            min={0}
            step={50}
            required
            defaultValue={baseRent}
            className="text-right tabular-nums"
          />
        </Field>
        <Field label="Depósito" htmlFor="depositAmount">
          <Input
            id="depositAmount"
            name="depositAmount"
            type="number"
            min={0}
            step={50}
            defaultValue={baseRent}
            className="text-right tabular-nums"
          />
        </Field>
        <Field label="Día de pago" htmlFor="paymentDay" hint="Del 1 al 31. En meses más cortos, el último día.">
          <Input
            id="paymentDay"
            name="paymentDay"
            type="number"
            min={1}
            max={31}
            defaultValue={1}
            className="text-right tabular-nums"
          />
        </Field>
      </div>
    </div>
  );
}
