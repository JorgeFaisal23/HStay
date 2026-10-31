"use client";

import { useActionState, useRef } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Callout } from "@/components/shared/callout";
import { Field, FormError } from "@/components/shared/form-field";
import { changePassword, type PasswordFormState } from "@/server/auth/account-actions";
import { NewPasswordFields } from "./password-fields";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Guardando…" : label}
    </Button>
  );
}

/**
 * Cambio de contraseña con sesión. `forced`: cuenta con contraseña temporal,
 * no se pide la actual y al guardar se entra a la app.
 */
export function ChangePasswordForm({ forced = false }: { forced?: boolean }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState<PasswordFormState, FormData>(
    async (prev, formData) => {
      const result = await changePassword(prev, formData);
      if (result.ok) formRef.current?.reset();
      return result;
    },
    {},
  );

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      {forced ? null : (
        <Field label="Contraseña actual" htmlFor="current" required>
          <Input
            id="current"
            name="current"
            type="password"
            autoComplete="current-password"
            required
          />
        </Field>
      )}
      <NewPasswordFields />
      <FormError message={state.error} />
      {state.ok ? (
        <Callout tone="success" icon={CheckCircle2}>
          Listo. Tu contraseña cambió y se cerraron tus otras sesiones.
        </Callout>
      ) : null}
      <div className={forced ? "" : "flex justify-end"}>
        <Submit label={forced ? "Guardar y continuar" : "Cambiar contraseña"} />
      </div>
    </form>
  );
}
