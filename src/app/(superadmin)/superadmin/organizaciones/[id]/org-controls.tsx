"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { PauseCircle, PlayCircle, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Field, FormError } from "@/components/shared/form-field";
import { Callout } from "@/components/shared/callout";
import {
  setOrganizationPlan,
  setOrganizationStatus,
  setUserQuota,
  updateOrganization,
} from "@/server/superadmin/actions";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Guardando…" : "Guardar"}
    </Button>
  );
}

/** Nombre interno y slug (URL de su acceso con marca). */
export function OrganizationDetailsForm({
  orgId,
  name,
  slug,
}: {
  orgId: string;
  name: string;
  slug: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [draftSlug, setDraftSlug] = useState(slug);

  async function submit(formData: FormData) {
    const result = await updateOrganization({}, formData);
    if (result.error) {
      setError(result.error);
      return;
    }
    setError(undefined);
    toast.success("Datos guardados.");
    router.refresh();
  }

  return (
    <form action={submit} className="space-y-4">
      <input type="hidden" name="orgId" value={orgId} />
      <Field label="Nombre" htmlFor="name" required>
        <Input id="name" name="name" defaultValue={name} required />
      </Field>
      <Field
        label="Identificador"
        htmlFor="slug"
        required
        hint={
          draftSlug === slug
            ? `Acceso: /a/${slug}/login`
            : `El acceso pasará a /a/${draftSlug || "…"}/login; el anterior dejará de funcionar.`
        }
      >
        <Input
          id="slug"
          name="slug"
          value={draftSlug}
          onChange={(e) => setDraftSlug(e.target.value.toLowerCase())}
          required
          autoCapitalize="none"
          spellCheck={false}
        />
      </Field>
      <FormError message={error} />
      <div className="flex justify-end">
        <SaveButton />
      </div>
    </form>
  );
}

export function PlanControl({ orgId, plan }: { orgId: string; plan: "FREE" | "PREMIUM" }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const next = plan === "PREMIUM" ? "FREE" : "PREMIUM";

  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await setOrganizationPlan(orgId, next);
          if (result.error) {
            toast.error(result.error);
            return;
          }
          toast.success(next === "PREMIUM" ? "Premium activado." : "Plan cambiado a gratuito.");
          router.refresh();
        })
      }
    >
      <Sparkles className="size-4" aria-hidden />
      {next === "PREMIUM" ? "Activar Premium" : "Pasar a gratuito"}
    </Button>
  );
}

/** Suspender pide confirmación: saca de inmediato a todos sus usuarios. */
export function StatusControl({
  orgId,
  name,
  status,
}: {
  orgId: string;
  name: string;
  status: "ACTIVE" | "SUSPENDED";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const apply = (next: "ACTIVE" | "SUSPENDED") =>
    startTransition(async () => {
      const result = await setOrganizationStatus(orgId, next);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setOpen(false);
      toast.success(next === "SUSPENDED" ? "Acceso suspendido." : "Acceso reactivado.");
      router.refresh();
    });

  if (status === "SUSPENDED") {
    return (
      <Button disabled={pending} onClick={() => apply("ACTIVE")}>
        <PlayCircle className="size-4" aria-hidden />
        Reactivar acceso
      </Button>
    );
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button variant="destructive">
            <PauseCircle className="size-4" aria-hidden />
            Suspender acceso
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Suspender a {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Su dueño, su equipo y sus inquilinos salen de inmediato y no podrán
            volver a entrar hasta que la reactives. Sus datos se conservan.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <Button variant="destructive" disabled={pending} onClick={() => apply("SUSPENDED")}>
            {pending ? "Suspendiendo…" : "Suspender"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Usuarios contratados (cuentas activas: dueño, equipo e inquilinos). Bajarlo
 * por debajo de los activos no saca a nadie.
 */
export function UserQuotaControl({
  orgId,
  maxUsers,
  activeUsers,
}: {
  orgId: string;
  maxUsers: number;
  activeUsers: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const [draft, setDraft] = useState(String(maxUsers));

  const value = Number(draft);
  const valid = draft.trim() !== "" && Number.isInteger(value);
  const belowActive = valid && value < activeUsers;

  const save = () =>
    startTransition(async () => {
      if (!valid) {
        setError("Escribe un número entero.");
        return;
      }
      const result = await setUserQuota(orgId, value);
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(undefined);
      toast.success("Usuarios contratados guardados.");
      router.refresh();
    });

  return (
    <div className="space-y-4">
      <Field
        label="Usuarios contratados"
        htmlFor="max-users"
        hint="Cuentas activas que puede tener: dueño, equipo e inquilinos."
      >
        <Input
          id="max-users"
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="max-w-40 tabular-nums"
        />
      </Field>
      {belowActive ? (
        <Callout tone="warning">
          Tiene {activeUsers} cuentas activas. Nadie pierde acceso; solo no podrá
          dar de alta ni reactivar cuentas hasta quedar por debajo de lo contratado.
        </Callout>
      ) : null}
      <FormError message={error} />
      <div className="flex justify-end">
        <Button variant="outline" disabled={pending || value === maxUsers} onClick={save}>
          {pending ? "Guardando…" : "Guardar"}
        </Button>
      </div>
    </div>
  );
}
