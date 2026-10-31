"use client";

import { useState, useTransition, type FormEvent } from "react";
import type { ActionResult } from "@/server/actions/properties";

type ServerAction = (prev: ActionResult, formData: FormData) => Promise<ActionResult>;

/**
 * Envía un formulario a una Server Action sin que React lo limpie.
 *
 * Con `<form action={...}>` React 19 vacía los campos al terminar la acción,
 * aunque haya regresado un error: el usuario pierde todo lo que capturó. Aquí
 * el envío se hace desde `onSubmit`, así que los campos quedan como estaban y
 * solo se muestra el error para corregirlo.
 */
export function useFormAction(
  action: ServerAction,
  options: { onSuccess?: (result: ActionResult) => void } = {},
) {
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await action({}, formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setError(undefined);
      options.onSuccess?.(result ?? {});
    });
  }

  return { onSubmit, pending, error, clearError: () => setError(undefined) };
}
