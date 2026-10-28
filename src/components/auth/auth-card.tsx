import { AppMark } from "@/components/shared/app-mark";
import { AppSignature } from "@/components/shared/app-signature";
import { BrandLogo } from "@/components/shared/brand-logo";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Pantalla corta de acceso (recuperar, restablecer, invitación, cambio
 * obligatorio): tarjeta centrada con la marca arriba. Sin `brand` se presenta
 * con la del producto.
 */
export function AuthCard({
  brand,
  title,
  description,
  children,
}: {
  brand?: { brandName: string; logoUrl: string | null } | null;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 p-6">
      <div className="flex items-center gap-3">
        {brand ? (
          <>
            <BrandLogo brandName={brand.brandName} logoUrl={brand.logoUrl} />
            <span className="text-lg font-semibold">{brand.brandName}</span>
          </>
        ) : (
          <AppMark className="size-9" />
        )}
      </div>

      <Card className="w-full max-w-md">
        <CardContent className="space-y-6">
          <div className="space-y-1.5">
            <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
            {description ? (
              <p className="text-muted-foreground text-sm text-pretty">{description}</p>
            ) : null}
          </div>
          {children}
        </CardContent>
      </Card>

      {brand ? <AppSignature /> : null}
    </main>
  );
}
