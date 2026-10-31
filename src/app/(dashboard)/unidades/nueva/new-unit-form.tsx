"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/shared/button-link";
import { FormError } from "@/components/shared/form-field";
import { UnitFormFields } from "@/components/units/unit-form-fields";
import { createUnit } from "@/server/actions/properties";
import type { ActionResult } from "@/lib/action-result";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Guardando…" : "Guardar unidad"}
    </Button>
  );
}

export function NewUnitForm({
  buildings,
  defaultBuildingId,
}: {
  buildings: { id: string; name: string }[];
  defaultBuildingId?: string;
}) {
  const [state, formAction] = useActionState<ActionResult, FormData>(
    createUnit,
    {},
  );

  return (
    <form action={formAction} className="space-y-6">
      <UnitFormFields
        buildings={buildings}
        defaults={{ buildingId: defaultBuildingId }}
      />

      <FormError message={state.error} />

      <div className="flex flex-wrap justify-end gap-2">
        <ButtonLink
          href={defaultBuildingId ? `/edificios/${defaultBuildingId}` : "/edificios"}
          variant="outline"
        >
          Cancelar
        </ButtonLink>
        <Submit />
      </div>
    </form>
  );
}
