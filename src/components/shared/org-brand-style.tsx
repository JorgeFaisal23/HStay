import { brandStyleSheet, type BrandInput } from "@/lib/brand";

/**
 * Tokens de marca de una arrendadora para páginas sin sesión (su acceso, los
 * enlaces de correo). El layout raíz ya pintó la marca del producto; este
 * bloque va después en el documento y con los mismos selectores, así que gana.
 */
export function OrgBrandStyle({ brand }: { brand: BrandInput }) {
  return (
    <style
      id="org-brand-tokens"
      dangerouslySetInnerHTML={{
        __html: brandStyleSheet({
          primaryColor: brand.primaryColor,
          radius: brand.radius,
          fontFamily: brand.fontFamily,
        }),
      }}
    />
  );
}
