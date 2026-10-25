"use client";

import { useRef, useState } from "react";
import { Camera, ImageUp, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { compressImage, dataUrlBytes } from "@/lib/images";

/**
 * Foto de un comprobante: tomarla con la cámara (en celular `capture` la abre
 * directo) o elegir una imagen. Se comprime en el navegador, porque una foto
 * de celular sin reducir no cabe, y se entrega como data URL.
 *
 * La usan el registro de pago del equipo y el envío de comprobantes del
 * inquilino.
 */
export function ReceiptPicker({
  value,
  onChange,
  onProcessingChange,
  required = false,
  hint,
}: {
  value: string | null;
  onChange: (dataUrl: string | null) => void;
  onProcessingChange?: (processing: boolean) => void;
  required?: boolean;
  hint: string;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [processing, setProcessing] = useState(false);

  const setBusy = (busy: boolean) => {
    setProcessing(busy);
    onProcessingChange?.(busy);
  };

  const handleFile = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    // Se limpia para que elegir la misma imagen otra vez vuelva a funcionar.
    input.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("El comprobante debe ser una imagen.");
      return;
    }

    setBusy(true);
    try {
      const dataUrl = await compressImage(file);
      onChange(dataUrl);
      toast.success(`Comprobante listo (${Math.round(dataUrlBytes(dataUrl) / 1024)} KB).`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo leer la imagen.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">
        Comprobante{" "}
        <span className="text-muted-foreground font-normal">{required ? "*" : "(opcional)"}</span>
      </p>

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => handleFile(e.currentTarget)}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => handleFile(e.currentTarget)}
      />

      {value ? (
        <div className="space-y-2">
          <div className="bg-muted overflow-hidden rounded-lg border">
            {/* Vista previa de un data URL: next/image no aporta nada aquí. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value} alt="Vista previa del comprobante" className="max-h-56 w-full object-contain" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
              Cambiar
            </Button>
            <Button type="button" variant="ghost" onClick={() => onChange(null)}>
              <Trash2 className="size-4" aria-hidden />
              Quitar
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={processing}
              onClick={() => cameraRef.current?.click()}
            >
              {processing ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Camera className="size-4" aria-hidden />
              )}
              Tomar foto
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={processing}
              onClick={() => fileRef.current?.click()}
            >
              <ImageUp className="size-4" aria-hidden />
              Subir imagen
            </Button>
          </div>
          <p className="text-muted-foreground text-xs text-pretty">{hint}</p>
        </>
      )}
    </div>
  );
}
