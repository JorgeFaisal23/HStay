import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { RecoverForm } from "@/components/auth/recover-form";
import { getOrgBySlug } from "@/lib/org";

export const metadata: Metadata = { title: "Recuperar contraseña" };

export default async function OrgRecoverPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const org = await getOrgBySlug(slug);
  if (!org) redirect("/recuperar");

  return (
    <AuthCard
      brand={org}
      title="¿Olvidaste tu contraseña?"
      description="Escribe el correo con el que entras y te mandamos un enlace para elegir una nueva."
    >
      <RecoverForm orgSlug={org.slug} loginPath={`/a/${org.slug}/login`} />
    </AuthCard>
  );
}
