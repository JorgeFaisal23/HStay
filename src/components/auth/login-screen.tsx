import { Building2, CalendarRange, PauseCircle, Receipt } from "lucide-react";
import { BrandLogo } from "@/components/shared/brand-logo";
import { AppSignature } from "@/components/shared/app-signature";
import { AppMark, AppWordmark } from "@/components/shared/app-mark";
import { Callout } from "@/components/shared/callout";
import { LoginForm } from "@/components/auth/login-form";
import { APP_VERSION_LABEL } from "@/lib/app";
import type { BrandIdentity } from "@/lib/brand";
import { isDemoMode } from "@/lib/features";
import { demoAccountsFor } from "@/lib/demo-accounts";

const HIGHLIGHTS = [
  {
    icon: Building2,
    title: "Propiedades y contratos",
    text: "Cada cuarto con su renta, su inquilino y la vigencia a la vista.",
  },
  {
    icon: CalendarRange,
    title: "Un solo calendario",
    text: "Arrendamientos largos y reservas de corta estancia en la misma pantalla.",
  },
  {
    icon: Receipt,
    title: "Servicios bajo control",
    text: "Agua, luz e internet por propiedad, con totales automáticos.",
  },
];

/**
 * Pantalla de acceso. La comparten el acceso genérico (/login, con la marca
 * del producto) y el de cada arrendadora (/a/{slug}/login, con su marca).
 *
 * Los tokens de color ya vienen del layout: el genérico usa la marca del
 * producto y /a/{slug} inyecta la de la arrendadora. Aquí solo cambia qué
 * nombre y logo se muestran.
 */
export function LoginScreen({
  brand,
  orgSlug,
  suspended = false,
  redirigir,
  motivo,
}: {
  brand: BrandIdentity;
  /** Ausente en el acceso genérico. */
  orgSlug?: string;
  /** La arrendadora existe pero su acceso está suspendido. */
  suspended?: boolean;
  redirigir?: string;
  motivo?: string;
}) {
  const isProduct = !orgSlug;
  const demoAccounts = isDemoMode() ? demoAccountsFor(orgSlug ?? null) : [];

  const logo = isProduct ? (
    <AppMark className="size-9" />
  ) : (
    <BrandLogo brandName={brand.brandName} logoUrl={brand.logoUrl} />
  );

  return (
    <main className="grid min-h-svh lg:grid-cols-2">
      {/* Columna de marca: panel de vidrio sobre la aurora. Se oculta en
          celular para no empujar el formulario. */}
      <section className="glass m-4 hidden flex-col justify-between rounded-xl p-10 lg:flex">
        <div className="flex items-center gap-3">
          {isProduct ? (
            <AppWordmark className="text-lg" />
          ) : (
            <>
              <BrandLogo
                brandName={brand.brandName}
                logoUrl={brand.logoUrl}
                size="md"
              />
              <span className="text-lg font-semibold">{brand.brandName}</span>
              {/* El producto se presenta aparte de la marca, separado por una
                  línea, para que no se lean como un mismo nombre compuesto. */}
              <span className="text-muted-foreground ml-auto border-l pl-3">
                <AppWordmark variant="plain" className="text-sm" />
              </span>
            </>
          )}
        </div>

        <div className="max-w-md space-y-8">
          <div className="space-y-3">
            <h2 className="text-3xl font-semibold text-balance">
              La administración de tus rentas, en un solo lugar.
            </h2>
            <p className="text-muted-foreground text-pretty">
              Contratos, servicios, cobros y reservas. Tú y tu equipo trabajan
              sobre la misma información; tus inquilinos consultan la suya.
            </p>
          </div>

          <ul className="space-y-5">
            {HIGHLIGHTS.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-3">
                <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-md">
                  <Icon className="size-4" aria-hidden />
                </span>
                <div>
                  <p className="font-medium">{title}</p>
                  <p className="text-muted-foreground text-sm text-pretty">
                    {text}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-1">
          <p className="text-muted-foreground text-xs font-medium">
            {APP_VERSION_LABEL}
          </p>
          {demoAccounts.length > 0 ? (
            <p className="text-muted-foreground text-xs">
              Versión de demostración. Los datos mostrados son ficticios.
            </p>
          ) : null}
        </div>
      </section>

      <section className="flex items-center justify-center p-4 sm:p-10">
        <div className="glass w-full max-w-sm space-y-8 rounded-xl p-6 sm:p-8">
          <div className="space-y-2">
            <div className="flex items-center gap-3 lg:hidden">
              {logo}
              <span className="text-lg font-semibold">{brand.brandName}</span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Entra a tu cuenta
            </h1>
            <p className="text-muted-foreground text-sm text-pretty">
              Usa el correo con el que te dieron de alta.
            </p>
          </div>

          {suspended ? (
            <Callout tone="warning" icon={PauseCircle} title="Acceso suspendido">
              El acceso de {brand.brandName} está suspendido por el momento. Si
              eres parte de su equipo, contacta al administrador de la
              plataforma.
            </Callout>
          ) : (
            <LoginForm
              redirigir={redirigir}
              motivo={motivo}
              orgSlug={orgSlug}
              demoAccounts={demoAccounts}
            />
          )}

          {/* En celular la columna de marca no se ve; aquí queda la mención al
              producto. En el acceso genérico el producto ya es la marca. */}
          {isProduct ? null : (
            <AppSignature className="flex justify-center lg:hidden" />
          )}
        </div>
      </section>
    </main>
  );
}
