"use client";

import { useState } from "react";
import Link from "next/link";
import { Banknote, CheckCircle2, Clock, Plus, ArrowDownLeft, Globe } from "lucide-react";

// ── Types & demo data ─────────────────────────────────────────────────────────

type RailStatus = "connected" | "pending" | "disconnected";
type PayoutStatus = "processing" | "completed" | "failed" | "scheduled";

interface PayoutRail {
  id:           string;
  provider:     string;
  logo:         string;       // emoji placeholder
  description:  string;
  currencies:   string[];
  fee_pct:      number;
  min_payout:   number;       // cents
  settle_days:  number;
  status:       RailStatus;
  account_hint: string | null;
}

interface PayoutRecord {
  id:         string;
  amount_cents: number;
  currency:   string;
  rail:       string;
  status:     PayoutStatus;
  initiated:  string;
  settled:    string | null;
  reference:  string;
}

const RAILS: PayoutRail[] = [
  {
    id: "stripe", provider: "Stripe", logo: "◈",
    description: "Instant payouts to debit card or bank account. Best for US/EU.",
    currencies: ["USD", "EUR", "GBP", "CAD", "AUD"],
    fee_pct: 0.25, min_payout: 100, settle_days: 1,
    status: "connected", account_hint: "****4242",
  },
  {
    id: "wise", provider: "Wise", logo: "✦",
    description: "Multi-currency transfers at mid-market rate. Best for international.",
    currencies: ["USD", "EUR", "GBP", "INR", "BRL", "NGN", "SGD", "+50"],
    fee_pct: 0.41, min_payout: 500, settle_days: 1,
    status: "connected", account_hint: "wise_****7890",
  },
  {
    id: "paypal", provider: "PayPal", logo: "◉",
    description: "Widely accepted globally. Instant to PayPal balance.",
    currencies: ["USD", "EUR", "GBP", "JPY", "MXN"],
    fee_pct: 1.5, min_payout: 100, settle_days: 0,
    status: "pending", account_hint: null,
  },
  {
    id: "payoneer", provider: "Payoneer", logo: "⬡",
    description: "Ideal for emerging markets. Prepaid card available.",
    currencies: ["USD", "EUR", "GBP", "AUD", "CAD", "JPY"],
    fee_pct: 2.0, min_payout: 5000, settle_days: 2,
    status: "disconnected", account_hint: null,
  },
];

const PAYOUT_HISTORY: PayoutRecord[] = [
  { id: "pay-001", amount_cents: 55500, currency: "USD", rail: "Stripe",   status: "completed",  initiated: "2026-03-05", settled: "2026-03-06",  reference: "po_3PxK...a7b2" },
  { id: "pay-002", amount_cents: 36000, currency: "USD", rail: "Wise",     status: "completed",  initiated: "2026-02-28", settled: "2026-03-01",  reference: "T2026022...891" },
  { id: "pay-003", amount_cents: 24000, currency: "EUR", rail: "Wise",     status: "processing", initiated: "2026-03-08", settled: null,           reference: "T2026030...442" },
  { id: "pay-004", amount_cents: 18500, currency: "USD", rail: "Stripe",   status: "scheduled",  initiated: "2026-03-10", settled: null,           reference: "po_pending" },
  { id: "pay-005", amount_cents: 9500,  currency: "USD", rail: "PayPal",   status: "failed",     initiated: "2026-03-03", settled: null,           reference: "ERROR: acc pending" },
];

const PENDING_CENTS  = 42500;
const BALANCE_CENTS  = 97000;

// ── Sidebar nav ───────────────────────────────────────────────────────────────

const SIDEBAR_NAV = [
  { label: "Dashboard",   href: "/dashboard"   },
  { label: "Marketplace", href: "/marketplace" },
  { label: "Leaderboard", href: "/leaderboard" },
  { label: "Matching",    href: "/matching"    },
  { label: "Profile",     href: "/profile"     },
];

