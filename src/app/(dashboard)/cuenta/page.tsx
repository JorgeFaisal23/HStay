import type { Metadata } from "next";
import { AccountPanel } from "@/components/auth/account-panel";
import { requireOrgUser } from "@/lib/auth/session";
import { requireCurrentOrg } from "@/lib/org";

export const metadata: Metadata = { title: "Mi cuenta" };

export default async function AccountPage() {
  const { session } = await requireOrgUser(["OWNER", "ADMIN", "VIEWER"]);
  const org = await requireCurrentOrg();
  return <AccountPanel session={session} orgName={org.brandName} />;
}
