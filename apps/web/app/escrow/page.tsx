"use client";

import { useState } from "react";
import Link from "next/link";
import { Shield, CheckCircle2, Clock, AlertTriangle, ArrowUpRight, ChevronDown, ChevronUp } from "lucide-react";
import { AppSidebar, AppMobileNav } from "@/components/AppSidebar";

// ── Types & demo data ─────────────────────────────────────────────────────────

type MilestoneStatus = "funded" | "in_progress" | "pending_approval" | "approved" | "disputed" | "released";

interface Milestone {
  id:          string;
  label:       string;
  description: string;
  amount_cents: number;
  due_date:    string;
  status:      MilestoneStatus;
  deliverable: string;
  sla:         string;
}

interface EscrowContract {
  id:              string;
  project:         string;
  client:          string;
  talent:          string;
  total_cents:     number;
  funded_cents:    number;
  released_cents:  number;
  milestones:      Milestone[];
  created_at:      string;
}

const DEMO_CONTRACTS: EscrowContract[] = [
  {
    id:             "esc-0001",
    project:        "DataSync Pipeline Automation",
    client:         "Acme Corp",
    talent:         "Marcus T.",
    total_cents:    500000,
    funded_cents:   500000,
    released_cents: 160000,
    created_at:     "2026-02-14",
    milestones: [
      {
        id: "ms-001-1", label: "Phase 1 — Discovery",
        description: "Technical requirements doc, env audit, DoD checklist draft",
        amount_cents: 80000, due_date: "2026-02-21", status: "released",
        deliverable: "requirements.md + audit report", sla: "3 business days",
      },
      {
        id: "ms-001-2", label: "Phase 2 — Agent Config",
        description: "Wasm bundle configured, credential manifest, local tests passing",
        amount_cents: 240000, due_date: "2026-03-01", status: "released",
        deliverable: "agent.wasm + test suite", sla: "5 business days",
      },
      {
        id: "ms-001-3", label: "Phase 3 — Deployment",
        description: "Production deployment, artifact hash verified, DoD 6/6 passed",
        amount_cents: 120000, due_date: "2026-03-08", status: "pending_approval",
        deliverable: "live deployment + DoD checklist", sla: "3 business days",
      },
      {
        id: "ms-001-4", label: "Phase 4 — Handoff",
        description: "Client walkthrough, monitoring dashboard, 7-day warranty",
        amount_cents: 60000, due_date: "2026-03-12", status: "in_progress",
        deliverable: "runbook + monitoring alerts", sla: "2 business days",
      },
    ],
  },
  {
    id:             "esc-0002",
    project:        "ML Inference Optimization",
    client:         "NeuralCo",
    talent:         "Lena K.",
    total_cents:    320000,
    funded_cents:   160000,
    released_cents: 0,
    created_at:     "2026-03-01",
    milestones: [
      {
        id: "ms-002-1", label: "Phase 1 — Profiling",
        description: "Baseline benchmark + bottleneck report",
        amount_cents: 80000, due_date: "2026-03-10", status: "in_progress",
        deliverable: "benchmark_report.pdf", sla: "4 business days",
      },
      {
        id: "ms-002-2", label: "Phase 2 — Optimization",
        description: "Quantized model, latency −60% target",
        amount_cents: 160000, due_date: "2026-03-22", status: "funded",
        deliverable: "optimized_model.onnx", sla: "8 business days",
      },
      {
        id: "ms-002-3", label: "Phase 3 — Integration",
        description: "Deployed to staging, A/B test running",
        amount_cents: 80000, due_date: "2026-03-31", status: "funded",
        deliverable: "staging URL + A/B config", sla: "4 business days",
      },
    ],
  },
  {
    id:             "esc-0003",
    project:        "K8s Autoscaler Policy",
    client:         "DevOps Inc",
    talent:         "Diego R.",
    total_cents:    95000,
    funded_cents:   95000,
    released_cents: 95000,
    created_at:     "2026-01-20",
    milestones: [
      {
        id: "ms-003-1", label: "Wasm Policy Engine",
        description: "K8s autoscaler with Wasm-based policy — all tests passing",
        amount_cents: 95000, due_date: "2026-01-28", status: "released",
        deliverable: "policy.wasm + k8s manifests", sla: "7 business days",
      },
    ],
  },
];


// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtUSD(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

const STATUS_MAP: Record<MilestoneStatus, { label: string; color: string; bg: string; border: string }> = {
  funded:           { label: "Funded",           color: "text-sky-400",    bg: "bg-sky-950/20",    border: "border-sky-800"    },
  in_progress:      { label: "In Progress",      color: "text-amber-400",  bg: "bg-amber-950/20",  border: "border-amber-800"  },
  pending_approval: { label: "Pending Approval", color: "text-purple-400", bg: "bg-purple-950/20", border: "border-purple-800" },
  approved:         { label: "Approved",         color: "text-green-400",  bg: "bg-green-950/20",  border: "border-green-800"  },
  disputed:         { label: "Disputed",         color: "text-red-400",    bg: "bg-red-950/20",    border: "border-red-800"    },
  released:         { label: "Released",         color: "text-zinc-400",   bg: "bg-zinc-900",      border: "border-zinc-700"   },
};

