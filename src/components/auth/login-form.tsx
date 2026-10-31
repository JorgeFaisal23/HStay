"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { LogIn, ShieldAlert } from "lucide-react";
import { Callout } from "@/components/shared/callout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login, type LoginState } from "@/app/login/actions";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/labels";
import { DEMO_PASSWORD, type DemoAccount } from "@/lib/demo-accounts";

/** Avisos para `?motivo=` (ver SessionProblem en src/lib/auth/session.ts). */
const SESSION_NOTICES: Record<string, { title: string; text: string }> = {
  sesion_duplicada: {
    title: "Sesión cerrada",
    text: "Tu sesión se cerró porque se inició sesión en otro dispositivo o navegador. Vuelve a ingresar para continuar aquí.",
  },
  cuenta_inactiva: {
    title: "Sesión cerrada",
    text: "Tu cuenta ya no está activa o tu sesión expiró. Si crees que es un error, contacta a tu administrador.",
  },
  organizacion_suspendida: {
    title: "Acceso suspendido",
    text: "El acceso de tu arrendadora está suspendido. Contacta al administrador de la plataforma.",
  },
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      <LogIn className="size-4" aria-hidden />
      {pending ? "Entrando…" : "Entrar"}
    </Button>
  );
}

export function LoginForm({
  redirigir,
  motivo,
  orgSlug,
  demoAccounts = [],
}: {
  redirigir?: string;
  motivo?: string;
  /** En el acceso con marca: solo entran usuarios de esa arrendadora. */
  orgSlug?: string;
  /** Solo en modo demostración (ver isDemoMode en src/lib/features.ts). */
  demoAccounts?: DemoAccount[];
}) {
  const [state, formAction] = useActionState<LoginState, FormData>(login, {});
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <div className="space-y-6">
      {motivo && motivo in SESSION_NOTICES ? (
        <Callout
          tone="warning"
          icon={ShieldAlert}
          title={SESSION_NOTICES[motivo].title}
        >
          {SESSION_NOTICES[motivo].text}
        </Callout>
      ) : null}

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="redirigir" value={redirigir ?? ""} />
        <input type="hidden" name="orgSlug" value={orgSlug ?? ""} />

        <div className="space-y-2">
          <Label htmlFor="email">Correo electrónico</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="tucorreo@ejemplo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Contraseña</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        {state.error ? (
          <Callout tone="danger">{state.error}</Callout>
        ) : null}

        <SubmitButton />

        <p className="text-center text-sm">
          <Link
            href={orgSlug ? `/a/${orgSlug}/recuperar` : "/recuperar"}
            className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
          >
            ¿Olvidaste tu contraseña?
          </Link>
        </p>
      </form>

      {demoAccounts.length > 0 ? (
        <div className="space-y-3 rounded-lg border border-dashed p-4">
          <div>
            <p className="text-sm font-medium">Cuentas de demostración</p>
            <p className="text-muted-foreground text-xs">
              Elige un perfil para llenar el formulario y ver la plataforma desde
              ese rol.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {demoAccounts.map((account) => (
              <button
                key={account.email}
                type="button"
                onClick={() => {
                  setEmail(account.email);
                  setPassword(DEMO_PASSWORD);
                }}
                className="hover:border-primary/60 hover:bg-accent focus-visible:ring-ring rounded-lg border p-2.5 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none"
              >
                <span className="block text-sm font-medium">
                  {ROLE_LABELS[account.role]}
                </span>
                <span className="text-muted-foreground block text-xs text-pretty">
                  {/* En el acceso genérico hay cuentas de varias arrendadoras. */}
                  {!orgSlug && account.orgName
                    ? account.orgName
                    : ROLE_DESCRIPTIONS[account.role]}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
