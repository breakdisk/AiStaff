"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { TrendingUp, CheckCircle2, AlertTriangle, Loader2, ChevronDown, ChevronUp, ArrowUpRight, Star } from "lucide-react";

import { SubScoreBar } from "@/components/SubScoreBar";
import { VettingBadge } from "@/components/VettingBadge";
import { inviteToProject } from "@/lib/api";
import type { OutcomesResponse } from "@/app/api/freelancer/outcomes/route";
import type { TopTalent } from "@/app/api/outcomes/top-talent/route";

// ── Helpers ────────────────────────────────────────────────────────────────────

function usd(cents: number) {
  return `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function pct(v: number) {
  return `${Math.round(v * 100)}%`;
}

// ── FREELANCER VIEW ───────────────────────────────────────────────────────────

function StatTile({
  label, value, sub, color = "text-amber-400",
}: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="border border-zinc-800 rounded-sm p-3 bg-zinc-900/40 space-y-1">
      <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">{label}</p>
      <p className={`font-mono text-xl font-medium tabular-nums ${color}`}>{value}</p>
      {sub && <p className="font-mono text-[9px] text-zinc-600">{sub}</p>}
    </div>
  );
}

function FreelancerOutcomesView({ data, profileId }: { data: OutcomesResponse; profileId?: string }) {
  const { stats, deployments } = data;
  const passRate = Math.round(stats.avg_checklist_pass_pct * 100);

  return (
    <main className="flex-1 p-4 pb-20 lg:pb-4 max-w-3xl mx-auto w-full space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-mono text-sm font-medium text-zinc-300 uppercase tracking-widest">
            My Performance
          </h1>
          <p className="font-mono text-[10px] text-zinc-600 mt-0.5">
            Verified metrics from completed deployments
          </p>
        </div>
        <TrendingUp className="w-5 h-5 text-amber-500" />
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatTile
          label="Deployments"
          value={String(stats.total_deployments)}
          sub="All-time completed"
        />
        <StatTile
          label="Total Earned"
          value={usd(stats.total_earned_cents)}
          sub="Escrow releases"
          color="text-emerald-400"
        />
        <StatTile
          label="DoD Pass Rate"
          value={`${passRate}%`}
          sub="Checklist milestones"
          color={passRate >= 80 ? "text-emerald-400" : passRate >= 50 ? "text-amber-400" : "text-red-400"}
        />
        <StatTile
          label="Drift Incidents"
          value={String(stats.drift_incidents)}
          sub="Artifact deviations"
          color={stats.drift_incidents === 0 ? "text-emerald-400" : "text-amber-400"}
        />
        {stats.avg_rating !== null && (
          <StatTile
            label="Avg Client Rating"
            value={`★ ${stats.avg_rating.toFixed(1)}`}
            sub={`${stats.review_count} review${stats.review_count !== 1 ? "s" : ""}`}
            color="text-amber-400"
          />
        )}
      </div>

      {/* Completed deployments */}
      {deployments.length > 0 && (
        <div className="space-y-2">
          <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest px-1">
            Completed Projects
          </p>
          {deployments.map(d => {
            const milePct = d.steps_total > 0
              ? Math.round((d.steps_passed / d.steps_total) * 100)
              : null;
            return (
              <div key={d.id} className="border border-zinc-800 rounded-sm bg-zinc-900/40 p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-xs text-zinc-100">{d.job_title}</p>
                    <p className="font-mono text-[10px] text-zinc-600 mt-0.5">{fmtDate(d.created_at)}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-mono text-xs text-emerald-400 tabular-nums">{usd(d.escrow_cents)}</p>
                    {milePct !== null && (
                      <p className="font-mono text-[10px] text-zinc-500 mt-0.5">
                        {d.steps_passed}/{d.steps_total} milestones
                      </p>
                    )}
                  </div>
                </div>
                {milePct !== null && (
                  <div className="h-1.5 bg-zinc-800 rounded-sm overflow-hidden">
                    <div
                      className={`h-full rounded-sm transition-all ${
                        milePct >= 80 ? "bg-emerald-500" : milePct >= 50 ? "bg-amber-400" : "bg-red-500"
                      }`}
                      style={{ width: `${milePct}%` }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {deployments.length === 0 && stats.total_deployments === 0 && (
        <div className="border border-zinc-800 rounded-sm p-8 text-center">
          <p className="font-mono text-xs text-zinc-600">
            No completed deployments yet. Your performance metrics will appear here once you complete your first engagement.
          </p>
        </div>
      )}

      {/* Share link */}
      {stats.total_deployments > 0 && (
        <div className="border border-amber-900/30 bg-amber-950/10 rounded-sm p-3 flex items-center justify-between gap-3">
          <p className="font-mono text-xs text-amber-500/80">
            Share your verified performance record with potential clients.
          </p>
          <a
            href={profileId ? `/portfolio/${profileId}` : "/profile"}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0 font-mono text-[10px] px-3 py-1.5 border border-amber-900
                       text-amber-400 rounded-sm hover:border-amber-700 transition-colors whitespace-nowrap"
          >
            View Portfolio →
          </a>
        </div>
      )}
    </main>
  );
}

// ── CLIENT VIEW — Real talent roster ──────────────────────────────────────────

function TalentCard({ talent, rank }: { talent: TopTalent; rank: number }) {
  const [open,        setOpen]        = useState(false);
  const [composing,   setComposing]   = useState(false);
  const [message,     setMessage]     = useState("");
  const [inviting,    setInviting]    = useState(false);
  const [invited,     setInvited]     = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  async function handleSend() {
    setInviting(true);
    setInviteError(null);
    try {
      await inviteToProject(talent.id, undefined, message.trim() || undefined);
      setInvited(true);
      setComposing(false);
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "Invite failed — try again");
    } finally {
      setInviting(false);
    }
  }

  const roiScore = talent.checklist_pct;
  const roiColor = roiScore >= 80 ? "text-green-400" : roiScore >= 60 ? "text-amber-400" : "text-zinc-500";

  return (
    <div className="border border-zinc-800 rounded-sm bg-zinc-900/50 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-3 py-3 text-left hover:bg-zinc-900 transition-colors"
      >
        <span className="font-mono text-xs text-zinc-600 w-5 flex-shrink-0">{rank}</span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-mono text-xs font-medium text-zinc-100">{talent.email_initial}.</p>
            <VettingBadge tier={talent.identity_tier as 0 | 1 | 2} compact />
          </div>
          <p className="font-mono text-[10px] text-zinc-500 mt-0.5">
            {talent.total_deployments} deployment{talent.total_deployments !== 1 ? "s" : ""} completed
          </p>
        </div>

        <div className="text-right flex-shrink-0">
          <p className="font-mono text-[10px] text-zinc-600 uppercase">DoD Pass</p>
          <p className={`font-mono text-sm font-medium tabular-nums ${roiColor}`}>{talent.checklist_pct}%</p>
        </div>

        <div className="hidden sm:block flex-shrink-0 text-right">
          {talent.avg_rating > 0 && (
            <>
              <p className="font-mono text-[10px] text-zinc-600">Rated</p>
              <p className="font-mono text-xs text-amber-400">★ {talent.avg_rating.toFixed(1)}</p>
            </>
          )}
        </div>

        {talent.rate_cents > 0 && (
          <span className="font-mono text-xs text-zinc-500 flex-shrink-0 hidden sm:block">
            ${Math.round(talent.rate_cents / 100)}/hr
          </span>
        )}

        {open ? <ChevronUp className="w-3.5 h-3.5 text-zinc-600" /> : <ChevronDown className="w-3.5 h-3.5 text-zinc-600" />}
      </button>

      {/* Metrics strip */}
      <div className="flex items-stretch border-t border-zinc-800/60 divide-x divide-zinc-800/60">
        {[
          { metric: "DoD Pass Rate",  value: `${talent.checklist_pct}%`,     positive: talent.checklist_pct >= 80  },
          { metric: "Drift Incidents", value: talent.drift_incidents === 0 ? "Zero" : `${talent.drift_incidents}`, positive: talent.drift_incidents === 0 },
          { metric: "Trust Score",    value: String(talent.trust_score),     positive: talent.trust_score >= 70    },
        ].map(o => (
          <div key={o.metric} className="flex-1 px-3 py-2">
            <p className={`font-mono text-sm font-medium tabular-nums ${o.positive ? "text-green-400" : "text-amber-400"}`}>
              {o.value}
            </p>
            <p className="font-mono text-[10px] text-zinc-500 mt-0.5">{o.metric}</p>
          </div>
        ))}
      </div>

      {/* Expanded */}
      {open && (
        <div className="border-t border-zinc-800 bg-zinc-950/50 p-4 space-y-4">
          <div className="space-y-2">
            <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest">Match Breakdown</p>
            <SubScoreBar label="DoD Pass Rate"   score={talent.checklist_pct}  color={talent.checklist_pct  >= 70 ? "green" : "amber"} />
            <SubScoreBar label="Trust Score"     score={talent.trust_score}    color={talent.trust_score    >= 70 ? "green" : "amber"} />
            <SubScoreBar label="Track Record"
              score={Math.min(100, talent.total_deployments * 10)}
              color="amber"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Total Earned",  value: usd(talent.total_earned_cents) },
              { label: "Deployments",  value: String(talent.total_deployments) },
              { label: "Drift",        value: talent.drift_incidents === 0 ? "Zero" : String(talent.drift_incidents) },
              { label: "Reviews",      value: talent.review_count > 0 ? `★ ${talent.avg_rating.toFixed(1)} (${talent.review_count})` : "None yet" },
            ].map(({ label, value }) => (
              <div key={label} className="border border-zinc-800 rounded-sm p-2 bg-zinc-900">
                <p className="font-mono text-[10px] text-zinc-600 uppercase">{label}</p>
                <p className="font-mono text-xs text-zinc-300 mt-0.5">{value}</p>
              </div>
            ))}
          </div>

          {invited ? (
            <div className="flex items-center gap-2 h-9 px-3 border border-green-900 bg-green-950/10 rounded-sm">
              <CheckCircle2 className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
              <span className="font-mono text-xs text-green-400">Invitation sent</span>
            </div>
          ) : composing ? (
            <div className="space-y-2">
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Optional message to the talent…"
                maxLength={500}
                rows={3}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-sm px-3 py-2
                           font-mono text-xs text-zinc-200 placeholder-zinc-600
                           focus:outline-none focus:border-amber-700 resize-none"
              />
              <div className="flex gap-2">
                <button
                  disabled={inviting}
                  onClick={handleSend}
                  className="flex-1 h-8 rounded-sm border border-amber-900 bg-amber-950 text-amber-400
                             font-mono text-xs uppercase tracking-widest hover:border-amber-700
                             flex items-center justify-center gap-1.5 disabled:opacity-60 transition-colors"
                >
                  {inviting && <Loader2 className="w-3 h-3 animate-spin" />}
                  {inviting ? "Sending…" : "Send Invite"}
                </button>
                <button
                  onClick={() => { setComposing(false); setMessage(""); setInviteError(null); }}
                  className="h-8 px-3 rounded-sm border border-zinc-700 text-zinc-500
                             font-mono text-xs uppercase tracking-widest hover:border-zinc-600 transition-colors"
                >
                  Cancel
                </button>
              </div>
              {inviteError && <p className="font-mono text-[10px] text-red-400">{inviteError}</p>}
            </div>
          ) : (
            <button
              onClick={() => setComposing(true)}
              className="w-full h-9 rounded-sm border border-amber-900 bg-amber-950 text-amber-400
                         font-mono text-xs uppercase tracking-widest hover:border-amber-700 transition-colors"
            >
              Invite to Project
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function OutcomesPage() {
  const { data: session } = useSession();
  const role      = (session?.user as { role?: string })?.role;
  const profileId = (session?.user as { profileId?: string })?.profileId;
  const isClient  = role === "client";

  const [freelancerData, setFreelancerData] = useState<OutcomesResponse | null>(null);
  const [topTalent,      setTopTalent]      = useState<TopTalent[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    const url = isClient ? "/api/outcomes/top-talent" : "/api/freelancer/outcomes";
    fetch(url)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(data => {
        if (isClient) setTopTalent(data as TopTalent[]);
        else          setFreelancerData(data as OutcomesResponse);
      })
      .catch(e => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [session, isClient]);

  if (loading) {
    return (
      <main className="flex-1 p-4 max-w-3xl mx-auto w-full">
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="animate-pulse border border-zinc-800 rounded-sm p-4 space-y-3">
              <div className="h-4 w-1/2 rounded bg-zinc-800" />
              <div className="h-3 w-1/3 rounded bg-zinc-800" />
            </div>
          ))}
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex-1 p-4">
        <p className="font-mono text-xs text-red-500">{error}</p>
      </main>
    );
  }

  if (!isClient && freelancerData) {
    return <FreelancerOutcomesView data={freelancerData} profileId={profileId} />;
  }

  // Client view
  return (
    <main className="flex-1 p-4 pb-20 lg:pb-4 max-w-3xl mx-auto w-full space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-mono text-sm font-medium text-zinc-300 uppercase tracking-widest">
            Outcome-Based Matching
          </h1>
          <p className="font-mono text-[10px] text-zinc-600 mt-0.5">
            Top talent ranked by verified DoD pass rate
          </p>
        </div>
        <TrendingUp className="w-5 h-5 text-amber-500" />
      </div>

      <div className="border border-amber-900/40 bg-amber-950/10 rounded-sm p-3">
        <p className="font-mono text-[10px] text-amber-500 uppercase tracking-widest mb-1">How this works</p>
        <p className="font-mono text-xs text-zinc-400 leading-relaxed">
          Talent ranked by Definition-of-Done checklist pass rate across completed deployments.
          Metrics sourced from verified escrow releases and DoD finalisations.
        </p>
      </div>

      {topTalent.length === 0 && (
        <p className="font-mono text-xs text-zinc-600 text-center py-8">
          No verified talent records yet. Check back once deployments complete.
        </p>
      )}

      <div className="space-y-3">
        {topTalent.map((t, i) => (
          <TalentCard key={t.id} talent={t} rank={i + 1} />
        ))}
      </div>
    </main>
  );
}
