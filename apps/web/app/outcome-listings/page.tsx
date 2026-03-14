"use client";

import { useState } from "react";
import Link from "next/link";
import { Target, ChevronDown, ChevronUp, CheckCircle2, TrendingUp, Shield, Clock } from "lucide-react";
import { SubScoreBar } from "@/components/SubScoreBar";

// ── Types & demo data ─────────────────────────────────────────────────────────

type SlaStatus = "guaranteed" | "best_effort";

interface OutcomeMilestone {
  label:       string;
  metric:      string;         // e.g. "+10% conversion"
  price_cents: number;
  deadline:    string;
  verified:    boolean;
}

interface OutcomeListing {
  id:            string;
  title:         string;
  seller:        string;
  tier:          0 | 1 | 2;
  category:      string;
  tagline:       string;         // outcome headline
  base_cents:    number;         // base engagement cost
  success_cents: number;         // extra on success
  total_ceiling: number;         // max possible payout
  sla:           SlaStatus;
  warranty_days: number;
  milestones:    OutcomeMilestone[];
  proof_metrics: { label: string; value: string; delta: string }[];
  skills:        string[];
  match_score:   number;
}

const DEMO_LISTINGS: OutcomeListing[] = [
  {
    id: "ol-001",
    title: "AI-Powered Landing Page Optimisation",
    seller: "Marcus T.", tier: 2, category: "Conversion",
    tagline: "Deliver landing page + guaranteed ≥10% lift in 30 days or full refund",
    base_cents:    180000,
    success_cents:  60000,
    total_ceiling: 240000,
    sla: "guaranteed", warranty_days: 7,
    milestones: [
      { label: "Audit + Hypothesis",  metric: "Report delivery",    price_cents: 40000,  deadline: "Day 5",  verified: true  },
      { label: "A/B Variant Build",   metric: "Variants live",      price_cents: 80000,  deadline: "Day 14", verified: false },
      { label: "Lift Achievement",    metric: "≥10% CVR lift",      price_cents: 60000,  deadline: "Day 30", verified: false },
    ],
    proof_metrics: [
      { label: "Avg CVR lift",      value: "+14.2%", delta: "vs baseline" },
      { label: "Completed projects",value: "23",     delta: "past 12 mo"  },
      { label: "Refund rate",       value: "0%",     delta: "lifetime"    },
    ],
    skills: ["A/B Testing", "Next.js", "Analytics", "CRO"],
    match_score: 91,
  },
  {
    id: "ol-002",
    title: "Kafka Pipeline Automation",
    seller: "Lena K.", tier: 2, category: "Performance",
    tagline: "Cut data pipeline latency by ≥40% — SLA-backed or money back",
    base_cents:    320000,
    success_cents: 80000,
    total_ceiling: 400000,
    sla: "guaranteed", warranty_days: 14,
    milestones: [
      { label: "Profiling & Baseline", metric: "Benchmark report",  price_cents:  60000, deadline: "Day 4",  verified: true  },
      { label: "Pipeline Refactor",    metric: "Staging latency",   price_cents: 180000, deadline: "Day 18", verified: false },
      { label: "Latency SLA Met",      metric: "≥40% p99 reduction",price_cents:  80000, deadline: "Day 28", verified: false },
    ],
    proof_metrics: [
      { label: "Avg latency reduction", value: "−52%",  delta: "p99 measured"   },
      { label: "Kafka engagements",     value: "11",    delta: "past 18 mo"     },
      { label: "Avg warranty claims",   value: "0",     delta: "zero incidents" },
    ],
    skills: ["Kafka", "Rust", "Wasm", "Observability"],
    match_score: 87,
  },
  {
    id: "ol-003",
    title: "LLM RAG Search Implementation",
    seller: "Priya M.", tier: 1, category: "AI/ML",
    tagline: "Local RAG search live in staging with ≥85% relevance score on test set",
    base_cents:    220000,
    success_cents: 50000,
    total_ceiling: 270000,
    sla: "best_effort", warranty_days: 7,
    milestones: [
      { label: "Corpus Ingestion",   metric: "Embeddings indexed",  price_cents:  50000, deadline: "Day 6",  verified: false },
      { label: "Retrieval Tuning",   metric: "≥85% relevance score",price_cents: 120000, deadline: "Day 20", verified: false },
      { label: "Staging Handoff",    metric: "Staging URL live",    price_cents:  50000, deadline: "Day 25", verified: false },
    ],
    proof_metrics: [
      { label: "Avg relevance score",  value: "88%",  delta: "on test sets"    },
      { label: "RAG deployments",      value: "6",    delta: "past 8 mo"       },
      { label: "Avg delivery time",    value: "22d",  delta: "vs 30d contract" },
    ],
    skills: ["Python", "Qdrant", "RAG", "FastAPI"],
    match_score: 78,
  },
  {
    id: "ol-004",
    title: "K8s Cost Optimisation",
    seller: "Diego R.", tier: 1, category: "Infra",
    tagline: "Reduce cloud spend by ≥20% via rightsizing + autoscaler policy — or no success fee",
    base_cents:    95000,
    success_cents: 30000,
    total_ceiling: 125000,
    sla: "best_effort", warranty_days: 14,
    milestones: [
      { label: "Cost Audit",          metric: "Report + savings map", price_cents: 25000, deadline: "Day 5",  verified: false },
      { label: "Rightsizing Applied", metric: "New manifests live",   price_cents: 50000, deadline: "Day 12", verified: false },
      { label: "≥20% Spend Reduction",metric: "Billing verified",     price_cents: 30000, deadline: "Day 30", verified: false },
    ],
    proof_metrics: [
      { label: "Avg cost reduction", value: "−27%",  delta: "monthly spend"  },
      { label: "K8s engagements",    value: "18",    delta: "past 2 years"   },
      { label: "Success fee earned", value: "89%",   delta: "of engagements" },
    ],
    skills: ["Kubernetes", "Terraform", "Prometheus", "Cost Analysis"],
    match_score: 74,
  },
];