function StatusBadge({ status }: { status: MilestoneStatus }) {
  const s = STATUS_MAP[status];
  return (
    <span className={`font-mono text-[9px] uppercase tracking-widest px-1.5 py-0.5 border rounded-sm ${s.color} ${s.border}`}>
      {s.label}
    </span>
  );
}

function ProgressBar({ funded, released, total }: { funded: number; released: number; total: number }) {
  const fundedPct   = Math.round((funded   / total) * 100);
  const releasedPct = Math.round((released / total) * 100);
  return (
    <div className="space-y-1">
      <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden relative">
        <div className="absolute inset-y-0 left-0 bg-sky-700 rounded-full" style={{ width: `${fundedPct}%` }} />
        <div className="absolute inset-y-0 left-0 bg-green-500 rounded-full" style={{ width: `${releasedPct}%` }} />
      </div>
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1 font-mono text-[9px] text-green-400">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" /> {fmtUSD(released)} released
        </span>
        <span className="flex items-center gap-1 font-mono text-[9px] text-sky-400">
          <span className="w-1.5 h-1.5 rounded-full bg-sky-700 inline-block" /> {fmtUSD(funded - released)} held
        </span>
        <span className="flex items-center gap-1 font-mono text-[9px] text-zinc-600">
          <span className="w-1.5 h-1.5 rounded-full bg-zinc-800 inline-block" /> {fmtUSD(total - funded)} unfunded
        </span>
      </div>
    </div>
  );
}

// ── ContractCard ──────────────────────────────────────────────────────────────

