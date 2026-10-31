"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Field, FormError } from "@/components/shared/form-field";
import { StatusBadge } from "@/components/shared/status-badge";
import { SERVICE_TYPE_LABELS, SPLIT_MODE_LABELS } from "@/lib/labels";
import type { ServiceType, SplitMode } from "@/generated/prisma/enums";
import { updateServiceAccount } from "@/server/actions/properties";
import type { ActionResult } from "@/lib/action-result";
import { SplitModeSelect } from "./split-mode-select";

function Save({ dirty }: { dirty: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending || !dirty}>
      {pending ? "Guardando…" : "Guardar"}
    </Button>
  );
}

/**
 * Configuración de un servicio: si va incluido en la renta, quién lo provee y
 * con qué número de contrato. Los recibos de la propiedad (los que traen
 * `splitMode`) también eligen cómo se reparten entre las unidades.
 */
export function ServiceAccountCard({
  account,
  editable,
}: {
  account: {
    id: string;
    type: ServiceType;
    providerName: string | null;
    contractNumber: string | null;
    includedInRent: boolean;
    splitMode?: SplitMode;
  };
  editable: boolean;
}) {
  const [state, formAction] = useActionState<ActionResult, FormData>(
    updateServiceAccount,
    {},
  );
  const [included, setIncluded] = useState(account.includedInRent);
  const [provider, setProvider] = useState(account.providerName ?? "");
  const [contract, setContract] = useState(account.contractNumber ?? "");
  const [split, setSplit] = useState(account.splitMode);

  const dirty =
    included !== account.includedInRent ||
    split !== account.splitMode ||
    provider !== (account.providerName ?? "") ||
    contract !== (account.contractNumber ?? "");

  useEffect(() => {
    if (state.ok) toast.success("Servicio actualizado.");
  }, [state.ok]);

  const switchId = `incluido-${account.id}`;

  if (!editable) {
    return (
      <div className="rounded-lg border p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="font-medium">{SERVICE_TYPE_LABELS[account.type]}</p>
          <StatusBadge tone={account.includedInRent ? "success" : "neutral"}>
            {account.includedInRent ? "Incluido" : "Se cobra aparte"}
          </StatusBadge>
        </div>
        <p className="text-muted-foreground mt-2 text-xs">
          {account.providerName ?? "Sin proveedor"} · Contrato{" "}
          {account.contractNumber ?? "—"}
          {account.splitMode ? ` · ${SPLIT_MODE_LABELS[account.splitMode]}` : ""}
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4 rounded-lg border p-4">
      <input type="hidden" name="accountId" value={account.id} />
      {/* Valor explícito: no dependemos de cómo serialice el switch. */}
      <input
        type="hidden"
        name="includedInRent"
        value={included ? "on" : "off"}
      />

      <div className="flex items-center justify-between gap-3">
        <p className="font-medium">{SERVICE_TYPE_LABELS[account.type]}</p>
        <div className="flex items-center gap-2">
          <Label htmlFor={switchId} className="text-muted-foreground text-xs">
            {included ? "Incluido en la renta" : "Se cobra aparte"}
          </Label>
          <Switch
            id={switchId}
            checked={included}
            onCheckedChange={(value) => setIncluded(Boolean(value))}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Proveedor" htmlFor={`prov-${account.id}`}>
          <Input
            id={`prov-${account.id}`}
            name="providerName"
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            placeholder="CFE, Totalplay…"
          />
        </Field>
        <Field
          label="Número de contrato"
          htmlFor={`num-${account.id}`}
          hint="El que viene en el recibo."
        >
          <Input
            id={`num-${account.id}`}
            name="contractNumber"
            value={contract}
            onChange={(e) => setContract(e.target.value)}
            placeholder="4471023"
            className="tabular-nums"
          />
        </Field>
      </div>

      {split ? (
        <SplitModeSelect id={`split-${account.id}`} value={split} onChange={setSplit} />
      ) : null}

      <FormError message={state.error} />

      <div className="flex justify-end">
        <Save dirty={dirty} />
      </div>
    </form>
  );
}
