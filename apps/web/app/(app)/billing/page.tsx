"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Zap, Building2, User, CreditCard, Download } from "lucide-react";

// ── Plan data ─────────────────────────────────────────────────────────────────

interface Plan {
  id:          string;
  name:        string;
  monthly_cents: number;
  annual_cents:  number;   // per month, billed annually
  icon:        React.ElementType;
  tagline:     string;
  features:    string[];
  limits:      { label: string; value: string }[];
  highlight:   boolean;
  cta:         string;
}

const PLANS: Plan[] = [
  {
    id: "starter", name: "Starter", icon: User,
    monthly_cents: 0, annual_cents: 0,
    tagline: "For individuals exploring the platform",
    highlight: false,
    cta: "Current Plan",
    features: [
      "Up to 2 active deployments",
      "Milestone escrow (standard)",
      "Basic matching — top 5 candidates",
      "Payout via Stripe only",
      "Community support (48h SLA)",
    ],
    limits: [
      { label: "Active deployments", value: "2"       },
      { label: "Escrow contracts",   value: "2"       },
      { label: "Payout rails",       value: "1"       },
      { label: "Smart contracts",    value: "—"       },
      { label: "Platform fee",       value: "0%"      },
      { label: "Support SLA",        value: "48h"     },
    ],
  },
  {
    id: "pro", name: "Pro", icon: Zap,
    monthly_cents: 4900, annual_cents: 3900,
    tagline: "For active freelancers and growing teams",
    highlight: true,
    cta: "Upgrade to Pro",
    features: [
      "Unlimited active deployments",
      "Priority milestone escrow + instant release",
      "Full AI matching — unlimited candidates",
      "All 4 global payout rails",
      "Smart contract templates",
      "Outcome-priced listing badges",
      "Priority support (4h SLA)",
      "Pricing Calculator + AI Tools",
    ],
    limits: [
      { label: "Active deployments", value: "Unlimited" },
      { label: "Escrow contracts",   value: "Unlimited" },
      { label: "Payout rails",       value: "4"         },
      { label: "Smart contracts",    value: "✓"         },
      { label: "Platform fee",       value: "0%"        },
      { label: "Support SLA",        value: "4h"        },
    ],
  },
  {
    id: "enterprise", name: "Enterprise", icon: Building2,
    monthly_cents: 19900, annual_cents: 15900,
    tagline: "For agencies, studios and enterprise clients",
    highlight: false,
    cta: "Contact Sales",
    features: [
      "Everything in Pro",
      "Multi-seat team management",
      "Custom smart contract logic",
      "Dedicated account manager",
      "White-label option",
      "SSO / SAML",
      "Custom payout schedule",
      "SLA guarantee (1h response)",
      "Invoice billing available",
    ],
    limits: [
      { label: "Active deployments", value: "Unlimited" },
      { label: "Escrow contracts",   value: "Unlimited" },
      { label: "Payout rails",       value: "Custom"    },
      { label: "Smart contracts",    value: "Custom"    },
      { label: "Platform fee",       value: "0%"        },
      { label: "Support SLA",        value: "1h"        },
    ],
  },
];

// ── Spend History ─────────────────────────────────────────────────────────────

interface SpendRow {
  deployment_id: string;
  listing_name: string;
  slug: string;
  escrow_amount_cents: number;
  fee_cents: number;
  fee_pct: number;
  state: string;
  created_at: string;
}

function StateBadge({ state }: { state: string }) {
  const cls =
    state === "COMPLETED"    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500" :
    state === "VETOED"       ? "border-red-500/30 bg-red-500/10 text-red-500" :
    state === "VETO_WINDOW"  ? "border-amber-400/30 bg-amber-400/10 text-amber-400" :
                               "border-zinc-700 bg-zinc-800 text-zinc-400";
  return (
    <span className={`rounded-sm border px-1.5 py-0.5 font-mono text-[10px] ${cls}`}>
      {state.replace(/_/g, " ")}
    </span>
  );
}

