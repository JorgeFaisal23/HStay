"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/shared/form-field";
import { completePasswordLink, type LinkState } from "@/server/auth/public-actions";
import { NewPasswordFields } from "./password-fields";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Guardando…" : label}
    </Button>
  );
}

/** Elegir contraseña desde un enlace de invitación o de restablecimiento. */
export function PasswordLinkForm({
  token,
  purpose,
}: {
  token: string;
  purpose: "RESET" | "INVITE";
}) {
  const [state, formAction] = useActionState<LinkState, FormData>(completePasswordLink, {});

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="purpose" value={purpose} />
      <NewPasswordFields />
      <FormError message={state.error} />
      <Submit label={purpose === "INVITE" ? "Crear contraseña y entrar" : "Guardar y entrar"} />
    </form>
  );
}
