import type { Metadata } from "next";
import { Shield, Star, TrendingUp, CheckCircle2, AlertTriangle, ExternalLink } from "lucide-react";
import type { PortfolioData } from "@/app/api/portfolio/[profileId]/route";

// ── Data fetching ─────────────────────────────────────────────────────────────

async function getPortfolio(profileId: string): Promise<PortfolioData | null> {
  try {
    const base = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
    const res  = await fetch(`${base}/api/portfolio/${profileId}`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    return res.json() as Promise<PortfolioData>;
  } catch {
    return null;
  }
}

// ── Metadata ──────────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ profileId: string }>;
}): Promise<Metadata> {
  const { profileId } = await params;
  const data = await getPortfolio(profileId);
  if (!data) return { title: "Portfolio — AiStaff" };
  return {
    title:       `${data.name_initial}. — Verified Freelancer Portfolio | AiStaff`,
    description: `${data.total_deployments} completed deployments · ${Math.round(data.avg_checklist_pass_pct * 100)}% DoD pass rate · AiStaff verified`,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function usd(cents: number) {
  return `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function tierLabel(t: number): string {
  if (t === 2) return "Biometric Verified";
  if (t === 1) return "Social Verified";
  return "Unverified";
}

function tierColor(t: number): string {
  if (t === 2) return "border-emerald-700 text-emerald-400";
  if (t === 1) return "border-blue-800 text-blue-400";
  return "border-zinc-700 text-zinc-500";
}

function StarRow({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i}
          className={`w-3 h-3 ${i <= rating ? "text-amber-400 fill-amber-400" : "text-zinc-700"}`}
        />
      ))}
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function PortfolioPage({
  params,
}: {
  params: Promise<{ profileId: string }>;
}) {
  const { profileId } = await params;
  const data = await getPortfolio(profileId);

  if (!data) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <p className="font-mono text-xs text-zinc-600">Profile not found.</p>
      </div>
    );
  }

  const passRate = Math.round(data.avg_checklist_pass_pct * 100);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50">
      {/* Top bar */}
      <div className="border-b border-zinc-800 px-4 py-3 flex items-center justify-between">
        <a href="/" className="font-mono text-sm font-bold tracking-widest text-amber-400">
          AISTAFF
        </a>
        <a
          href="/marketplace"
          className="flex items-center gap-1.5 font-mono text-[10px] text-zinc-500
                     hover:text-zinc-300 transition-colors"
        >
          Browse AI Talent <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {/* Identity card */}
        <div className="border border-zinc-800 rounded-sm bg-zinc-900 p-5 space-y-4">
          <div className="flex items-start gap-4">
            {/* Avatar initial */}
            <div className="w-14 h-14 rounded-sm bg-zinc-800 border border-zinc-700
                            flex items-center justify-center flex-shrink-0">
              <span className="font-mono text-2xl font-medium text-zinc-300">
                {data.name_initial}
              </span>
            </div>

            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`font-mono text-[10px] border px-1.5 py-0.5 rounded-sm flex items-center gap-1 ${tierColor(data.identity_tier)}`}>
                  <Shield className="w-2.5 h-2.5" />
                  {tierLabel(data.identity_tier)}
                </span>
                <span className="font-mono text-[10px] border border-zinc-700 text-zinc-500 px-1.5 py-0.5 rounded-sm">
                  Trust {data.trust_score}
                </span>
                {data.hourly_rate_cents > 0 && (
                  <span className="font-mono text-[10px] border border-zinc-700 text-zinc-400 px-1.5 py-0.5 rounded-sm">
                    ${Math.round(data.hourly_rate_cents / 100)}/hr
                  </span>
                )}
              </div>
              {data.bio && (
                <p className="font-mono text-xs text-zinc-400 leading-relaxed">{data.bio}</p>
              )}
            </div>
          </div>

          {/* Skills */}
          {data.skills.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {data.skills.map(skill => (
                <span
                  key={skill}
                  className="font-mono text-[10px] text-amber-400 border border-amber-400/30
                             bg-amber-400/5 px-2 py-0.5 rounded-sm"
                >
                  {skill}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Verified metrics */}
        <div className="space-y-2">
          <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest px-1">
            Verified Performance
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              {
                label: "Deployments",
                value: String(data.total_deployments),
                color: "text-zinc-100",
              },
              {
                label: "DoD Pass Rate",
                value: `${passRate}%`,
                color: passRate >= 80 ? "text-emerald-400" : passRate >= 50 ? "text-amber-400" : "text-red-400",
              },
              {
                label: "Drift Incidents",
                value: data.drift_incidents === 0 ? "Zero" : String(data.drift_incidents),
                color: data.drift_incidents === 0 ? "text-emerald-400" : "text-amber-400",
              },
              {
                label: data.avg_rating !== null ? "Avg Rating" : "Reviews",
                value: data.avg_rating !== null ? `★ ${data.avg_rating.toFixed(1)}` : "None yet",
                color: "text-amber-400",
              },
            ].map(({ label, value, color }) => (
              <div key={label} className="border border-zinc-800 rounded-sm p-3 bg-zinc-900/40 space-y-1">
                <p className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest">{label}</p>
                <p className={`font-mono text-xl font-medium tabular-nums ${color}`}>{value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Verification badge */}
        <div className="border border-zinc-800 rounded-sm p-3 bg-zinc-900/40">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
            <p className="font-mono text-[10px] text-zinc-400 uppercase tracking-widest">
              AiStaff Verified Record
            </p>
          </div>
          <p className="font-mono text-[10px] text-zinc-600 leading-relaxed">
            All metrics sourced from on-chain escrow releases and Definition-of-Done checklist
            completions. Deployment data is immutable and append-only. Identity verified via
            {data.identity_tier >= 2
              ? " Groth16 ZK biometric proof."
              : data.identity_tier === 1
              ? " OAuth social verification (GitHub / LinkedIn)."
              : " account registration only."}
          </p>
        </div>

        {/* Client reviews */}
        {data.recent_reviews.length > 0 && (
          <div className="space-y-2">
            <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest px-1">
              Client Reviews
            </p>
            <div className="border border-zinc-800 rounded-sm bg-zinc-900/40 divide-y divide-zinc-800">
              {data.recent_reviews.map((r, i) => (
                <div key={i} className="p-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <StarRow rating={r.rating} />
                    <span className="font-mono text-[10px] text-zinc-600">{fmtDate(r.created_at)}</span>
                  </div>
                  {r.body && (
                    <p className="font-mono text-xs text-zinc-400 leading-relaxed italic">
                      &ldquo;{r.body}&rdquo;
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {data.total_deployments === 0 && (
          <div className="border border-zinc-800 rounded-sm p-6 text-center space-y-2">
            <AlertTriangle className="w-5 h-5 text-zinc-700 mx-auto" />
            <p className="font-mono text-xs text-zinc-600">
              No completed deployments yet. Metrics will appear once the first engagement closes.
            </p>
          </div>
        )}

        {/* CTA */}
        <div className="border border-amber-900/30 bg-amber-950/10 rounded-sm p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex-1">
            <p className="font-mono text-xs text-amber-400 font-medium">Hire on AiStaff</p>
            <p className="font-mono text-[10px] text-zinc-500 mt-0.5">
              Escrow-protected · 30-second veto window · DoD milestone gates
            </p>
          </div>
          <a
            href="/marketplace"
            className="flex-shrink-0 h-9 px-4 rounded-sm border border-amber-900 bg-amber-950
                       text-amber-400 font-mono text-xs uppercase tracking-widest
                       hover:border-amber-700 transition-colors flex items-center"
          >
            Browse Talent
          </a>
        </div>

        <div className="text-center">
          <a href="/" className="font-mono text-[10px] text-zinc-700 hover:text-zinc-500 transition-colors">
            aistaffglobal.com
          </a>
        </div>
      </main>
    </div>
  );
}