function SpendHistory() {
  const [rows, setRows]     = useState<SpendRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/billing/history")
      .then((r) => r.json() as Promise<SpendRow[]>)
      .then(setRows)
      .finally(() => setLoading(false));
  }, []);

  const exportCsv = () => {
    const a = document.createElement("a");
    a.href = "/api/billing/history?export=csv";
    a.download = "spend-history.csv";
    a.click();
  };

  const totalEscrow = rows.reduce((s, r) => s + r.escrow_amount_cents, 0);
  const totalFees   = rows.reduce((s, r) => s + r.fee_cents, 0);

  if (loading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="animate-pulse rounded-sm border border-zinc-800 bg-zinc-900 h-10" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="font-mono text-sm text-zinc-400 py-4">No spend history yet.</p>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary tiles */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total Escrow", value: `$${(totalEscrow / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}` },
          { label: "Platform Fees", value: `$${(totalFees / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}` },
          { label: "Deployments", value: String(rows.length) },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-sm border border-zinc-800 bg-zinc-900 p-3 text-center">
            <p className="font-mono text-lg font-semibold text-amber-400">{value}</p>
            <p className="font-mono text-[10px] text-zinc-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Export */}
      <div className="flex justify-end">
        <button
          onClick={exportCsv}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-zinc-700 rounded-sm font-mono text-xs text-zinc-300 hover:border-zinc-500 transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          Export CSV
        </button>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block rounded-sm border border-zinc-800 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-zinc-900">
            <tr>
              {["Date", "Agent", "Escrow", "Fee (15%)", "Total", "State"].map((h) => (
                <th key={h} className="px-4 py-2.5 font-mono text-[10px] text-zinc-500 uppercase tracking-wider">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const total = r.escrow_amount_cents + r.fee_cents;
              return (
                <tr key={r.deployment_id} className={i % 2 === 0 ? "bg-zinc-950" : "bg-zinc-900/50"}>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-400">
                    {new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-200">
                    <Link href={`/marketplace/${r.slug}`} className="hover:text-amber-400 transition-colors">
                      {r.listing_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-300">
                    ${(r.escrow_amount_cents / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-400">
                    ${(r.fee_cents / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-200 font-medium">
                    ${(total / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3"><StateBadge state={r.state} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {rows.map((r) => (
          <div key={r.deployment_id} className="rounded-sm border border-zinc-800 bg-zinc-900 p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <Link href={`/marketplace/${r.slug}`} className="font-mono text-sm font-medium text-amber-400 hover:underline">
                {r.listing_name}
              </Link>
              <StateBadge state={r.state} />
            </div>
            <div className="flex items-center gap-4 font-mono text-xs text-zinc-400">
              <span>Escrow ${(r.escrow_amount_cents / 100).toFixed(2)}</span>
              <span>Fee ${(r.fee_cents / 100).toFixed(2)}</span>
            </div>
            <p className="font-mono text-[10px] text-zinc-600">
              {new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtUSD(cents: number) {
  if (cents === 0) return "Free";
  return `$${(cents / 100).toFixed(0)}/mo`;
}

// ── PlanCard ──────────────────────────────────────────────────────────────────

function PlanCard({
  plan, annual, current, onSelect,
}: {
  plan:     Plan;
  annual:   boolean;
  current:  string;
  onSelect: (id: string) => void;
}) {
  const Icon    = plan.icon;
  const price   = annual ? plan.annual_cents : plan.monthly_cents;
  const savings = plan.monthly_cents > 0
    ? Math.round(((plan.monthly_cents - plan.annual_cents) / plan.monthly_cents) * 100)
    : 0;
  const isCurrent = current === plan.id;

  return (
    <div className={`relative border rounded-sm overflow-hidden flex flex-col ${
      plan.highlight
        ? "border-amber-700 bg-amber-950/10"
        : "border-zinc-800 bg-zinc-900/40"
    }`}>
      {plan.highlight && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-amber-500" />
      )}
      {plan.highlight && (
        <div className="absolute top-2 right-2 font-mono text-[9px] uppercase tracking-widest px-1.5 py-0.5
                        border border-amber-700 text-amber-400 bg-amber-950/40 rounded-sm">
          Most Popular
        </div>
      )}

      <div className="p-4 flex-1">
        {/* Name + icon */}
        <div className="flex items-center gap-2 mb-1">
          <Icon className={`w-4 h-4 ${plan.highlight ? "text-amber-400" : "text-zinc-400"}`} />
          <p className="font-mono text-sm font-medium text-zinc-100">{plan.name}</p>
        </div>
        <p className="font-mono text-[10px] text-zinc-500 mb-3 leading-relaxed">{plan.tagline}</p>

        {/* Price */}
        <div className="mb-1">
          <span className={`font-mono text-2xl font-medium tabular-nums ${
            plan.highlight ? "text-amber-400" : "text-zinc-200"
          }`}>
            {fmtUSD(price)}
          </span>
          {annual && plan.monthly_cents > 0 && (
            <span className="font-mono text-[10px] text-green-400 ml-2">−{savings}% annual</span>
          )}
        </div>
        {annual && plan.monthly_cents > 0 && (
          <p className="font-mono text-[9px] text-zinc-600 mb-3">billed annually</p>
        )}

        {/* Limits grid */}
        <div className="space-y-1 mb-4">
          {plan.limits.map(({ label, value }) => (
            <div key={label} className="flex justify-between">
              <span className="font-mono text-[10px] text-zinc-600">{label}</span>
              <span className={`font-mono text-[10px] font-medium ${
                value === "—" ? "text-zinc-700" : plan.highlight ? "text-amber-400" : "text-zinc-300"
              }`}>{value}</span>
            </div>
          ))}
        </div>

        {/* Features */}
        <ul className="space-y-1.5">
          {plan.features.map((f) => (
            <li key={f} className="flex items-start gap-2">
              <CheckCircle2 className={`w-3 h-3 flex-shrink-0 mt-0.5 ${
                plan.highlight ? "text-amber-500" : "text-zinc-600"
              }`} />
              <span className="font-mono text-[10px] text-zinc-400 leading-relaxed">{f}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* CTA */}
      <div className="p-4 pt-0">
        <button
          onClick={() => onSelect(plan.id)}
          disabled={isCurrent}
          className={`w-full h-9 rounded-sm font-mono text-xs uppercase tracking-widest border transition-colors ${
            isCurrent
              ? "border-zinc-700 text-zinc-600 cursor-default"
              : plan.highlight
              ? "border-amber-700 bg-amber-950/40 text-amber-400 hover:border-amber-500"
              : "border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100"
          }`}
        >
          {isCurrent ? "✓ Current" : plan.cta}
        </button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const [tab,      setTab]     = useState<"plans" | "history">("plans");
  const [annual,  setAnnual]  = useState(false);
  const [current, setCurrent] = useState("starter");
  const [upgraded, setUpgraded] = useState<string | null>(null);

  function handleSelect(id: string) {
    if (id === "enterprise") return; // direct to sales
    setCurrent(id);
    setUpgraded(id);
    setTimeout(() => setUpgraded(null), 3000);
  }

  return (
      <main className="flex-1 p-4 pb-20 lg:pb-4 max-w-4xl mx-auto w-full space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-mono text-sm font-medium text-zinc-300 uppercase tracking-widest">Billing & Plans</h1>
            <p className="font-mono text-[10px] text-zinc-600 mt-0.5">Flat SaaS subscription — zero per-transaction commission</p>
          </div>
          <CreditCard className="w-5 h-5 text-amber-500" />
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-zinc-800">
          {(["plans", "history"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 font-mono text-xs capitalize transition-colors border-b-2 -mb-px ${
                tab === t
                  ? "border-amber-400 text-amber-400"
                  : "border-transparent text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {t === "plans" ? "Plans" : "Spend History"}
            </button>
          ))}
        </div>

        {tab === "history" && <SpendHistory />}

        {tab === "plans" && <>
        {/* Zero-commission callout */}
        <div className="border border-green-900/50 bg-green-950/10 rounded-sm p-3">
          <p className="font-mono text-[10px] text-green-500 uppercase tracking-widest mb-1">Zero Per-Transaction Commission</p>
          <p className="font-mono text-xs text-zinc-400 leading-relaxed">
            Unlike platforms charging 10–20% per deal, AiStaffApp charges a flat monthly subscription.
            You keep 100% of every engagement. The escrow fee covers only the neutral hold — not a revenue cut.
          </p>
        </div>

        {/* Annual toggle */}
        <div className="flex items-center gap-3">
          <span className={`font-mono text-xs ${!annual ? "text-zinc-200" : "text-zinc-600"}`}>Monthly</span>
          <button
            onClick={() => setAnnual(v => !v)}
            className={`relative w-10 h-5 rounded-full border transition-colors ${
              annual ? "border-amber-700 bg-amber-950/40" : "border-zinc-700 bg-zinc-800"
            }`}
          >
            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-zinc-300 transition-all ${
              annual ? "left-5 bg-amber-400" : "left-0.5"
            }`} />
          </button>
          <span className={`font-mono text-xs ${annual ? "text-zinc-200" : "text-zinc-600"}`}>
            Annual <span className="text-green-400">save up to 20%</span>
          </span>
        </div>

        {/* Plan cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {PLANS.map(plan => (
            <PlanCard
              key={plan.id}
              plan={plan}
              annual={annual}
              current={current}
              onSelect={handleSelect}
            />
          ))}
        </div>

        {/* Upgrade confirmation */}
        {upgraded && (
          <div className="border border-green-800 bg-green-950/20 rounded-sm p-3 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
            <p className="font-mono text-xs text-green-400">
              Upgraded to <span className="font-medium capitalize">{upgraded}</span> — changes take effect immediately.
            </p>
          </div>
        )}

        {/* FAQ */}
        <div className="border border-zinc-800 rounded-sm p-3 space-y-3">
          <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest">Common Questions</p>
          {[
            { q: "Can I switch plans mid-month?", a: "Yes — prorated credit is applied immediately to your next invoice." },
            { q: "Is there a contract or lock-in?", a: "No. Monthly plans cancel anytime. Annual plans include a 14-day money-back window." },
            { q: "What counts as a 'deployment'?", a: "Any active Wasm agent running in a client environment. Paused or completed deployments don't count." },
            { q: "How is the 0% commission enforced?", a: "Escrow funds flow peer-to-peer. The platform earns only from subscription fees, never from deal value." },
          ].map(({ q, a }) => (
            <div key={q}>
              <p className="font-mono text-[10px] text-zinc-300">{q}</p>
              <p className="font-mono text-[10px] text-zinc-600 mt-0.5 leading-relaxed">{a}</p>
            </div>
          ))}
        </div>
        </>}
      </main>
      );
}
