"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { MailCheck, UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Callout } from "@/components/shared/callout";
import { Field, FormError } from "@/components/shared/form-field";
import { requestPasswordReset, type RecoverState } from "@/server/auth/public-actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Enviando…" : "Enviarme el enlace"}
    </Button>
  );
}

export function RecoverForm({
  orgSlug,
  loginPath,
}: {
  orgSlug?: string;
  loginPath: string;
}) {
  const [state, formAction] = useActionState<RecoverState, FormData>(requestPasswordReset, {});

  const back = (
    <p className="text-center text-sm">
      <Link href={loginPath} className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline">
        Volver a entrar
      </Link>
    </p>
  );

  if (state.sent) {
    return (
      <div className="space-y-4">
        <Callout tone="success" icon={MailCheck} title="Revisa tu correo">
          Si hay una cuenta con ese correo, te enviamos un enlace para elegir una
          contraseña nueva. Vence en una hora y solo funciona una vez.
        </Callout>
        {back}
      </div>
    );
  }

  if (state.manual) {
    return (
      <div className="space-y-4">
        <Callout tone="info" icon={UserCog} title="Pídeselo a tu administrador">
          Por ahora las contraseñas no se restablecen por correo. Pide a quien
          administra tu cuenta (tu arrendador o su equipo) que te genere una
          contraseña temporal.
        </Callout>
        {back}
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="orgSlug" value={orgSlug ?? ""} />
      <Field label="Correo electrónico" htmlFor="email" required>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="tucorreo@ejemplo.com"
          required
        />
      </Field>
      <FormError message={state.error} />
      <Submit />
      {back}
    </form>
  );
}
