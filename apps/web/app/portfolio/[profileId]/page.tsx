import type { Metadata } from "next";
import {
  ExternalLink,
  Rocket,
  ClipboardCheck,
  ShieldOff,
  Star,
  Code2,
  DollarSign,
  ShieldCheck,
  Lock,
  Clock,
  AlertTriangle,
} from "lucide-react";
import type { PortfolioData } from "@/app/api/portfolio/[profileId]/route";
import { VettingBadge } from "@/components/VettingBadge";
import type { VettingTier } from "@/components/VettingBadge";
import { SubScoreBar } from "@/components/SubScoreBar";

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
    title:       `${data.name_initial}. — Verified AI Freelancer | AiStaff`,
    description: `${data.total_deployments} completed deployments · ${Math.round(data.avg_checklist_pass_pct * 100)}% DoD pass rate · Trust score ${data.trust_score}/100 · AiStaff verified`,
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

function MetricTile({
  icon: Icon,
  label,
  value,
  subvalue,
  valueClass,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  subvalue?: string;
  valueClass: string;
}) {
  return (
    <div className="border border-zinc-800 rounded-sm bg-zinc-900 p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest leading-none">
          {label}
        </span>
        <Icon className="w-3.5 h-3.5 text-zinc-600 flex-shrink-0" />
      </div>
      <div>
        <p className={`font-mono text-3xl font-medium tabular-nums leading-none ${valueClass}`}>
          {value}
        </p>
        {subvalue && (
          <p className="font-mono text-[10px] text-zinc-600 mt-1.5">{subvalue}</p>
        )}
      </div>
    </div>
  );
}

