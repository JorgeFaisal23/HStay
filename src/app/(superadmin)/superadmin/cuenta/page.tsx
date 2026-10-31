import type { Metadata } from "next";
import { AccountPanel } from "@/components/auth/account-panel";
import { requireSuperadmin } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Mi cuenta" };

export default async function SuperadminAccountPage() {
  const session = await requireSuperadmin();
  return <AccountPanel session={session} />;
}
