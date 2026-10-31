"use client";

import { useState, useTransition, type FormEvent } from "react";
import type { ActionResult } from "@/lib/action-result";

type FormAction = (formData: FormData) => Promise<ActionResult | void>;

/**
 * Envía un formulario a una Server Action sin que React lo vacíe.
 *
 * Con `<form action={...}>`, React 19 limpia los campos al terminar la acción
 * aunque haya regresado un error, y quien captura pierde todo. Aquí el envío
 * sale de `onSubmit`: si hay error los campos se quedan como estaban y solo se
 * muestra el mensaje para corregirlo. Si la acción redirige, Next navega igual.
 */
export function useFormAction(
  action: FormAction,
  options: { onSuccess?: () => void } = {},
) {
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await action(formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setError(undefined);
      options.onSuccess?.();
    });
  }

  return { onSubmit, pending, error, clearError: () => setError(undefined) };
}