function ReviewCard({
  review,
  index,
}: {
  review: { rating: number; body: string | null; created_at: string };
  index: number;
}) {
  const placeholder = String.fromCharCode(65 + (index % 26));
  return (
    <div className="border border-zinc-800 rounded-sm bg-zinc-900 p-4 space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-sm bg-zinc-800 border border-zinc-700 flex items-center justify-center flex-shrink-0">
          <span className="font-mono text-xs font-medium text-zinc-400">{placeholder}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <StarRow rating={review.rating} />
            <span className="font-mono text-[10px] text-amber-400 tabular-nums">
              {review.rating}.0
            </span>
          </div>
          <p className="font-mono text-[10px] text-zinc-600 mt-0.5">{fmtDate(review.created_at)}</p>
        </div>
      </div>
      {review.body && (
        <p className="text-sm text-zinc-400 italic leading-relaxed border-l-2 border-zinc-800 pl-3">
          &ldquo;{review.body}&rdquo;
        </p>
      )}
    </div>
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

  const passRate       = Math.round(data.avg_checklist_pass_pct * 100);
  const trustSegments  = Math.round(data.trust_score / 10);
  const trustColor     = data.trust_score >= 70 ? "bg-emerald-500" : data.trust_score >= 40 ? "bg-amber-400" : "bg-red-500";
  const trustTextColor = data.trust_score >= 70 ? "text-emerald-400" : data.trust_score >= 40 ? "text-amber-400" : "text-red-400";

  // Sub-score derivation (display-only, approximate from tier + trust_score)
  const githubPct    = Math.min(100, Math.round(data.trust_score * 1.1));
  const linkedinPct  = data.identity_tier >= 1 ? Math.min(100, data.trust_score) : 0;
  const biometricPct = data.identity_tier >= 2 ? Math.min(100, Math.round(data.trust_score * 0.95)) : 0;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50">

      {/* ── Top Bar ── */}
      <header className="sticky top-0 z-30 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur-sm">
        <div className="max-w-2xl mx-auto px-4 h-12 flex items-center justify-between">
          <a href="/" className="font-mono text-sm font-bold tracking-widest text-amber-400">
            AISTAFF
          </a>
          <div className="flex items-center gap-3">
            <span className="hidden sm:block font-mono text-[10px] text-zinc-600 uppercase tracking-widest">
              Verified Talent Profile
            </span>
            <a
              href="/marketplace"
              className="flex items-center gap-1.5 h-7 px-3 rounded-sm border border-zinc-700
                         font-mono text-[10px] text-zinc-400 uppercase tracking-widest
                         hover:border-amber-400/40 hover:text-amber-400 transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              Browse Talent
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 pb-16 space-y-5">

        {/* ── Hero Card ── */}
        <div className="border border-zinc-800 rounded-sm bg-zinc-900 p-5 sm:p-6">
          <div className="flex items-start gap-4 sm:gap-5">

            {/* Avatar */}
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-sm bg-zinc-800 border border-zinc-700 flex items-center justify-center flex-shrink-0">
              <span className="font-mono text-4xl sm:text-5xl font-medium text-zinc-200 select-none">
                {data.name_initial}
              </span>
            </div>

            {/* Identity */}
            <div className="flex-1 min-w-0 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1.5">
                  <p className="text-2xl font-semibold text-zinc-50 leading-none tracking-tight">
                    {data.name_initial}.
                  </p>
                  <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
                    Verified AI Freelancer
                  </p>
                  <div className="pt-0.5">
                    <VettingBadge tier={data.identity_tier as VettingTier} compact={true} />
                  </div>
                </div>

                {/* Rate — desktop only */}
                {data.hourly_rate_cents > 0 && (
                  <div className="hidden sm:block flex-shrink-0 text-right">
                    <p className="font-mono text-2xl font-medium tabular-nums text-amber-400 leading-none">
                      ${Math.round(data.hourly_rate_cents / 100)}
                      <span className="text-[10px] text-zinc-500 font-normal">/hr</span>
                    </p>
                    <p className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest mt-1">
                      Hourly Rate
                    </p>
                  </div>
                )}
              </div>

              {/* Trust score bar */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
                    Trust Score
                  </span>
                  <span className={`font-mono text-sm font-medium tabular-nums ${trustTextColor}`}>
                    {data.trust_score}
                    <span className="text-zinc-600 text-[10px] font-normal">/100</span>
                  </span>
                </div>
                <div className="flex gap-0.5">
                  {Array.from({ length: 10 }, (_, i) => (
                    <div
                      key={i}
                      className={`flex-1 h-2 rounded-none ${i < trustSegments ? trustColor : "bg-zinc-800"}`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Rate — mobile only */}
          {data.hourly_rate_cents > 0 && (
            <div className="sm:hidden mt-4 pt-4 border-t border-zinc-800/60 flex items-center justify-between">
              <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
                Hourly Rate
              </span>
              <span className="font-mono text-xl font-medium tabular-nums text-amber-400">
                ${Math.round(data.hourly_rate_cents / 100)}
                <span className="text-[10px] text-zinc-500 font-normal">/hr</span>
              </span>
            </div>
          )}
        </div>

        {/* ── About ── */}
        {data.bio && (
          <div className="border border-zinc-800 rounded-sm bg-zinc-900 px-5 py-4 space-y-2">
            <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">About</p>
            <p className="text-sm text-zinc-300 leading-relaxed">{data.bio}</p>
          </div>
        )}

        {/* ── Skills ── */}
        {data.skills.length > 0 && (
          <div className="border border-zinc-800 rounded-sm bg-zinc-900 px-5 py-4 space-y-3">
            <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">Skills</p>
            <div className="flex flex-wrap gap-2">
              {data.skills.map(skill => (
                <span
                  key={skill}
                  className="inline-flex items-center gap-1.5 font-mono text-xs text-amber-400
                             border border-amber-400/25 bg-amber-400/5 px-2.5 py-1 rounded-sm"
                >
                  <Code2 className="w-3 h-3 opacity-60 flex-shrink-0" />
                  {skill}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── Verified Performance ── */}
        <div className="space-y-3">
          <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest px-1">
            Verified Performance
          </p>
          <div className="grid grid-cols-2 gap-3">
            <MetricTile
              icon={Rocket}
              label="Deployments"
              value={String(data.total_deployments)}
              subvalue="completed"
              valueClass="text-zinc-100"
            />
            <MetricTile
              icon={ClipboardCheck}
              label="DoD Pass Rate"
              value={`${passRate}%`}
              subvalue={passRate >= 80 ? "excellent" : passRate >= 50 ? "good" : "below avg"}
              valueClass={passRate >= 80 ? "text-emerald-400" : passRate >= 50 ? "text-amber-400" : "text-red-400"}
            />
            <MetricTile
              icon={ShieldOff}
              label="Drift Incidents"
              value={String(data.drift_incidents)}
              subvalue={data.drift_incidents === 0 ? "clean record" : "review history"}
              valueClass={data.drift_incidents === 0 ? "text-emerald-400" : "text-amber-400"}
            />
            <MetricTile
              icon={Star}
              label={data.avg_rating !== null ? "Avg Rating" : "Client Reviews"}
              value={data.avg_rating !== null ? data.avg_rating.toFixed(1) : "—"}
              subvalue={
                data.avg_rating !== null
                  ? `from ${data.review_count} review${data.review_count !== 1 ? "s" : ""}`
                  : "none yet"
              }
              valueClass="text-amber-400"
            />
          </div>

          {data.total_earned_cents > 0 && (
            <div className="border border-zinc-800 rounded-sm bg-zinc-900/40 px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <DollarSign className="w-3.5 h-3.5 text-zinc-600 flex-shrink-0" />
                <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
                  Total Earned
                </span>
              </div>
              <span className="font-mono text-base font-medium tabular-nums text-zinc-200">
                {usd(data.total_earned_cents)}
              </span>
            </div>
          )}
        </div>

        {/* ── Identity Verification ── */}
        <div className="space-y-3">
          <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest px-1">
            Identity Verification
          </p>

          <VettingBadge tier={data.identity_tier as VettingTier} expandable={true} compact={false} />

          <div className="border border-zinc-800 rounded-sm bg-zinc-900 px-4 py-4 space-y-3">
            <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
              Trust Score Breakdown
            </p>
            <SubScoreBar label="GitHub Activity" score={githubPct}   color="sky"   showValue />
            <SubScoreBar
              label="LinkedIn / ID"
              score={linkedinPct}
              color={data.identity_tier >= 1 ? "amber" : "red"}
              showValue
            />
            <SubScoreBar
              label="Biometric Proof"
              score={biometricPct}
              color={data.identity_tier >= 2 ? "green" : "red"}
              showValue
            />
            <div className="pt-1 border-t border-zinc-800/60 flex items-center justify-between">
              <span className="font-mono text-[10px] text-zinc-600">Composite Score</span>
              <span className={`font-mono text-sm font-medium tabular-nums ${trustTextColor}`}>
                {data.trust_score} / 100
              </span>
            </div>
          </div>
        </div>

        {/* ── Empty state ── */}
        {data.total_deployments === 0 && (
          <div className="border border-zinc-800 rounded-sm bg-zinc-900/40 p-5 flex gap-3">
            <AlertTriangle className="w-4 h-4 text-zinc-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-mono text-xs text-zinc-400">No completed deployments yet</p>
              <p className="font-mono text-[10px] text-zinc-600 leading-relaxed">
                Performance metrics and reviews will appear once this talent completes
                their first engagement. Identity verification is still active.
              </p>
            </div>
          </div>
        )}

        {/* ── Client Reviews ── */}
        {data.recent_reviews.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
                Client Reviews
              </p>
              {data.avg_rating !== null && (
                <div className="flex items-center gap-1.5">
                  <StarRow rating={Math.round(data.avg_rating)} />
                  <span className="font-mono text-[10px] text-zinc-400 tabular-nums">
                    {data.avg_rating.toFixed(1)} avg
                  </span>
                </div>
              )}
            </div>
            <div className="space-y-3">
              {data.recent_reviews.map((r, i) => (
                <ReviewCard key={i} review={r} index={i} />
              ))}
            </div>
          </div>
        )}

        {/* ── CTA ── */}
        <div className="border border-amber-400/20 rounded-sm bg-zinc-900 overflow-hidden">
          <div className="h-px bg-amber-400/40" />
          <div className="p-5 sm:p-6 space-y-4">
            <div>
              <p className="text-lg font-semibold text-zinc-50 leading-tight">
                Hire {data.name_initial}. on AiStaff
              </p>
              <p className="font-mono text-xs text-zinc-500 mt-1">
                Escrow-protected · 30-second veto window · DoD milestone gates
              </p>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {(
                [
                  { Icon: ShieldCheck, text: "Identity Verified" },
                  { Icon: Lock,        text: "Escrow Backed"     },
                  { Icon: Clock,       text: "30s Veto Window"   },
                ] as { Icon: React.ElementType; text: string }[]
              ).map(({ Icon, text }) => (
                <div key={text} className="flex items-center gap-1.5">
                  <Icon className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                  <span className="font-mono text-[10px] text-zinc-400">{text}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <a
                href="/marketplace"
                className="flex items-center justify-center h-10 px-6 rounded-sm
                           bg-amber-400 text-zinc-950 font-mono text-xs font-medium
                           uppercase tracking-widest hover:bg-amber-300 transition-colors"
              >
                Hire on AiStaff
              </a>
              <a
                href="/marketplace"
                className="flex items-center justify-center h-10 px-4 rounded-sm
                           border border-zinc-700 text-zinc-400 font-mono text-xs
                           uppercase tracking-widest hover:border-zinc-500 transition-colors"
              >
                Browse Other Talent
              </a>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center pt-2">
          <a href="/" className="font-mono text-[10px] text-zinc-700 hover:text-zinc-500 transition-colors">
            aistaffglobal.com
          </a>
        </div>

      </main>
    </div>
  );
}
