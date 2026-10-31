import { Field, NativeSelect } from "@/components/shared/form-field";
import { SPLIT_MODE_LABELS } from "@/lib/labels";
import type { SplitMode } from "@/generated/prisma/enums";

const SPLIT_MODES: SplitMode[] = ["EQUAL", "BY_SIZE", "NONE"];

/** Cómo se reparte un recibo de la propiedad entre sus unidades. */
export function SplitModeSelect({
  id,
  defaultValue,
  value,
  onChange,
}: {
  id: string;
  defaultValue?: SplitMode;
  value?: SplitMode;
  onChange?: (value: SplitMode) => void;
}) {
  return (
    <Field
      label="Reparto entre unidades"
      htmlFor={id}
      hint="Por metros usa la superficie de cada unidad; las unidades en mantenimiento no pagan."
    >
      <NativeSelect
        id={id}
        name="splitMode"
        defaultValue={defaultValue}
        value={value}
        onChange={onChange ? (e) => onChange(e.target.value as SplitMode) : undefined}
      >
        {SPLIT_MODES.map((mode) => (
          <option key={mode} value={mode}>
            {SPLIT_MODE_LABELS[mode]}
          </option>
        ))}
      </NativeSelect>
    </Field>
  );
}
