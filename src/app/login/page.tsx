import type { Metadata } from "next";
import { LoginScreen } from "@/components/auth/login-screen";
import { APP_BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: "Entrar" };

/**
 * Acceso genérico con la marca del producto: sirve para cualquier usuario (el
 * correo es único en la plataforma) y es el del superadministrador. Cada
 * arrendadora tiene además el suyo, con su marca, en /a/{slug}/login.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirigir?: string; motivo?: string }>;
}) {
  const { redirigir, motivo } = await searchParams;
  return <LoginScreen brand={APP_BRAND} redirigir={redirigir} motivo={motivo} />;
}
