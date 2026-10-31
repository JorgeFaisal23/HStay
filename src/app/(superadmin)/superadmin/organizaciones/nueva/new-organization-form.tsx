"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Field, FormError, NativeSelect } from "@/components/shared/form-field";
import { Callout } from "@/components/shared/callout";
import { ButtonLink } from "@/components/shared/button-link";
import { slugify } from "@/lib/slug";
import {
  createOrganization,
  type CreateOrganizationResult,
} from "@/server/superadmin/actions";
import { AccessDeliveryNotice } from "@/components/auth/access-delivery-notice";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Creando…" : "Crear arrendadora"}
    </Button>
  );
}

export function NewOrganizationForm() {
  const [state, formAction] = useActionState<CreateOrganizationResult, FormData>(
    createOrganization,
    {},
  );
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  // Mientras no se edite a mano, el slug sigue al nombre.
  const [slugTouched, setSlugTouched] = useState(false);

  if (state.ok && state.delivery) {
    return (
      <div className="space-y-5">
        <Callout tone="success" icon={CheckCircle2} title="Arrendadora creada">
          Su dueño entra en <strong>/a/{state.slug}/login</strong>.
        </Callout>
        <AccessDeliveryNotice delivery={state.delivery} />
        <div className="flex flex-wrap gap-2">
          <ButtonLink href={`/superadmin/organizaciones/${state.orgId}`}>
            Ver la arrendadora
            <ArrowRight className="size-4" aria-hidden />
          </ButtonLink>
          <ButtonLink href="/superadmin" variant="outline">
            Volver al listado
          </ButtonLink>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-6">
      <div className="space-y-4">
        <h2 className="text-sm font-medium">Arrendadora</h2>
        <Field label="Nombre" htmlFor="name" required hint="Su nombre comercial; con él arranca su marca.">
          <Input
            id="name"
            name="name"
            required
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!slugTouched) setSlug(slugify(e.target.value));
            }}
            placeholder="Rentas del Valle"
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Identificador"
            htmlFor="slug"
            required
            hint={`Su acceso será /a/${slug || "identificador"}/login`}
          >
            <Input
              id="slug"
              name="slug"
              required
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value.toLowerCase());
              }}
              placeholder="rentas-del-valle"
              autoCapitalize="none"
              spellCheck={false}
            />
          </Field>
          <Field label="Plan" htmlFor="plan">
            <NativeSelect id="plan" name="plan" defaultValue="FREE">
              <option value="FREE">Gratuito</option>
              <option value="PREMIUM">Premium</option>
            </NativeSelect>
          </Field>
          <Field
            label="Usuarios contratados"
            htmlFor="maxUsers"
            required
            hint="Cuentas activas que podrá tener: dueño, equipo e inquilinos. El dueño ocupa uno."
          >
            <Input
              id="maxUsers"
              name="maxUsers"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              required
              defaultValue={1}
              className="tabular-nums"
            />
          </Field>
        </div>
      </div>

      <Separator />

      <div className="space-y-4">
        <h2 className="text-sm font-medium">Dueño</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre completo" htmlFor="ownerName" required>
            <Input id="ownerName" name="ownerName" required placeholder="Carlos Márquez" />
          </Field>
          <Field
            label="Correo"
            htmlFor="ownerEmail"
            required
            hint="Con él entra. Recibe un enlace por correo o una contraseña temporal."
          >
            <Input
              id="ownerEmail"
              name="ownerEmail"
              type="email"
              required
              placeholder="dueno@ejemplo.com"
            />
          </Field>
        </div>
      </div>

      <FormError message={state.error} />

      <div className="flex justify-end">
        <Submit />
      </div>
    </form>
  );
}
