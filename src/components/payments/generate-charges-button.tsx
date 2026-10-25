"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { FilePlus2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { generateMonthlyCharges } from "@/server/actions/payments";

/** Genera los cargos de renta que faltan en un periodo (Cobros y "Hoy"). */
export function GenerateChargesButton({
  period,
  count,
  variant = "default",
  size = "default",
}: {
  period: string;
  count: number;
  variant?: "default" | "outline";
  size?: "default" | "sm";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant={variant}
      size={size}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await generateMonthlyCharges(period);
          if (result.error) {
            toast.error(result.error);
            return;
          }
          toast.success(
            result.created === 0
              ? "No había cargos por generar."
              : result.created === 1
                ? "Se generó 1 cargo."
                : `Se generaron ${result.created} cargos.`,
          );
          router.refresh();
        })
      }
    >
      <FilePlus2 className="size-4" aria-hidden />
      {pending ? "Generando…" : count === 1 ? "Generar 1 cargo" : `Generar ${count} cargos`}
    </Button>
  );
}
