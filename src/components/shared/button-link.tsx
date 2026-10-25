import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * Botón que navega. Base UI compone con `render` en lugar de `asChild`;
 * envolverlo aquí evita repetir ese detalle en cada página.
 *
 * `nativeButton={false}`: lo que se pinta es un enlace (<a>), no un <button>.
 * Sin esto Base UI le pone semántica de botón a un enlace y lo avisa en consola.
 */
export function ButtonLink({
  href,
  children,
  ...props
}: { href: string } & Omit<React.ComponentProps<typeof Button>, "render">) {
  return (
    <Button render={<Link href={href} />} nativeButton={false} {...props}>
      {children}
    </Button>
  );
}
