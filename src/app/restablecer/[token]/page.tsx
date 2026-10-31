import type { Metadata } from "next";
import { TokenPage } from "@/components/auth/token-page";

export const metadata: Metadata = {
  title: "Restablecer contraseña",
  // El token va en la URL: que no se filtre a otros sitios por el Referer.
  referrer: "no-referrer",
};

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <TokenPage token={token} purpose="RESET" />;
}
