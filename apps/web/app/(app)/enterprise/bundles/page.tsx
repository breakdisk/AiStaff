import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getMyOrg, fetchOrgBundles, type Bundle } from "@/lib/enterpriseApi";
import { fetchListings, type AgentListing } from "@/lib/api";
import { BundleEditor } from "./BundleEditor";

export default async function BundlesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const profileId = (session.user as { profileId?: string }).profileId ?? "";

  if (!profileId) {
    return (
      <div className="max-w-4xl mx-auto py-6 px-4">
        <p className="text-sm text-zinc-500">No profile linked to this account.</p>
      </div>
    );
  }

  // Resolve orgId server-side — not stored on the session token
  let orgId = "";
  try {
    const org = await getMyOrg(profileId);
    orgId = org.id;
  } catch {
    // User has no org
  }

  if (!orgId) {
    return (
      <div className="max-w-4xl mx-auto py-6 px-4">
        <p className="text-sm text-zinc-500">No organisation linked to this account.</p>
      </div>
    );
  }

  const [{ bundles: initialBundles }, { listings }] = await Promise.all([
    fetchOrgBundles(orgId).catch(() => ({ bundles: [] as Bundle[] })),
    fetchListings().catch(() => ({ listings: [] as AgentListing[] })),
  ]);

  const orgListings = listings.filter(
    (l) => l.org_id === orgId && l.listing_status === "APPROVED",
  );

  return (
    <div className="max-w-4xl mx-auto py-6 px-4">
      <BundleEditor orgId={orgId} initialBundles={initialBundles} orgListings={orgListings} />
    </div>
  );
}