// ── Sidebar ───────────────────────────────────────────────────────────────────

const SIDEBAR_NAV = [
  { label: "Dashboard",   href: "/dashboard"   },
  { label: "Marketplace", href: "/marketplace" },
  { label: "Leaderboard", href: "/leaderboard" },
  { label: "Matching",    href: "/matching"    },
  { label: "Profile",     href: "/profile"     },
];

const PAYMENTS_NAV = [
  { label: "Escrow",             href: "/escrow"             },
  { label: "Payouts",            href: "/payouts"            },
  { label: "Billing",            href: "/billing"            },
  { label: "Smart Contracts",    href: "/smart-contracts"    },
  { label: "Outcome Listings",   href: "/outcome-listings",   active: true },
  { label: "Pricing Calculator", href: "/pricing-calculator" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtUSD(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

const TIER_LABEL: Record<0 | 1 | 2, string> = { 0: "Unverified", 1: "Social", 2: "Biometric" };
const TIER_COLOR: Record<0 | 1 | 2, string> = {
  0: "text-zinc-500 border-zinc-700",
  1: "text-amber-400 border-amber-800",
  2: "text-green-400 border-green-800",
};

// ── ListingCard ───────────────────────────────────────────────────────────────

function ListingCard({ listing }: { listing: OutcomeListing }) {
  const [open, setOpen] = useState(false);
  const successPct = Math.round((listing.success_cents / listing.total_ceiling) * 100);

  return (
    <div className={`border rounded-sm overflow-hidden transition-colors ${
      listing.sla === "guaranteed"
        ? "border-green-900/50 bg-green-950/5"
        : "border-zinc-800 bg-zinc-900/40"
    }`}>
      {/* Header row */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-start gap-3 px-3 py-3 text-left hover:bg-zinc-900/40 transition-colors"
      >
        {/* Score circle */}
        <div className={`w-9 h-9 rounded-sm flex items-center justify-center flex-shrink-0 border font-mono text-xs font-medium tabular-nums ${
          listing.match_score >= 90
            ? "border-amber-700 bg-amber-950/40 text-amber-400"
            : "border-zinc-700 bg-zinc-800 text-zinc-400"
        }`}>
          {listing.match_score}
        </div>

        <div className="flex-1 min-w-0 space-y-1">
          {/* Title + badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-mono text-xs font-medium text-zinc-100">{listing.title}</p>
            {listing.sla === "guaranteed" && (
              <span className="font-mono text-[9px] px-1.5 py-0.5 border border-green-800 text-green-400 rounded-sm uppercase tracking-widest">
                Guaranteed
              </span>
            )}
            <span className={`font-mono text-[9px] px-1.5 py-0.5 border rounded-sm ${TIER_COLOR[listing.tier]}`}>
              Tier {listing.tier} · {TIER_LABEL[listing.tier]}
            </span>
          </div>
          {/* Tagline */}
          <p className="font-mono text-[10px] text-zinc-500 leading-relaxed">{listing.tagline}</p>
          {/* Meta row */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-mono text-[9px] text-zinc-600">{listing.seller}</span>
            <span className="font-mono text-[9px] text-zinc-700 border border-zinc-800 px-1 rounded-sm">{listing.category}</span>
            <span className="flex items-center gap-1 font-mono text-[9px] text-zinc-600">
              <Shield className="w-2.5 h-2.5" />{listing.warranty_days}d warranty
            </span>
          </div>
        </div>

        {/* Pricing */}
        <div className="flex-shrink-0 text-right space-y-0.5">
          <p className="font-mono text-[9px] text-zinc-600 uppercase">Base</p>
          <p className="font-mono text-sm font-medium text-zinc-200 tabular-nums">{fmtUSD(listing.base_cents)}</p>
          <p className="font-mono text-[9px] text-green-400">+{fmtUSD(listing.success_cents)} on success</p>
        </div>

        {open ? <ChevronUp className="w-3.5 h-3.5 text-zinc-600 mt-1 flex-shrink-0" />
              : <ChevronDown className="w-3.5 h-3.5 text-zinc-600 mt-1 flex-shrink-0" />}
      </button>

      {/* Expanded */}
      {open && (
        <div className="border-t border-zinc-800 bg-zinc-950/40 p-3 space-y-4">
          {/* Proof metrics */}
          <div>
            <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest mb-2">Verified Outcomes</p>
            <div className="grid grid-cols-3 gap-2">
              {listing.proof_metrics.map(({ label, value, delta }) => (
                <div key={label} className="border border-zinc-800 rounded-sm p-2">
                  <p className={`font-mono text-base font-medium tabular-nums ${
                    value.startsWith("+") ? "text-green-400"
                    : value.startsWith("−") || value.startsWith("-") ? "text-red-400"
                    : "text-zinc-200"
                  }`}>{value}</p>
                  <p className="font-mono text-[9px] text-zinc-600 mt-0.5">{label}</p>
                  <p className="font-mono text-[9px] text-zinc-700">{delta}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Match score breakdown */}
          <div>
            <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest mb-2">AI Match Score</p>
            <SubScoreBar label="Outcome track record" score={listing.match_score}     color="green" />
            <SubScoreBar label="Skills alignment"     score={listing.match_score - 5} color="amber" />
          </div>

          {/* Milestones + escrow */}
          <div>
            <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest mb-2">Milestone Escrow Plan</p>
            <div className="space-y-1.5">
              {listing.milestones.map((ms, i) => (
                <div key={i} className="flex items-center gap-2 border border-zinc-800 rounded-sm px-2.5 py-2">
                  <CheckCircle2 className={`w-3 h-3 flex-shrink-0 ${ms.verified ? "text-green-400" : "text-zinc-700"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-[10px] text-zinc-300 font-medium">{ms.label}</p>
                    <p className="font-mono text-[9px] text-zinc-600">{ms.metric}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-mono text-[10px] text-zinc-200 tabular-nums">{fmtUSD(ms.price_cents)}</p>
                    <p className="font-mono text-[9px] text-zinc-600">{ms.deadline}</p>
                  </div>
                </div>
              ))}
              {/* Success fee row */}
              <div className="flex items-center gap-2 border border-green-900/50 rounded-sm px-2.5 py-2 bg-green-950/10">
                <TrendingUp className="w-3 h-3 text-green-400 flex-shrink-0" />
                <div className="flex-1">
                  <p className="font-mono text-[10px] text-green-400 font-medium">Success Fee (on SLA met)</p>
                  <p className="font-mono text-[9px] text-zinc-600">{successPct}% of ceiling — held in escrow until verified</p>
                </div>
                <p className="font-mono text-[10px] text-green-400 tabular-nums flex-shrink-0">{fmtUSD(listing.success_cents)}</p>
              </div>
            </div>
          </div>

          {/* Skills */}
          <div className="flex gap-1.5 flex-wrap">
            {listing.skills.map(s => (
              <span key={s} className="font-mono text-[9px] text-zinc-500 border border-zinc-800 px-1.5 py-0.5 rounded-sm">{s}</span>
            ))}
          </div>

          {/* Deploy CTA */}
          <button className="w-full h-9 rounded-sm border border-amber-800 bg-amber-950/30 text-amber-400
                             font-mono text-xs uppercase tracking-widest hover:border-amber-600 transition-colors">
            Deploy with Escrow — {fmtUSD(listing.base_cents)} to start
          </button>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

type CatFilter = "All" | "Conversion" | "Performance" | "AI/ML" | "Infra";
const CATS: CatFilter[] = ["All", "Conversion", "Performance", "AI/ML", "Infra"];

export default function OutcomeListingsPage() {
  const [cat,     setCat]     = useState<CatFilter>("All");
  const [slaOnly, setSlaOnly] = useState(false);

  const filtered = DEMO_LISTINGS
    .filter(l => cat === "All" || l.category === cat)
    .filter(l => !slaOnly || l.sla === "guaranteed");

  return (
    <div className="flex flex-col lg:flex-row min-h-screen">
      {/* Sidebar */}
      <aside className="hidden lg:flex lg:flex-col w-56 border-r border-zinc-800 bg-zinc-950 p-4 gap-6">
        <span className="font-mono text-xs text-zinc-500 uppercase tracking-widest">AiStaffApp</span>
        <nav className="flex flex-col gap-1">
          {SIDEBAR_NAV.map(({ label, href }) => (
            <Link key={label} href={href}
              className="px-3 py-2 rounded-sm font-mono text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 transition-colors"
            >{label}</Link>
          ))}
        </nav>
        <div className="space-y-1">
          <p className="font-mono text-[10px] text-zinc-300 uppercase tracking-widest px-3">Payments</p>
          {PAYMENTS_NAV.map(({ label, href, active }) => (
            <Link key={label} href={href}
              className={`block px-3 py-1.5 rounded-sm font-mono text-xs transition-colors ${
                active ? "text-zinc-100 bg-zinc-800" : "text-zinc-600 hover:text-zinc-300 hover:bg-zinc-900"
              }`}
            >{label}</Link>
          ))}
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 p-4 pb-20 lg:pb-4 max-w-3xl mx-auto w-full space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-mono text-sm font-medium text-zinc-300 uppercase tracking-widest">Outcome Listings</h1>
            <p className="font-mono text-[10px] text-zinc-600 mt-0.5">Pay for results — milestones + SLAs baked in</p>
          </div>
          <Target className="w-5 h-5 text-amber-500" />
        </div>

        {/* Explainer */}
        <div className="border border-amber-900/40 bg-amber-950/10 rounded-sm p-3">
          <p className="font-mono text-[10px] text-amber-500 uppercase tracking-widest mb-1">Outcome-Priced Model</p>
          <p className="font-mono text-xs text-zinc-400 leading-relaxed">
            Each listing defines a measurable business outcome (e.g. "+10% CVR"). A base fee covers the work;
            a success fee is held in escrow and released only when the SLA metric is verified.
            Guaranteed listings carry a full refund if the outcome isn't hit.
          </p>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          {CATS.map(c => (
            <button key={c} onClick={() => setCat(c)}
              className={`px-2.5 py-1 rounded-sm font-mono text-[10px] uppercase tracking-widest border transition-colors ${
                cat === c
                  ? "border-amber-800 text-amber-400 bg-amber-950/30"
                  : "border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
              }`}
            >{c}</button>
          ))}
          <button onClick={() => setSlaOnly(v => !v)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-sm font-mono text-[10px] uppercase tracking-widest border transition-colors ml-auto ${
              slaOnly
                ? "border-green-800 text-green-400 bg-green-950/20"
                : "border-zinc-800 text-zinc-500 hover:border-zinc-700"
            }`}
          >
            <Shield className="w-3 h-3" /> Guaranteed only
          </button>
        </div>

        {/* Listings */}
        <div className="space-y-2">
          {filtered.map(l => <ListingCard key={l.id} listing={l} />)}
          {filtered.length === 0 && (
            <div className="border border-zinc-800 rounded-sm p-6 text-center">
              <p className="font-mono text-xs text-zinc-500">No listings match this filter.</p>
            </div>
          )}
        </div>
      </main>

      {/* Mobile nav */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 h-16 flex items-center border-t border-zinc-800 bg-zinc-950">
        {[
          { label: "Dash",    href: "/dashboard"  },
          { label: "Market",  href: "/marketplace"},
          { label: "Matching",href: "/matching"   },
          { label: "Profile", href: "/profile"    },
        ].map(({ label, href }) => (
          <Link key={label} href={href} className="nav-tab">
            <span className="text-[10px]">{label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
