"use client";

import { useRouter } from "next/navigation";
import { NativeSelect } from "@/components/shared/form-field";
import { GenerateChargesButton } from "@/components/payments/generate-charges-button";
import { periodLabel } from "@/lib/format";

/** Selector de mes y generación de los cargos del periodo. */
export function PaymentsToolbar({
  period,
  periods,
  missingCharges,
  editable,
}: {
  period: string;
  periods: string[];
  missingCharges: number;
  editable: boolean;
}) {
  const router = useRouter();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <NativeSelect
        aria-label="Mes"
        value={period}
        onChange={(e) => router.push(`/pagos?mes=${e.target.value}`)}
        className="w-44"
      >
        {periods.map((p) => (
          <option key={p} value={p}>
            {periodLabel(p)}
          </option>
        ))}
      </NativeSelect>

      {editable && missingCharges > 0 ? (
        <GenerateChargesButton period={period} count={missingCharges} />
      ) : null}
    </div>
  );
}
