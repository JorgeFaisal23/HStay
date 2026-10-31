import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, NativeSelect } from "@/components/shared/form-field";
import { CURRENCIES, CURRENCY_LABELS, type Currency } from "@/lib/currency";

export type BuildingDefaults = {
  name: string;
  address: string;
  city: string | null;
  notes: string | null;
  currency: Currency;
};

/** Campos de una propiedad, compartidos por el alta y la edición. */
export function BuildingFormFields({
  defaults,
  currencyLocked,
}: {
  defaults?: BuildingDefaults;
  /** Si la moneda ya no se puede cambiar, por qué (ver currencyLockReason). */
  currencyLocked?: string | null;
}) {
  return (
    <>
      <Field
        label="Nombre"
        htmlFor="name"
        required
        hint="Como lo identificas tú, por ejemplo “Edificio Reforma”."
      >
        <Input
          id="name"
          name="name"
          required
          placeholder="Edificio Reforma"
          defaultValue={defaults?.name}
        />
      </Field>

      <Field label="Dirección" htmlFor="address" required>
        <Input
          id="address"
          name="address"
          required
          placeholder="Av. Reforma 148, Col. Juárez"
          defaultValue={defaults?.address}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Ciudad" htmlFor="city">
          <Input
            id="city"
            name="city"
            placeholder="Ciudad de México"
            defaultValue={defaults?.city ?? ""}
          />
        </Field>

        <Field
          label="Moneda"
          htmlFor="currency"
          required
          hint={
            currencyLocked
              ? currencyLocked
              : "Rentas, reservas, cargos y gastos de esta propiedad se registran en esta moneda."
          }
        >
          <NativeSelect
            id="currency"
            name="currency"
            defaultValue={defaults?.currency ?? "MXN"}
            disabled={Boolean(currencyLocked)}
          >
            {CURRENCIES.map((currency) => (
              <option key={currency} value={currency}>
                {CURRENCY_LABELS[currency]}
              </option>
            ))}
          </NativeSelect>
          {/* Un select deshabilitado no se envía: se manda la moneda actual. */}
          {currencyLocked ? (
            <input type="hidden" name="currency" value={defaults?.currency ?? "MXN"} />
          ) : null}
        </Field>
      </div>

      <Field label="Notas" htmlFor="notes">
        <Textarea
          id="notes"
          name="notes"
          rows={2}
          placeholder="Cualquier detalle que quieras recordar."
          defaultValue={defaults?.notes ?? ""}
        />
      </Field>
    </>
  );
}
