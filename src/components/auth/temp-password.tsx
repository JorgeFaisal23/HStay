"use client";

import { useState } from "react";
import { Check, Copy, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Contraseña temporal recién generada. Se muestra una sola vez: en la base solo
 * queda su hash, así que si se pierde hay que generar otra.
 */
export function TempPassword({ email, password }: { email: string; password: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="space-y-3 rounded-lg border border-dashed p-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <KeyRound className="text-muted-foreground size-4" aria-hidden />
        Contraseña temporal de {email}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <code className="bg-muted rounded-md px-3 py-1.5 font-mono text-base tracking-wider select-all">
          {password}
        </code>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(password);
              setCopied(true);
            } catch {
              // Sin permiso de portapapeles: el texto se puede seleccionar a mano.
            }
          }}
        >
          {copied ? (
            <Check className="size-4" aria-hidden />
          ) : (
            <Copy className="size-4" aria-hidden />
          )}
          {copied ? "Copiada" : "Copiar"}
        </Button>
      </div>
      <p className="text-muted-foreground text-xs text-pretty">
        Compártela por un medio seguro. No se volverá a mostrar: si se pierde,
        genera otra.
      </p>
    </div>
  );
}