function ContractCard({ contract }: { contract: EscrowContract }) {
  const [open, setOpen] = useState(contract.milestones.some(m => m.status === "pending_approval"));
  const [approving, setApproving] = useState<string | null>(null);
  const [disputed,  setDisputed]  = useState<string | null>(null);

  const pendingApproval = contract.milestones.filter(m => m.status === "pending_approval");

  return (
    <div className="border border-zinc-800 rounded-sm bg-zinc-900/40 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-3 py-3 text-left hover:bg-zinc-900 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-mono text-xs font-medium text-zinc-100">{contract.project}</p>
            {pendingApproval.length > 0 && (
              <span className="font-mono text-[9px] px-1.5 py-0.5 border border-purple-800 text-purple-400 rounded-sm uppercase tracking-widest animate-pulse">
                {pendingApproval.length} awaiting approval
              </span>
            )}
          </div>
          <p className="font-mono text-[10px] text-zinc-600 mt-0.5">
            {contract.client} → {contract.talent} · since {contract.created_at}
          </p>
        </div>
        <div className="flex-shrink-0 text-right">
          <p className="font-mono text-[10px] text-zinc-600 uppercase">Total</p>
          <p className="font-mono text-sm font-medium text-zinc-200 tabular-nums">{fmtUSD(contract.total_cents)}</p>
        </div>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-zinc-600" /> : <ChevronDown className="w-3.5 h-3.5 text-zinc-600" />}
      </button>

      {/* Progress */}
      <div className="px-3 pb-3">
        <ProgressBar funded={contract.funded_cents} released={contract.released_cents} total={contract.total_cents} />
      </div>

      {/* Milestones */}
      {open && (
        <div className="border-t border-zinc-800 bg-zinc-950/40 divide-y divide-zinc-800/60">
          {contract.milestones.map((ms) => {
            const s = STATUS_MAP[ms.status];
            const isApprovable = ms.status === "pending_approval";

            return (
              <div key={ms.id} className={`px-3 py-2.5 ${isApprovable ? "bg-purple-950/10" : ""}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-mono text-xs font-medium text-zinc-200">{ms.label}</p>
                      <StatusBadge status={ms.status} />
                    </div>
                    <p className="font-mono text-[10px] text-zinc-500 mt-0.5 leading-relaxed">{ms.description}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="font-mono text-[9px] text-zinc-600">
                        <Clock className="inline w-2.5 h-2.5 mr-0.5" />Due {ms.due_date}
                      </span>
                      <span className="font-mono text-[9px] text-zinc-600">SLA: {ms.sla}</span>
                    </div>
                  </div>
                  <p className="font-mono text-sm font-medium text-zinc-200 tabular-nums flex-shrink-0">
                    {fmtUSD(ms.amount_cents)}
                  </p>
                </div>

                {/* Deliverable chip */}
                <div className="flex items-center gap-1.5 mt-1.5">
                  <ArrowUpRight className="w-2.5 h-2.5 text-zinc-600 flex-shrink-0" />
                  <span className="font-mono text-[9px] text-zinc-500">{ms.deliverable}</span>
                </div>

                {/* Approve / Dispute actions */}
                {isApprovable && approving !== ms.id && disputed !== ms.id && (
                  <div className="flex gap-2 mt-2.5">
                    <button
                      onClick={() => setApproving(ms.id)}
                      className="flex-1 h-8 rounded-sm border border-green-800 bg-green-950/30 text-green-400
                                 font-mono text-[10px] uppercase tracking-widest hover:border-green-600 transition-colors
                                 flex items-center justify-center gap-1.5"
                    >
                      <CheckCircle2 className="w-3 h-3" /> Approve & Release {fmtUSD(ms.amount_cents)}
                    </button>
                    <button
                      onClick={() => setDisputed(ms.id)}
                      className="h-8 px-3 rounded-sm border border-red-900 bg-red-950/20 text-red-400
                                 font-mono text-[10px] uppercase tracking-widest hover:border-red-700 transition-colors"
                    >
                      Dispute
                    </button>
                  </div>
                )}

                {approving === ms.id && (
                  <div className="flex items-center gap-2 mt-2.5 font-mono text-xs text-green-400">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Approved — {fmtUSD(ms.amount_cents)} queued for release (30s veto window)
                  </div>
                )}
                {disputed === ms.id && (
                  <div className="flex items-center gap-2 mt-2.5 font-mono text-xs text-red-400">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Dispute opened — escrow held pending resolution
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Summary bar ───────────────────────────────────────────────────────────────

function SummaryBar({ contracts }: { contracts: EscrowContract[] }) {
  const totalFunded   = contracts.reduce((s, c) => s + c.funded_cents, 0);
  const totalReleased = contracts.reduce((s, c) => s + c.released_cents, 0);
  const totalHeld     = totalFunded - totalReleased;
  const pending       = contracts.reduce((s, c) => s + c.milestones.filter(m => m.status === "pending_approval").length, 0);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {[
        { label: "Total Funded",    value: fmtUSD(totalFunded),   color: "text-sky-400"    },
        { label: "Total Released",  value: fmtUSD(totalReleased), color: "text-green-400"  },
        { label: "Held in Escrow",  value: fmtUSD(totalHeld),     color: "text-amber-400"  },
        { label: "Awaiting Approval", value: String(pending),     color: pending > 0 ? "text-purple-400" : "text-zinc-500" },
      ].map(({ label, value, color }) => (
        <div key={label} className="border border-zinc-800 rounded-sm p-2.5 bg-zinc-900/40">
          <p className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest">{label}</p>
          <p className={`font-mono text-base font-medium tabular-nums mt-0.5 ${color}`}>{value}</p>
        </div>
      ))}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function EscrowPage() {
  const [tab, setTab] = useState<"active" | "completed">("active");
  const active    = DEMO_CONTRACTS.filter(c => c.released_cents < c.total_cents);
  const completed = DEMO_CONTRACTS.filter(c => c.released_cents >= c.total_cents);
  const shown     = tab === "active" ? active : completed;

  return (
    <div className="flex flex-col lg:flex-row min-h-screen">
      <AppSidebar />

      {/* Main */}
      <main className="flex-1 p-4 pb-20 lg:pb-4 max-w-3xl mx-auto w-full space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-mono text-sm font-medium text-zinc-300 uppercase tracking-widest">Milestone Escrow</h1>
            <p className="font-mono text-[10px] text-zinc-600 mt-0.5">Funds released only on milestone approval</p>
          </div>
          <Shield className="w-5 h-5 text-amber-500" />
        </div>

        {/* How it works */}
        <div className="border border-amber-900/40 bg-amber-950/10 rounded-sm p-3">
          <p className="font-mono text-[10px] text-amber-500 uppercase tracking-widest mb-1">How escrow works</p>
          <p className="font-mono text-xs text-zinc-400 leading-relaxed">
            Client funds are held in a neutral escrow account. Each milestone unlocks independently — talent
            cannot be underpaid and clients cannot withhold funds arbitrarily. Disputes trigger a 48h mediation window
            before any escrow action.
          </p>
        </div>

        {/* Summary */}
        <SummaryBar contracts={DEMO_CONTRACTS} />

        {/* Tabs */}
        <div className="flex gap-1 border-b border-zinc-800">
          {[
            { key: "active" as const,    label: `Active (${active.length})`    },
            { key: "completed" as const, label: `Completed (${completed.length})` },
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

        {/* Cards */}
        <div className="space-y-3">
          {shown.map(c => <ContractCard key={c.id} contract={c} />)}
        </div>
      </main>

      <AppMobileNav />
    </div>
  );
}
