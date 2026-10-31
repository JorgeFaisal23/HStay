import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginScreen } from "@/components/auth/login-screen";
import { getOrgBySlug } from "@/lib/org";

export const metadata: Metadata = { title: "Entrar" };

/** Acceso con la marca de una arrendadora: solo entran sus usuarios. */
export default async function OrgLoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ redirigir?: string; motivo?: string }>;
}) {
  const [{ slug }, { redirigir, motivo }] = await Promise.all([params, searchParams]);
  const org = await getOrgBySlug(slug);
  // Un slug que ya no existe (por ejemplo, la plataforma lo cambió y el
  // navegador recordaba el anterior) lleva al acceso genérico, no a un 404.
  if (!org) redirect("/login");

  return (
    <LoginScreen
      brand={org}
      orgSlug={org.slug}
      suspended={org.status !== "ACTIVE"}
      redirigir={redirigir}
      motivo={motivo}
    />
  );
}
