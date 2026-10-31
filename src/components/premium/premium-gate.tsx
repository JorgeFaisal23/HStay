import { Lock, Sparkles } from "lucide-react";
import { ButtonLink } from "@/components/shared/button-link";
import { isPremium } from "@/lib/org";

/**
 * Muro de pago. Renderiza el contenido real difuminado y encima el candado:
 * el interesado tiene que poder *ver* lo que compraría, no un cartel vacío.
 * El contenido queda inerte (pointer-events-none, aria-hidden) para que ni el
 * ratón ni un lector de pantalla entren en él.
 */
export async function PremiumGate({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  if (await isPremium()) return <>{children}</>;

  return (
    <div className="relative">
      <div
        className="pointer-events-none max-h-[70vh] overflow-hidden blur-[3px] select-none"
        aria-hidden
        inert
      >
        {children}
      </div>

      <div className="via-background/40 to-background/70 absolute inset-0 flex items-center justify-center bg-gradient-to-b p-6">
        <div className="glass-strong w-full max-w-md rounded-xl p-6 text-center">
          <div className="bg-primary/10 text-primary mx-auto flex size-11 items-center justify-center rounded-full">
            <Lock className="size-5" aria-hidden />
          </div>
          <p className="text-primary mt-3 text-xs font-semibold tracking-wide uppercase">
            Disponible en Premium
          </p>
          <h2 className="mt-1 text-lg font-semibold text-balance">{title}</h2>
          <p className="text-muted-foreground mt-2 text-sm text-pretty">
            {description}
          </p>
          <ButtonLink href="/premium" className="mt-5 w-full">
              <Sparkles className="size-4" aria-hidden />
              Ver planes
            </ButtonLink>
        </div>
      </div>
    </div>
  );
}
