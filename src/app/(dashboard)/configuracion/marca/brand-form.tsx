"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Check, ImageUp, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FormError, NativeSelect } from "@/components/shared/form-field";
import {
  BRAND_PRESETS,
  FONT_OPTIONS,
  RADIUS_LABELS,
  RADIUS_VALUES,
  contrastRatio,
  readableForeground,
} from "@/lib/brand";
import type { BorderRadius } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";
import { updateBrand } from "@/server/actions/brand";
import type { ActionResult } from "@/lib/action-result";

const RADII: BorderRadius[] = ["SHARP", "SOFT", "ROUND"];
const MAX_LOGO_BYTES = 300 * 1024;

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Guardando…" : "Guardar y aplicar"}
    </Button>
  );
}

export function BrandForm({
  initial,
}: {
  initial: {
    brandName: string;
    logoUrl: string | null;
    primaryColor: string;
    radius: BorderRadius;
    fontFamily: string;
    contactEmail: string | null;
    contactPhone: string | null;
  };
}) {
  const router = useRouter();
  const [state, formAction] = useActionState<ActionResult, FormData>(
    updateBrand,
    {},
  );

  const [brandName, setBrandName] = useState(initial.brandName);
  const [color, setColor] = useState(initial.primaryColor);
  const [radius, setRadius] = useState<BorderRadius>(initial.radius);
  const [font, setFont] = useState(initial.fontFamily);
  const [logo, setLogo] = useState<string | null>(initial.logoUrl);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.ok) {
      toast.success("Marca actualizada. Ya se aplicó en toda la plataforma.");
      router.refresh();
    }
  }, [state.ok, router]);

  const readFile = (file: File) => {
    if (file.size > MAX_LOGO_BYTES) {
      toast.error("La imagen es muy pesada. Usa una de menos de 300 KB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setLogo(String(reader.result));
    reader.readAsDataURL(file);
  };

  const foreground = readableForeground(color);
  const contrast = contrastRatio(color, foreground);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      {/* ------------------------------------------------------ formulario */}
      <form action={formAction} className="space-y-6">
        <input type="hidden" name="logoUrl" value={logo ?? ""} />

        <Card>
          <CardContent className="space-y-5">
            <Field label="Nombre de la marca" htmlFor="brandName" required>
              <Input
                id="brandName"
                name="brandName"
                required
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
              />
            </Field>

            <div className="space-y-2">
              <p className="text-sm font-medium">Logo</p>
              <div className="flex flex-wrap items-center gap-3">
                <div className="bg-muted flex size-14 items-center justify-center overflow-hidden rounded-md border">
                  {logo ? (
                    // Imagen subida por el usuario: data URL, sin optimización.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={logo}
                      alt="Vista previa del logo"
                      className="size-full object-contain"
                    />
                  ) : (
                    <span
                      className="flex size-full items-center justify-center text-lg font-semibold"
                      style={{ background: color, color: foreground }}
                    >
                      {brandName.charAt(0).toUpperCase() || "R"}
                    </span>
                  )}
                </div>

                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) readFile(file);
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileRef.current?.click()}
                >
                  <ImageUp className="size-4" aria-hidden />
                  Subir imagen
                </Button>
                {logo ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setLogo(null);
                      if (fileRef.current) fileRef.current.value = "";
                    }}
                  >
                    <Trash2 className="size-4" aria-hidden />
                    Quitar
                  </Button>
                ) : null}
              </div>
              <p className="text-muted-foreground text-xs">
                PNG, JPG o SVG de menos de 300 KB. Sin logo se usa la inicial
                sobre tu color de marca.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <p className="text-sm font-medium">Color principal</p>
              <div className="flex flex-wrap items-center gap-2">
                {BRAND_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    aria-label={`Usar el color ${preset}`}
                    aria-pressed={color.toLowerCase() === preset.toLowerCase()}
                    onClick={() => setColor(preset)}
                    className={cn(
                      "focus-visible:ring-ring flex size-8 items-center justify-center rounded-full transition-shadow focus-visible:ring-3 focus-visible:outline-none",
                      color.toLowerCase() === preset.toLowerCase() &&
                        "ring-foreground/30 ring-2 ring-offset-2",
                    )}
                    style={{ background: preset }}
                  >
                    {color.toLowerCase() === preset.toLowerCase() ? (
                      <Check
                        className="size-4"
                        style={{ color: readableForeground(preset) }}
                        aria-hidden
                      />
                    ) : null}
                  </button>
                ))}

                <label className="ml-1 flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Personalizado</span>
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="border-input size-8 cursor-pointer rounded-md border bg-transparent p-0.5"
                    aria-label="Color personalizado"
                  />
                </label>
              </div>
              <input type="hidden" name="primaryColor" value={color} />
              <p className="text-muted-foreground text-xs">
                Contraste del texto sobre el botón: {contrast.toFixed(1)}:1
                {contrast >= 4.5 ? " · legible" : " · el texto se ajusta solo"}
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Bordes</p>
              <div className="flex flex-wrap gap-2">
                {RADII.map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={radius === option}
                    onClick={() => setRadius(option)}
                    className={cn(
                      "flex items-center gap-2 border px-3 py-2 text-sm transition-colors",
                      radius === option
                        ? "border-primary bg-primary/5"
                        : "hover:bg-accent",
                    )}
                    style={{ borderRadius: RADIUS_VALUES[option] }}
                  >
                    <span
                      className="bg-primary size-4"
                      style={{ borderRadius: RADIUS_VALUES[option] }}
                      aria-hidden
                    />
                    {RADIUS_LABELS[option]}
                  </button>
                ))}
              </div>
              <input type="hidden" name="radius" value={radius} />
            </div>

            <Field label="Tipografía" htmlFor="fontFamily">
              <NativeSelect
                id="fontFamily"
                name="fontFamily"
                value={font}
                onChange={(e) => setFont(e.target.value)}
              >
                {FONT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-5">
            <div>
              <p className="text-sm font-medium">Datos de contacto</p>
              <p className="text-muted-foreground text-xs text-pretty">
                Se muestran a tus inquilinos en el portal.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Correo de contacto" htmlFor="contactEmail">
                <Input
                  id="contactEmail"
                  name="contactEmail"
                  type="email"
                  defaultValue={initial.contactEmail ?? ""}
                  placeholder="contacto@tumarca.mx"
                />
              </Field>
              <Field label="Teléfono" htmlFor="contactPhone">
                <Input
                  id="contactPhone"
                  name="contactPhone"
                  defaultValue={initial.contactPhone ?? ""}
                  placeholder="55 1122 3344"
                />
              </Field>
            </div>
          </CardContent>
        </Card>

        <FormError message={state.error} />

        <div className="flex justify-end">
          <Submit />
        </div>
      </form>

      {/* ----------------------------------------------------- vista previa */}
      <div className="lg:sticky lg:top-20 lg:self-start">
        <BrandPreview
          brandName={brandName}
          logo={logo}
          color={color}
          radius={radius}
          font={font}
        />
      </div>
    </div>
  );
}

