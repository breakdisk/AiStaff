import { notFound } from "next/navigation";
import { ExternalLink, Users, Package, Zap } from "lucide-react";
import { fetchAgencyProfile, fetchListings, type AgencyProfile, type AgentListing } from "@/lib/api";
import { VerifiedBadge } from "@/components/VerifiedBadge";

function fmtUSD(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export default async function AgencyProfilePage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;

  let profile: AgencyProfile;
  try {
    profile = await fetchAgencyProfile(handle);
  } catch {
    notFound();
  }

  // Fetch org's active listings
  let orgListings: AgentListing[] = [];
  try {
    const { listings } = await fetchListings();
    orgListings = listings.filter((l) => l.org_id === profile.id).slice(0, 12);
  } catch {
    // Non-fatal
  }

  const planLabel =
    profile.plan_tier === "PLATINUM"   ? "★ PLATINUM"   :
    profile.plan_tier === "ENTERPRISE" ? "● ENTERPRISE" :
                                         "● GROWTH";

  const planStyle =
    profile.plan_tier === "PLATINUM"   ? "border-violet-800 text-violet-400" :
    profile.plan_tier === "ENTERPRISE" ? "border-amber-800 text-amber-400"   :
                                         "border-zinc-700 text-zinc-500";

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">

        {/* Hero */}
        <div className="border border-zinc-800 bg-zinc-900 rounded-sm p-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-semibold text-zinc-50 truncate">{profile.name}</h1>
                <VerifiedBadge planTier={profile.plan_tier} />
                <span className={`font-mono text-[10px] px-2 py-0.5 rounded-sm border ${planStyle}`}>
                  {planLabel}
                </span>
              </div>
              <p className="font-mono text-xs text-zinc-500">@{profile.handle}</p>
              {profile.description && (
                <p className="text-sm text-zinc-400 mt-2 leading-relaxed">
                  {profile.description}
                </p>
              )}
            </div>
            <a
              href={`/marketplace?org=${profile.id}`}
              className="shrink-0 flex items-center gap-1.5 px-3 py-2 bg-amber-400 text-zinc-950 font-mono text-xs font-semibold rounded-sm hover:bg-amber-300 transition-colors"
            >
              Hire Agency
              <ExternalLink size={12} />
            </a>
          </div>
          {profile.website_url && (
            <a
              href={profile.website_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 transition-colors"
            >
              {profile.website_url}
              <ExternalLink size={10} />
            </a>
          )}
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: Users,   label: "Members",   value: profile.member_count           },
            { icon: Package, label: "Listings",  value: profile.active_listing_count   },
            { icon: Zap,     label: "Deploys",   value: profile.completed_deployment_count },
          ].map(({ icon: Icon, label, value }) => (
            <div
              key={label}
              className="border border-zinc-800 bg-zinc-900 rounded-sm p-4 text-center space-y-1"
            >
              <Icon size={14} className="mx-auto text-zinc-500" />
              <p className="font-mono text-xl font-semibold tabular-nums text-zinc-50">{value}</p>
              <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">{label}</p>
            </div>
          ))}
        </div>

        {/* Listings section */}
        {orgListings.length > 0 && (
          <div className="space-y-3">
            <h2 className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
              Listings
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {orgListings.map((listing) => (
                <a
                  key={listing.id}
                  href={`/listings/${listing.slug}`}
                  className="border border-zinc-800 bg-zinc-900 rounded-sm p-4 space-y-2 hover:border-zinc-600 transition-colors block"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-zinc-50 line-clamp-1">{listing.name}</p>
                    <VerifiedBadge planTier={listing.org_plan_tier} />
                  </div>
                  <p className="text-xs text-zinc-500 line-clamp-2">{listing.description}</p>
                  <p className="font-mono text-xs text-amber-400 font-semibold">
                    {fmtUSD(listing.price_cents)}/mo
                  </p>
                </a>
              ))}
            </div>
          </div>
        )}

        {orgListings.length === 0 && (
          <div className="border border-zinc-800 bg-zinc-900 rounded-sm p-8 text-center">
            <p className="text-sm text-zinc-500">No active listings yet.</p>
          </div>
        )}

      </div>
    </div>
  );
}
