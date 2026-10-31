import type { Metadata } from "next";
import { OrgBrandStyle } from "@/components/shared/org-brand-style";
import { getOrgBySlug } from "@/lib/org";

/**
 * Páginas públicas de una arrendadora (/a/{slug}/…): su acceso y su
 * recuperación de contraseña, con su marca.
 */

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const org = await getOrgBySlug(slug);
  if (!org) return {};
  return {
    title: { default: org.brandName, template: `%s · ${org.brandName}` },
    appleWebApp: { title: org.brandName },
  };
}

export default async function OrgPublicLayout({
  children,
  params,
}: Params & { children: React.ReactNode }) {
  const { slug } = await params;
  const org = await getOrgBySlug(slug);
  // Sin arrendadora (slug inexistente o cambiado) cada página decide qué
  // hacer; el acceso, por ejemplo, manda al genérico.
  if (!org) return children;

  return (
    <>
      <OrgBrandStyle brand={org} />
      {children}
    </>
  );
}