/**
 * Vista previa en vivo. Aplica los tokens con estilos en línea sobre su propio
 * contenedor, así se ve el resultado antes de guardar sin afectar al resto de
 * la pantalla.
 */
function BrandPreview({
  brandName,
  logo,
  color,
  radius,
  font,
}: {
  brandName: string;
  logo: string | null;
  color: string;
  radius: BorderRadius;
  font: string;
}) {
  const foreground = readableForeground(color);
  const fontVariable =
    FONT_OPTIONS.find((f) => f.value === font)?.variable ??
    FONT_OPTIONS[0].variable;
  const r = RADIUS_VALUES[radius];

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">Vista previa</p>

      <div
        className="bg-card space-y-4 border p-4"
        style={{ borderRadius: r, fontFamily: fontVariable }}
      >
        {/* Barra superior */}
        <div className="flex items-center gap-2.5 border-b pb-3">
          <span
            className="flex size-8 shrink-0 items-center justify-center overflow-hidden text-sm font-semibold"
            style={{ background: logo ? "transparent" : color, color: foreground, borderRadius: r }}
          >
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="" className="size-full object-contain" />
            ) : (
              (brandName.charAt(0).toUpperCase() || "R")
            )}
          </span>
          <span className="truncate text-sm font-semibold">
            {brandName || "Tu marca"}
          </span>
        </div>

        {/* Tarjeta de ejemplo */}
        <div className="space-y-3 border p-3" style={{ borderRadius: r }}>
          <p className="text-sm font-medium">Unidad 101</p>
          <p className="text-muted-foreground text-xs">
            Edificio Reforma · María Fernanda López
          </p>
          <div className="flex items-center justify-between">
            <span className="text-lg font-semibold tabular-nums">$6,500.00</span>
            <span
              className="px-2 py-0.5 text-2xs font-medium"
              style={{
                background: `color-mix(in oklch, ${color}, transparent 88%)`,
                color,
                borderRadius: r,
              }}
            >
              Vigente
            </span>
          </div>
        </div>

        {/* Botones */}
        <div className="flex gap-2">
          <button
            type="button"
            tabIndex={-1}
            className="flex-1 px-3 py-2 text-sm font-medium"
            style={{ background: color, color: foreground, borderRadius: r }}
          >
            Registrar pago
          </button>
          <button
            type="button"
            tabIndex={-1}
            className="border px-3 py-2 text-sm font-medium"
            style={{ borderRadius: r }}
          >
            Cancelar
          </button>
        </div>
      </div>

      <p className="text-muted-foreground text-xs text-pretty">
        Al guardar, estos ajustes se aplican al panel, al portal del inquilino y
        a la pantalla de acceso.
      </p>
    </div>
  );
}
