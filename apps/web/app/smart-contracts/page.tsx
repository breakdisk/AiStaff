"use client";

import { useState } from "react";
import Link from "next/link";
import { FileCode2, CheckCircle2, AlertTriangle, Clock, ExternalLink, Copy, ChevronDown, ChevronUp } from "lucide-react";

// ── Types & demo data ─────────────────────────────────────────────────────────

type ContractState = "deployed" | "active" | "completed" | "disputed" | "cancelled";

interface ChainEvent {
  block:    number;
  tx:       string;
  event:    string;
  actor:    string;
  ts:       string;
}

interface SmartContract {
  id:             string;
  address:        string;       // simulated on-chain address
  chain:          string;
  project:        string;
  client:         string;
  talent:         string;
  total_cents:    number;
  escrowed_cents: number;
  state:          ContractState;
  deployed_at:    string;
  logic_hash:     string;       // Blake3 of contract bytecode
  events:         ChainEvent[];
  clauses: {
    label:   string;
    value:   string;
    met:     boolean | null;    // null = not yet evaluable
  }[];
}

const DEMO_CONTRACTS: SmartContract[] = [
  {
    id:             "sc-0001",
    address:        "0x4a7b3f92e1d8c506a9f0b2e4d7c3a1f8b5e9d2c6",
    chain:          "Ethereum L2 (Base)",
    project:        "DataSync Pipeline Automation",
    client:         "Acme Corp",
    talent:         "Marcus T.",
    total_cents:    500000,
    escrowed_cents: 340000,
    state:          "active",
    deployed_at:    "2026-02-14T09:12:00Z",
    logic_hash:     "blake3:a4f9c2e1b7d3085f...9a2c6e1b4",
    clauses: [
      { label: "Escrow funded in full",          value: "Within 24h of signing",  met: true  },
      { label: "Milestone 1 deliverable hash",   value: "SHA-256 match required", met: true  },
      { label: "Milestone 2 deliverable hash",   value: "SHA-256 match required", met: true  },
      { label: "Milestone 3 approved",           value: "Client signature",       met: null  },
      { label: "Milestone 4 approved",           value: "Client signature",       met: null  },
      { label: "Veto window respected (30s)",    value: "No veto → auto-release", met: null  },
    ],
    events: [
      { block: 18924301, tx: "0xf3a1...b29c", event: "ContractDeployed",   actor: "Acme Corp",  ts: "2026-02-14 09:12" },
      { block: 18924455, tx: "0xd8e2...c1a4", event: "EscrowFunded",       actor: "Acme Corp",  ts: "2026-02-14 10:44" },
      { block: 18941220, tx: "0xa9f1...7d3b", event: "MilestoneApproved",  actor: "Acme Corp",  ts: "2026-02-21 14:02" },
      { block: 18941221, tx: "0xc5b3...e8f2", event: "FundsReleased",      actor: "Contract",   ts: "2026-02-21 14:02" },
      { block: 18963004, tx: "0xe1a7...4c9d", event: "MilestoneApproved",  actor: "Acme Corp",  ts: "2026-03-01 11:30" },
      { block: 18963005, tx: "0xf7c2...b1e6", event: "FundsReleased",      actor: "Contract",   ts: "2026-03-01 11:30" },
    ],
  },
  {
    id:             "sc-0002",
    address:        "0x7c1d9a4e3f8b2065c7a3e1d9b4f2c8a5e7b3d9f1",
    chain:          "Polygon zkEVM",
    project:        "ML Inference Optimisation",
    client:         "NeuralCo",
    talent:         "Lena K.",
    total_cents:    320000,
    escrowed_cents: 160000,
    state:          "active",
    deployed_at:    "2026-03-01T13:00:00Z",
    logic_hash:     "blake3:b1e7d4c2a9f3085e...7c3a1d9f4",
    clauses: [
      { label: "Partial escrow funded (50%)",    value: "Within 48h of signing",  met: true  },
      { label: "Profiling report hash",          value: "SHA-256 match required", met: null  },
      { label: "Latency SLA: −40% p99",         value: "Auto-verified via APM",  met: null  },
      { label: "Second tranche funded",          value: "On milestone 2 approval",met: null  },
      { label: "Veto window respected (30s)",    value: "No veto → auto-release", met: null  },
    ],
    events: [
      { block: 5814002, tx: "0xb2c1...a7e3", event: "ContractDeployed",  actor: "NeuralCo",  ts: "2026-03-01 13:00" },
      { block: 5814188, tx: "0xe9d4...f2b1", event: "EscrowFunded",      actor: "NeuralCo",  ts: "2026-03-01 14:22" },
    ],
  },
  {
    id:             "sc-0003",
    address:        "0x2e5a8c1f7d3b904a6e2f8c4b1d7a3e9f2c5b8a4d",
    chain:          "Ethereum L2 (Base)",
    project:        "K8s Autoscaler Policy",
    client:         "DevOps Inc",
    talent:         "Diego R.",
    total_cents:    95000,
    escrowed_cents: 0,
    state:          "completed",
    deployed_at:    "2026-01-20T08:30:00Z",
    logic_hash:     "blake3:d9c2a1e7b4f305c8...1a9e7b4c2",
    clauses: [
      { label: "Escrow funded in full",          value: "Within 24h of signing",  met: true  },
      { label: "Deliverable hash match",         value: "SHA-256 match required", met: true  },
      { label: "Client approval signature",      value: "On-chain EIP-712",       met: true  },
      { label: "Veto window respected (30s)",    value: "No veto → auto-released",met: true  },
    ],
    events: [
      { block: 18710001, tx: "0xc4a2...b9f3", event: "ContractDeployed",  actor: "DevOps Inc", ts: "2026-01-20 08:30" },
      { block: 18710200, tx: "0xf1b4...d7e2", event: "EscrowFunded",      actor: "DevOps Inc", ts: "2026-01-20 09:51" },
      { block: 18728004, tx: "0xa8e1...c3f7", event: "MilestoneApproved", actor: "DevOps Inc", ts: "2026-01-28 16:04" },
      { block: 18728006, tx: "0xd2c9...e4b1", event: "FundsReleased",     actor: "Contract",   ts: "2026-01-28 16:05" },
      { block: 18728007, tx: "0xe5a3...f8c2", event: "ContractClosed",    actor: "Contract",   ts: "2026-01-28 16:05" },
    ],
  },
];

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
  { label: "Payouts",            href: "/payouts"            },
  { label: "Billing",            href: "/billing"            },
  { label: "Smart Contracts",    href: "/smart-contracts",    active: true },
  { label: "Outcome Listings",   href: "/outcome-listings"   },
  { label: "Pricing Calculator", href: "/pricing-calculator" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtUSD(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

function shortAddr(addr: string) { return addr.slice(0, 8) + "…" + addr.slice(-6); }
function shortTx(tx: string)     { return tx.slice(0, 8) + "…" + tx.slice(-4); }

const STATE_MAP: Record<ContractState, { label: string; color: string; border: string }> = {
  deployed:  { label: "Deployed",  color: "text-sky-400",    border: "border-sky-800"    },
  active:    { label: "Active",    color: "text-amber-400",  border: "border-amber-800"  },
  completed: { label: "Completed", color: "text-green-400",  border: "border-green-800"  },
  disputed:  { label: "Disputed",  color: "text-red-400",    border: "border-red-800"    },
  cancelled: { label: "Cancelled", color: "text-zinc-500",   border: "border-zinc-700"   },
};

// ── ContractCard ──────────────────────────────────────────────────────────────

function ContractCard({ contract }: { contract: SmartContract }) {
  const [open,    setOpen]    = useState(false);
  const [tab,     setTab]     = useState<"clauses" | "events">("clauses");
  const [copied,  setCopied]  = useState(false);
  const s = STATE_MAP[contract.state];

  function copyAddr() {
    navigator.clipboard.writeText(contract.address).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const metCount  = contract.clauses.filter(c => c.met === true).length;
  const totalC    = contract.clauses.length;

  return (
    <div className={`border rounded-sm overflow-hidden ${
      contract.state === "active" ? "border-amber-900/50" :
      contract.state === "completed" ? "border-green-900/50" :
      "border-zinc-800"
    } bg-zinc-900/40`}>
      {/* Header — div not button to allow nested copy button */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen(v => !v)}
        onKeyDown={(e) => e.key === "Enter" && setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-3 py-3 text-left hover:bg-zinc-900/60 transition-colors cursor-pointer"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-mono text-xs font-medium text-zinc-100">{contract.project}</p>
            <span className={`font-mono text-[9px] uppercase tracking-widest px-1.5 py-0.5 border rounded-sm ${s.color} ${s.border}`}>
              {s.label}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            <p className="font-mono text-[10px] text-zinc-600">{contract.chain}</p>
            <button
              onClick={(e) => { e.stopPropagation(); copyAddr(); }}
              className="flex items-center gap-1 font-mono text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              <Copy className="w-2.5 h-2.5" />
              {copied ? "Copied!" : shortAddr(contract.address)}
            </button>
          </div>
        </div>

        {/* Clause progress */}
        <div className="flex-shrink-0 text-right">
          <p className="font-mono text-[9px] text-zinc-600 uppercase">Clauses</p>
          <p className={`font-mono text-sm font-medium tabular-nums ${
            metCount === totalC ? "text-green-400" : "text-amber-400"
          }`}>{metCount}/{totalC}</p>
        </div>

        {/* Escrow */}
        <div className="flex-shrink-0 text-right">
          <p className="font-mono text-[9px] text-zinc-600 uppercase">Escrow</p>
          <p className="font-mono text-sm font-medium text-zinc-200 tabular-nums">{fmtUSD(contract.escrowed_cents)}</p>
        </div>

        {open ? <ChevronUp className="w-3.5 h-3.5 text-zinc-600" /> : <ChevronDown className="w-3.5 h-3.5 text-zinc-600" />}
      </div>

      {/* Meta strip */}
      <div className="px-3 pb-2 flex items-center gap-4 flex-wrap">
        <span className="font-mono text-[9px] text-zinc-600">{contract.client} → {contract.talent}</span>
        <span className="font-mono text-[9px] text-zinc-700">Total {fmtUSD(contract.total_cents)}</span>
        <span className="font-mono text-[9px] text-zinc-700">Deployed {contract.deployed_at.slice(0, 10)}</span>
      </div>

      {/* Expanded */}
      {open && (
        <div className="border-t border-zinc-800 bg-zinc-950/40">
          {/* Logic hash */}
          <div className="px-3 py-2 border-b border-zinc-800/60 flex items-center gap-2">
            <FileCode2 className="w-3 h-3 text-zinc-600 flex-shrink-0" />
            <p className="font-mono text-[9px] text-zinc-600 truncate flex-1">Contract hash: <span className="text-zinc-400">{contract.logic_hash}</span></p>
            <a href="#" className="flex items-center gap-1 font-mono text-[9px] text-zinc-600 hover:text-zinc-400 transition-colors flex-shrink-0">
              <ExternalLink className="w-2.5 h-2.5" /> Explorer
            </a>
          </div>

          {/* Inner tabs */}
          <div className="flex gap-1 border-b border-zinc-800 px-3">
            {(["clauses", "events"] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`py-2 px-2 font-mono text-[10px] uppercase tracking-widest border-b-2 transition-colors ${
                  tab === t ? "border-amber-500 text-amber-400" : "border-transparent text-zinc-600 hover:text-zinc-400"
                }`}
              >{t}</button>
            ))}
          </div>

          {tab === "clauses" && (
            <div className="p-3 space-y-1.5">
              {contract.clauses.map((c, i) => (
                <div key={i} className="flex items-center gap-2.5">
                  {c.met === true  && <CheckCircle2 className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />}
                  {c.met === false && <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />}
                  {c.met === null  && <Clock className="w-3.5 h-3.5 text-zinc-600 flex-shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className={`font-mono text-[10px] ${c.met === true ? "text-zinc-300" : "text-zinc-500"}`}>{c.label}</p>
                    <p className="font-mono text-[9px] text-zinc-700">{c.value}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === "events" && (
            <div className="p-3 space-y-1.5">
              {contract.events.map((ev, i) => (
                <div key={i} className="flex items-center gap-2.5 border border-zinc-800/60 rounded-sm px-2.5 py-1.5">
                  <div className="flex-shrink-0 text-right w-16">
                    <p className="font-mono text-[9px] text-zinc-700 tabular-nums">#{ev.block}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`font-mono text-[10px] font-medium ${
                      ev.event.includes("Released") || ev.event.includes("Closed") ? "text-green-400"
                      : ev.event.includes("Dispute") ? "text-red-400"
                      : "text-zinc-300"
                    }`}>{ev.event}</p>
                    <p className="font-mono text-[9px] text-zinc-600">by {ev.actor} · {shortTx(ev.tx)}</p>
                  </div>
                  <p className="font-mono text-[9px] text-zinc-700 flex-shrink-0">{ev.ts.slice(11)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SmartContractsPage() {
  const [tab, setTab] = useState<"active" | "completed">("active");
  const active    = DEMO_CONTRACTS.filter(c => c.state === "active" || c.state === "deployed");
  const completed = DEMO_CONTRACTS.filter(c => c.state === "completed" || c.state === "cancelled");
  const shown     = tab === "active" ? active : completed;

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
          {PAYMENTS_NAV.map(({ label, href, active: isActive }) => (
            <Link key={label} href={href}
              className={`block px-3 py-1.5 rounded-sm font-mono text-xs transition-colors ${
                isActive ? "text-zinc-100 bg-zinc-800" : "text-zinc-600 hover:text-zinc-300 hover:bg-zinc-900"
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
            <h1 className="font-mono text-sm font-medium text-zinc-300 uppercase tracking-widest">Smart Contracts</h1>
            <p className="font-mono text-[10px] text-zinc-600 mt-0.5">On-chain escrow logic · trustless dispute resolution</p>
          </div>
          <FileCode2 className="w-5 h-5 text-amber-500" />
        </div>

        {/* Explainer */}
        <div className="border border-amber-900/40 bg-amber-950/10 rounded-sm p-3">
          <p className="font-mono text-[10px] text-amber-500 uppercase tracking-widest mb-1">How smart contracts work here</p>
          <p className="font-mono text-xs text-zinc-400 leading-relaxed">
            Each engagement deploys an immutable contract to an EVM L2. Escrow funds are held by the contract —
            not by AiStaffApp. Funds release automatically when clauses are met (deliverable hash + client signature).
            Disputes invoke on-chain mediation logic; no single party can unilaterally seize funds.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Active contracts",   value: String(active.length),    color: "text-amber-400" },
            { label: "Total on-chain",     value: fmtUSD(DEMO_CONTRACTS.reduce((s, c) => s + c.escrowed_cents, 0)), color: "text-sky-400" },
            { label: "Chains supported",   value: "3",                      color: "text-zinc-300"  },
          ].map(({ label, value, color }) => (
            <div key={label} className="border border-zinc-800 rounded-sm p-2.5 bg-zinc-900/40">
              <p className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest">{label}</p>
              <p className={`font-mono text-base font-medium tabular-nums mt-0.5 ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-zinc-800">
          {[
            { key: "active"    as const, label: `Active (${active.length})`    },
            { key: "completed" as const, label: `Completed (${completed.length})` },
          ].map(({ key, label }) => (
            <button key={key} onClick={() => setTab(key)}
              className={`px-3 py-2 font-mono text-xs border-b-2 transition-colors ${
                tab === key ? "border-amber-500 text-amber-400" : "border-transparent text-zinc-500 hover:text-zinc-300"
              }`}
            >{label}</button>
          ))}
        </div>

        {/* Cards */}
        <div className="space-y-3">
          {shown.map(c => <ContractCard key={c.id} contract={c} />)}
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