const PAYMENTS_NAV = [
  { label: "Escrow",             href: "/escrow"             },
  { label: "Payouts",            href: "/payouts",            active: true },
  { label: "Billing",            href: "/billing"             },
  { label: "Smart Contracts",    href: "/smart-contracts"     },
  { label: "Outcome Listings",   href: "/outcome-listings"    },
  { label: "Pricing Calculator", href: "/pricing-calculator"  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtUSD(cents: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(cents / 100);
}

const STATUS_COLOR: Record<PayoutStatus, string> = {
  completed:  "text-green-400",
  processing: "text-amber-400",
  scheduled:  "text-sky-400",
  failed:     "text-red-400",
};

const RAIL_STATUS_MAP: Record<RailStatus, { label: string; color: string; dot: string }> = {
  connected:    { label: "Connected",    color: "text-green-400", dot: "bg-green-400"  },
  pending:      { label: "Pending",      color: "text-amber-400", dot: "bg-amber-400"  },
  disconnected: { label: "Disconnected", color: "text-zinc-600",  dot: "bg-zinc-700"   },
};

// ── RailCard ──────────────────────────────────────────────────────────────────

function RailCard({ rail, onConnect }: { rail: PayoutRail; onConnect: (id: string) => void }) {
  const s = RAIL_STATUS_MAP[rail.status];

  return (
    <div className={`border rounded-sm p-3 transition-colors ${
      rail.status === "connected" ? "border-zinc-700 bg-zinc-900/60" :
      rail.status === "pending"   ? "border-amber-900/60 bg-amber-950/10" :
                                    "border-zinc-800 bg-zinc-900/20 opacity-60"
    }`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-sm border border-zinc-700 bg-zinc-800 flex items-center justify-center flex-shrink-0 font-mono text-base text-zinc-300">
            {rail.logo}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <p className="font-mono text-xs font-medium text-zinc-100">{rail.provider}</p>
              <span className={`w-1.5 h-1.5 rounded-full ${s.dot} inline-block`} />
              <span className={`font-mono text-[9px] ${s.color}`}>{s.label}</span>
            </div>
            <p className="font-mono text-[10px] text-zinc-500 mt-0.5 max-w-[220px] leading-relaxed">{rail.description}</p>
          </div>
        </div>
        <div className="flex-shrink-0 text-right">
          <p className="font-mono text-[9px] text-zinc-600 uppercase">Fee</p>
          <p className="font-mono text-xs text-zinc-300">{rail.fee_pct}%</p>
        </div>
      </div>

      <div className="flex items-center gap-4 mt-2.5 flex-wrap">
        <div>
          <p className="font-mono text-[9px] text-zinc-600 uppercase">Settle</p>
          <p className="font-mono text-xs text-zinc-400">{rail.settle_days === 0 ? "Instant" : `${rail.settle_days}d`}</p>
        </div>
        <div>
          <p className="font-mono text-[9px] text-zinc-600 uppercase">Min Payout</p>
          <p className="font-mono text-xs text-zinc-400">{fmtUSD(rail.min_payout)}</p>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-mono text-[9px] text-zinc-600 uppercase">Currencies</p>
          <p className="font-mono text-[10px] text-zinc-500 truncate">{rail.currencies.join(" · ")}</p>
        </div>

        {rail.status === "connected" && rail.account_hint && (
          <span className="font-mono text-[9px] text-green-400 border border-green-900 px-1.5 py-0.5 rounded-sm">
            {rail.account_hint}
          </span>
        )}
        {rail.status !== "connected" && (
          <button
            onClick={() => onConnect(rail.id)}
            className="flex items-center gap-1.5 h-7 px-2.5 rounded-sm border border-amber-900 bg-amber-950/30
                       text-amber-400 font-mono text-[9px] uppercase tracking-widest hover:border-amber-700 transition-colors"
          >
            <Plus className="w-3 h-3" />
            {rail.status === "pending" ? "Complete Setup" : "Connect"}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PayoutsPage() {
  const [tab, setTab] = useState<"rails" | "history">("rails");
  const [connected, setConnected] = useState<Set<string>>(new Set(["stripe", "wise"]));

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
          <p className="font-mono text-[10px] text-zinc-700 uppercase tracking-widest px-3">Payments</p>
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
            <h1 className="font-mono text-sm font-medium text-zinc-300 uppercase tracking-widest">Global Payout Rails</h1>
            <p className="font-mono text-[10px] text-zinc-600 mt-0.5">Multi-currency payouts via Stripe, Wise, PayPal, Payoneer</p>
          </div>
          <Globe className="w-5 h-5 text-amber-500" />
        </div>

        {/* Balance summary */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <div className="border border-zinc-800 rounded-sm p-2.5 bg-zinc-900/40">
            <p className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest">Available Balance</p>
            <p className="font-mono text-lg font-medium text-green-400 tabular-nums mt-0.5">{fmtUSD(BALANCE_CENTS)}</p>
          </div>
          <div className="border border-zinc-800 rounded-sm p-2.5 bg-zinc-900/40">
            <p className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest">Processing</p>
            <p className="font-mono text-lg font-medium text-amber-400 tabular-nums mt-0.5">{fmtUSD(PENDING_CENTS)}</p>
          </div>
          <div className="col-span-2 sm:col-span-1 border border-zinc-800 rounded-sm p-2.5 bg-zinc-900/40">
            <p className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest">Rails Connected</p>
            <p className="font-mono text-lg font-medium text-zinc-200 tabular-nums mt-0.5">{connected.size} / {RAILS.length}</p>
          </div>
        </div>

        {/* Withdraw CTA */}
        <button className="w-full h-10 rounded-sm border border-amber-900 bg-amber-950/30 text-amber-400
                           font-mono text-xs uppercase tracking-widest hover:border-amber-700 transition-colors
                           flex items-center justify-center gap-2">
          <ArrowDownLeft className="w-4 h-4" />
          Withdraw {fmtUSD(BALANCE_CENTS)} — Choose Rail
        </button>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-zinc-800">
          {[
            { key: "rails"   as const, label: "Payment Rails" },
            { key: "history" as const, label: "Payout History" },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-3 py-2 font-mono text-xs border-b-2 transition-colors ${
                tab === key ? "border-amber-500 text-amber-400" : "border-transparent text-zinc-500 hover:text-zinc-300"
              }`}
            >{label}</button>
          ))}
        </div>

        {tab === "rails" && (
          <div className="space-y-2">
            {RAILS.map(r => (
              <RailCard
                key={r.id}
                rail={r}
                onConnect={(id) => setConnected(prev => new Set([...prev, id]))}
              />
            ))}
            <p className="font-mono text-[9px] text-zinc-700 text-center pt-1">
              More rails (Crypto, SEPA Direct, ACH) coming in Q2 2026
            </p>
          </div>
        )}

        {tab === "history" && (
          <div className="border border-zinc-800 rounded-sm overflow-hidden">
            {/* Desktop table header */}
            <div className="hidden sm:grid grid-cols-5 gap-2 px-3 py-2 border-b border-zinc-800 bg-zinc-900/60">
              {["Amount", "Rail", "Status", "Initiated", "Reference"].map(h => (
                <p key={h} className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest">{h}</p>
              ))}
            </div>
            <div className="divide-y divide-zinc-800/60">
              {PAYOUT_HISTORY.map(p => (
                <div key={p.id} className="px-3 py-2.5 grid grid-cols-2 sm:grid-cols-5 gap-2 items-center">
                  <p className="font-mono text-xs font-medium text-zinc-200 tabular-nums">
                    {fmtUSD(p.amount_cents, p.currency)}
                    <span className="text-zinc-600 ml-1">{p.currency}</span>
                  </p>
                  <p className="font-mono text-[10px] text-zinc-400">{p.rail}</p>
                  <p className={`font-mono text-[10px] uppercase tracking-widest ${STATUS_COLOR[p.status]}`}>{p.status}</p>
                  <p className="font-mono text-[10px] text-zinc-500">{p.initiated}</p>
                  <p className="font-mono text-[9px] text-zinc-600 truncate col-span-2 sm:col-span-1">{p.reference}</p>
                </div>
              ))}
            </div>
          </div>
        )}
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
