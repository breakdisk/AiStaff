"use client";

import { useState } from "react";
import Link from "next/link";
import {
  LayoutDashboard, Store, Trophy, User, ShieldCheck,
  Brain, ScanSearch, GitMerge, Target, TrendingUp, Shuffle,
  CreditCard, Wallet, Receipt, FileText, Calculator, Link2,
  BookOpen, Video, MessageSquare, Layers, ChevronDown, ChevronUp,
  Shield, AlertTriangle, CheckCircle, Clock, XCircle,
  Code, FileSearch, Lock, Zap, RotateCcw, Play, Eye,
  Bug, Copy, ChevronRight, Info
} from "lucide-react";

// ── Nav constants ─────────────────────────────────────────────────────────────
const MAIN_NAV = [
  { href: "/dashboard",   label: "Dashboard",   icon: LayoutDashboard },
  { href: "/marketplace", label: "Marketplace",  icon: Store },
  { href: "/matching",    label: "Matching",      icon: Shuffle },
  { href: "/leaderboard", label: "Leaderboard",  icon: Trophy },
];

const AI_TOOLS_NAV = [
  { href: "/matching",     label: "AI Matching",    icon: Brain },
  { href: "/scoping",      label: "Scoping",         icon: ScanSearch },
  { href: "/outcomes",     label: "Outcomes",        icon: Target },
  { href: "/proposals",    label: "Proposals",       icon: GitMerge },
  { href: "/pricing-tool", label: "Pricing",         icon: TrendingUp },
];

const PAYMENTS_NAV = [
  { href: "/escrow",              label: "Escrow",       icon: Lock },
  { href: "/payouts",             label: "Payouts",       icon: Wallet },
  { href: "/billing",             label: "Billing",       icon: Receipt },
  { href: "/smart-contracts",     label: "Contracts",     icon: FileText },
  { href: "/outcome-listings",    label: "Outcomes",      icon: Target },
  { href: "/pricing-calculator",  label: "Calculator",    icon: Calculator },
];

const WORKSPACE_NAV = [
  { href: "/work-diaries",   label: "Work Diaries",    icon: BookOpen },
  { href: "/async-collab",   label: "Async Collab",    icon: Video },
  { href: "/collab",         label: "Collaboration",   icon: MessageSquare },
  { href: "/success-layer",  label: "Success Layer",   icon: Layers },
  { href: "/quality-gate",   label: "Quality Gate",    icon: ShieldCheck, active: true },
];

// ── Types ─────────────────────────────────────────────────────────────────────
type ScanStatus = "pending" | "scanning" | "passed" | "flagged" | "skipped";
type SeverityLevel = "critical" | "high" | "medium" | "low" | "info";
type ScanType = "code" | "text" | "security" | "plagiarism";

interface ScanIssue {
  id: string;
  severity: SeverityLevel;
  category: string;
  message: string;
  location: string;
  suggestion: string;
}

interface DeliverableScan {
  id: string;
  name: string;
  type: ScanType;
  milestone: string;
  uploadedAt: string;
  fileSize: string;
  status: ScanStatus;
  score: number | null;         // 0–100; null if not yet scanned
  blocksRelease: boolean;
  issues: ScanIssue[];
  scannedAt?: string;
  duration?: string;            // scan duration e.g. "4.2s"
}

// ── Demo data ─────────────────────────────────────────────────────────────────
const DEMO_SCANS: DeliverableScan[] = [
  {
    id: "scan-001",
    name: "data_pipeline_v3.py",
    type: "code",
    milestone: "Phase 1 — Core Pipeline",
    uploadedAt: "2026-03-08 09:14",
    fileSize: "42 KB",
    status: "flagged",
    score: 61,
    blocksRelease: true,
    scannedAt: "2026-03-08 09:14:38",
    duration: "3.7s",
    issues: [
      {
        id: "i-001",
        severity: "critical",
        category: "Security",
        message: "Hardcoded API key detected in source",
        location: "Line 47: api_key = \"sk-live-prod-...",
        suggestion: "Move to environment variable or secrets manager. Never commit credentials.",
      },
      {
        id: "i-002",
        severity: "high",
        category: "Bug",
        message: "SQL injection vulnerability — unsanitised user input in query",
        location: "Line 112: query = f\"SELECT * FROM {user_table}\"",
        suggestion: "Use parameterised queries: `cursor.execute('SELECT * FROM ?', (user_table,))`",
      },
      {
        id: "i-003",
        severity: "medium",
        category: "Quality",
        message: "Bare except clause swallows all exceptions silently",
        location: "Line 89: except:",
        suggestion: "Catch specific exceptions (e.g. `except ValueError`) and log the error.",
      },
      {
        id: "i-004",
        severity: "low",
        category: "Style",
        message: "Function `process_records` exceeds 80-line complexity limit",
        location: "Lines 134–218",
        suggestion: "Extract helper functions to improve readability and testability.",
      },
    ],
  },
  {
    id: "scan-002",
    name: "api_authentication.ts",
    type: "security",
    milestone: "Phase 1 — Core Pipeline",
    uploadedAt: "2026-03-08 08:50",
    fileSize: "18 KB",
    status: "passed",
    score: 96,
    blocksRelease: false,
    scannedAt: "2026-03-08 08:50:22",
    duration: "2.1s",
    issues: [
      {
        id: "i-005",
        severity: "info",
        category: "Suggestion",
        message: "Consider adding rate-limiting to the `/auth/token` endpoint",
        location: "src/auth/token.ts:34",
        suggestion: "Use express-rate-limit or similar to prevent brute-force attacks.",
      },
    ],
  },
  {
    id: "scan-003",
    name: "technical_spec_v2.md",
    type: "plagiarism",
    milestone: "Phase 2 — Integration",
    uploadedAt: "2026-03-08 07:22",
    fileSize: "8 KB",
    status: "passed",
    score: 94,
    blocksRelease: false,
    scannedAt: "2026-03-08 07:22:55",
    duration: "6.4s",
    issues: [],
  },
  {
    id: "scan-004",
    name: "ml_model_inference.py",
    type: "code",
    milestone: "Phase 2 — Integration",
    uploadedAt: "2026-03-08 11:03",
    fileSize: "127 KB",
    status: "scanning",
    score: null,
    blocksRelease: false,
    issues: [],
  },
  {
    id: "scan-005",
    name: "deployment_report.pdf",
    type: "text",
    milestone: "Phase 3 — QA & Handoff",
    uploadedAt: "2026-03-08 11:30",
    fileSize: "2.1 MB",
    status: "pending",
    score: null,
    blocksRelease: false,
    issues: [],
  },
];

const SCAN_STATS = {
  total: 5,
  passed: 2,
  flagged: 1,
  scanning: 1,
  pending: 1,
  escrowGated: 1,
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function statusColor(s: ScanStatus) {
  return {
    pending:  "text-zinc-400 border-zinc-700 bg-zinc-900",
    scanning: "text-amber-400 border-amber-800 bg-amber-950",
    passed:   "text-green-400 border-green-800 bg-green-950",
    flagged:  "text-red-400 border-red-800 bg-red-950",
    skipped:  "text-zinc-500 border-zinc-800 bg-zinc-900",
  }[s];
}

function statusIcon(s: ScanStatus) {
  if (s === "pending")  return <Clock className="w-3.5 h-3.5" />;
  if (s === "scanning") return <RotateCcw className="w-3.5 h-3.5 animate-spin" />;
  if (s === "passed")   return <CheckCircle className="w-3.5 h-3.5" />;
  if (s === "flagged")  return <XCircle className="w-3.5 h-3.5" />;
  return <Shield className="w-3.5 h-3.5" />;
}

function severityColor(s: SeverityLevel) {
  return {
    critical: "text-red-400 border-red-900 bg-red-950",
    high:     "text-orange-400 border-orange-900 bg-orange-950",
    medium:   "text-amber-400 border-amber-900 bg-amber-950",
    low:      "text-sky-400 border-sky-900 bg-sky-950",
    info:     "text-zinc-400 border-zinc-700 bg-zinc-900",
  }[s];
}

function scanTypeLabel(t: ScanType) {
  return { code: "Code Review", text: "Plagiarism", security: "Security", plagiarism: "Plagiarism" }[t];
}

function scanTypeIcon(t: ScanType) {
  if (t === "code")      return <Code className="w-3.5 h-3.5" />;
  if (t === "security")  return <Lock className="w-3.5 h-3.5" />;
  return <FileSearch className="w-3.5 h-3.5" />;
}

function scoreColor(n: number) {
  if (n >= 90) return "text-green-400";
  if (n >= 70) return "text-amber-400";
  return "text-red-400";
}

// ── Sub-components ────────────────────────────────────────────────────────────
function ScanCard({ scan }: { scan: DeliverableScan }) {
  const [open, setOpen] = useState(scan.status === "flagged");

  return (
    <div className={`border rounded-sm overflow-hidden ${
      scan.blocksRelease ? "border-red-800" : "border-zinc-800"
    }`}>
      {/* Header row */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen(v => !v)}
        onKeyDown={(e) => e.key === "Enter" && setOpen(v => !v)}
        className="w-full flex items-start gap-3 px-3 py-2.5 bg-zinc-900 hover:bg-zinc-800/60 cursor-pointer transition-colors"
      >
        {/* File icon + info */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="text-zinc-500 flex-shrink-0">{scanTypeIcon(scan.type)}</div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm text-zinc-100 truncate">{scan.name}</span>
              {scan.blocksRelease && (
                <span className="font-mono text-[10px] px-1 py-0.5 border border-red-800 text-red-400 rounded-sm flex-shrink-0">
                  BLOCKS RELEASE
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="font-mono text-xs text-zinc-500">{scan.milestone}</span>
              <span className="text-zinc-700">·</span>
              <span className="font-mono text-xs text-zinc-500">{scan.fileSize}</span>
              <span className="text-zinc-700">·</span>
              <span className="font-mono text-xs text-zinc-500">{scanTypeLabel(scan.type)}</span>
              {scan.duration && (
                <>
                  <span className="text-zinc-700">·</span>
                  <span className="font-mono text-xs text-zinc-600">{scan.duration}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Score + status */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {scan.score !== null && (
            <span className={`font-mono text-sm font-medium ${scoreColor(scan.score)}`}>
              {scan.score}
            </span>
          )}
          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 border rounded-sm font-mono text-xs ${statusColor(scan.status)}`}>
            {statusIcon(scan.status)}
            {scan.status.toUpperCase()}
          </span>
          {open ? <ChevronUp className="w-3.5 h-3.5 text-zinc-500" /> : <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />}
        </div>
      </div>

      {/* Expanded detail */}
      {open && (
        <div className="border-t border-zinc-800">
          {scan.status === "scanning" && (
            <div className="px-3 py-4 text-center">
              <RotateCcw className="w-5 h-5 text-amber-400 animate-spin mx-auto mb-2" />
              <p className="font-mono text-sm text-zinc-400">Scanning in progress…</p>
              <p className="font-mono text-xs text-zinc-600 mt-1">AI agent is analysing your deliverable</p>
            </div>
          )}

          {scan.status === "pending" && (
            <div className="px-3 py-4 text-center">
              <Clock className="w-5 h-5 text-zinc-500 mx-auto mb-2" />
              <p className="font-mono text-sm text-zinc-400">Queued for scanning</p>
              <p className="font-mono text-xs text-zinc-600 mt-1">Uploaded {scan.uploadedAt}</p>
              <button className="mt-3 h-8 px-3 border border-zinc-700 rounded-sm font-mono text-xs text-zinc-300 hover:border-zinc-500 transition-colors flex items-center gap-1.5 mx-auto">
                <Play className="w-3 h-3" /> Run Scan Now
              </button>
            </div>
          )}

          {(scan.status === "passed" || scan.status === "flagged") && (
            <div className="divide-y divide-zinc-800">
              {/* Scan summary row */}
              <div className="px-3 py-2 flex items-center justify-between bg-zinc-950">
                <div className="flex items-center gap-3">
                  {scan.score !== null && (
                    <div>
                      <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">Quality Score</p>
                      <p className={`font-mono text-xl font-medium ${scoreColor(scan.score)}`}>{scan.score}<span className="text-zinc-600 text-sm">/100</span></p>
                    </div>
                  )}
                  <div>
                    <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">Issues</p>
                    <p className="font-mono text-xl font-medium text-zinc-100">{scan.issues.length}</p>
                  </div>
                  <div>
                    <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">Scanned</p>
                    <p className="font-mono text-xs text-zinc-400 mt-0.5">{scan.scannedAt}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className="h-7 px-2 border border-zinc-700 rounded-sm font-mono text-[11px] text-zinc-400 hover:border-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1">
                    <Eye className="w-3 h-3" /> View Full Report
                  </button>
                  <button className="h-7 px-2 border border-zinc-700 rounded-sm font-mono text-[11px] text-zinc-400 hover:border-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1">
                    <RotateCcw className="w-3 h-3" /> Rescan
                  </button>
                </div>
              </div>

              {/* Issues list */}
              {scan.issues.length === 0 ? (
                <div className="px-3 py-3 flex items-center gap-2 text-green-400">
                  <CheckCircle className="w-4 h-4" />
                  <span className="font-mono text-sm">No issues detected — deliverable cleared for release</span>
                </div>
              ) : (
                scan.issues.map((issue) => (
                  <IssueRow key={issue.id} issue={issue} />
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function IssueRow({ issue }: { issue: ScanIssue }) {
  const [expanded, setExpanded] = useState(issue.severity === "critical" || issue.severity === "high");

  return (
    <div className="px-3 py-2.5">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded(v => !v)}
        onKeyDown={(e) => e.key === "Enter" && setExpanded(v => !v)}
        className="flex items-start gap-2.5 cursor-pointer group"
      >
        <span className={`inline-flex items-center px-1 py-0.5 border rounded-sm font-mono text-[10px] flex-shrink-0 mt-0.5 ${severityColor(issue.severity)}`}>
          {issue.severity.toUpperCase()}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="font-mono text-xs text-zinc-300">{issue.category}: </span>
              <span className="font-mono text-xs text-zinc-400">{issue.message}</span>
            </div>
            {expanded ? (
              <ChevronUp className="w-3 h-3 text-zinc-600 flex-shrink-0 mt-0.5" />
            ) : (
              <ChevronRight className="w-3 h-3 text-zinc-600 flex-shrink-0 mt-0.5" />
            )}
          </div>
          <p className="font-mono text-[11px] text-zinc-600 mt-0.5">{issue.location}</p>
        </div>
      </div>

      {expanded && (
        <div className="mt-2 ml-16 border border-zinc-800 rounded-sm bg-zinc-950 p-2.5">
          <div className="flex items-start gap-1.5">
            <Info className="w-3 h-3 text-sky-400 flex-shrink-0 mt-0.5" />
            <p className="font-mono text-xs text-zinc-400">{issue.suggestion}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function StatPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="border border-zinc-800 rounded-sm px-3 py-2 text-center">
      <p className={`font-mono text-lg font-medium ${color}`}>{value}</p>
      <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest mt-0.5">{label}</p>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function QualityGatePage() {
  const [milestoneFilter, setMilestoneFilter] = useState("all");
  const [statusFilter, setStatusFilter]       = useState("all");

  const milestones = ["all", "Phase 1 — Core Pipeline", "Phase 2 — Integration", "Phase 3 — QA & Handoff"];
  const statusOpts = ["all", "pending", "scanning", "passed", "flagged"];

  const filtered = DEMO_SCANS.filter(s => {
    const mOk = milestoneFilter === "all" || s.milestone === milestoneFilter;
    const sOk = statusFilter    === "all" || s.status    === statusFilter;
    return mOk && sOk;
  });

  return (
    <div className="flex min-h-screen bg-zinc-950 text-zinc-100">
      {/* ── Sidebar (desktop) ─────────────────────────────────────────── */}
      <aside className="hidden sm:flex flex-col w-56 border-r border-zinc-800 px-2 py-4 gap-1 flex-shrink-0">
        {/* Main nav */}
        {MAIN_NAV.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href}
            className="flex items-center gap-2.5 px-2 py-1.5 rounded-sm text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 font-mono text-xs transition-colors">
            <Icon className="w-3.5 h-3.5" />{label}
          </Link>
        ))}

        {/* AI Tools section */}
        <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest px-2 mt-4 mb-1">AI Tools</p>
        {AI_TOOLS_NAV.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href}
            className="flex items-center gap-2.5 px-2 py-1 rounded-sm text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 font-mono text-xs transition-colors">
            <Icon className="w-3 h-3" />{label}
          </Link>
        ))}

        {/* Payments section */}
        <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest px-2 mt-4 mb-1">Payments</p>
        {PAYMENTS_NAV.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href}
            className="flex items-center gap-2.5 px-2 py-1 rounded-sm text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 font-mono text-xs transition-colors">
            <Icon className="w-3 h-3" />{label}
          </Link>
        ))}

        {/* Workspace section */}
        <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest px-2 mt-4 mb-1">Workspace</p>
        {WORKSPACE_NAV.map(({ href, label, icon: Icon, active }) => (
          <Link key={href} href={href}
            className={`flex items-center gap-2.5 px-2 py-1 rounded-sm font-mono text-xs transition-colors ${
              active
                ? "text-amber-400 bg-amber-950/40 border border-amber-900/50"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
            }`}>
            <Icon className="w-3 h-3" />{label}
          </Link>
        ))}

        {/* Profile */}
        <div className="mt-auto">
          <Link href="/profile"
            className="flex items-center gap-2.5 px-2 py-1.5 rounded-sm text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 font-mono text-xs transition-colors">
            <User className="w-3.5 h-3.5" />Profile
          </Link>
        </div>
      </aside>

      {/* ── Main content ──────────────────────────────────────────────── */}
      <main className="flex-1 min-w-0 px-4 sm:px-6 py-6 pb-24 sm:pb-6">
        {/* Page header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck className="w-4 h-4 text-amber-400" />
              <h1 className="font-mono text-base font-medium text-zinc-100">Quality Gate</h1>
            </div>
            <p className="font-mono text-xs text-zinc-500">
              AI agent scans deliverables for bugs &amp; plagiarism before client review
            </p>
          </div>
          <button className="h-8 px-3 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-mono text-xs rounded-sm transition-colors flex items-center gap-1.5">
            <Zap className="w-3 h-3" /> Queue Scan
          </button>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-5 gap-2 mb-5">
          <StatPill label="Total"    value={SCAN_STATS.total}      color="text-zinc-100" />
          <StatPill label="Passed"   value={SCAN_STATS.passed}     color="text-green-400" />
          <StatPill label="Flagged"  value={SCAN_STATS.flagged}    color="text-red-400" />
          <StatPill label="Scanning" value={SCAN_STATS.scanning}   color="text-amber-400" />
          <StatPill label="Pending"  value={SCAN_STATS.pending}    color="text-zinc-500" />
        </div>

        {/* Escrow gate callout */}
        {SCAN_STATS.escrowGated > 0 && (
          <div className="border border-red-800 bg-red-950/30 rounded-sm px-3 py-2.5 mb-5 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-mono text-sm text-red-300 font-medium">
                {SCAN_STATS.escrowGated} milestone{SCAN_STATS.escrowGated > 1 ? "s" : ""} blocked from escrow release
              </p>
              <p className="font-mono text-xs text-red-400/70 mt-0.5">
                Resolve all CRITICAL and HIGH issues before escrow can be approved for Phase 1 — Core Pipeline.
              </p>
            </div>
          </div>
        )}

        {/* How it works callout */}
        <div className="border border-zinc-800 rounded-sm px-3 py-2.5 mb-5 flex items-start gap-2.5 bg-zinc-900/40">
          <Shield className="w-4 h-4 text-sky-400 flex-shrink-0 mt-0.5" />
          <div className="font-mono text-xs text-zinc-400 space-y-0.5">
            <p><span className="text-zinc-200">How it works:</span> Every deliverable is automatically scanned by an AI agent before the client can review it.</p>
            <p>Code files → bug &amp; security analysis · Text/docs → plagiarism detection · CRITICAL issues block escrow release.</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-4">
          {/* Milestone filter */}
          <div className="flex items-center gap-1 flex-wrap">
            {milestones.map(m => (
              <button key={m}
                onClick={() => setMilestoneFilter(m)}
                className={`h-7 px-2.5 rounded-sm font-mono text-xs border transition-colors ${
                  milestoneFilter === m
                    ? "bg-amber-500 border-amber-500 text-zinc-950"
                    : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
                }`}
              >
                {m === "all" ? "All Milestones" : m.split(" — ")[1] ?? m}
              </button>
            ))}
          </div>

          {/* Status filter */}
          <div className="flex items-center gap-1 ml-auto flex-wrap">
            {statusOpts.map(s => (
              <button key={s}
                onClick={() => setStatusFilter(s)}
                className={`h-7 px-2 rounded-sm font-mono text-[11px] border transition-colors capitalize ${
                  statusFilter === s
                    ? "bg-zinc-700 border-zinc-600 text-zinc-100"
                    : "border-zinc-800 text-zinc-500 hover:border-zinc-600"
                }`}
              >
                {s === "all" ? "All Status" : s}
              </button>
            ))}
          </div>
        </div>

        {/* Scan cards */}
        <div className="space-y-2">
          {filtered.length === 0 ? (
            <div className="border border-zinc-800 rounded-sm px-4 py-8 text-center">
              <FileSearch className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
              <p className="font-mono text-sm text-zinc-500">No deliverables match this filter</p>
            </div>
          ) : (
            filtered.map(scan => <ScanCard key={scan.id} scan={scan} />)
          )}
        </div>

        {/* Scan engine info */}
        <div className="mt-6 border border-zinc-800 rounded-sm p-3">
          <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest mb-2">Scan Engine</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Code Analysis",    desc: "AST-based bug + security scan",        icon: Bug },
              { label: "Plagiarism Check", desc: "50B+ document corpus comparison",       icon: Copy },
              { label: "Secret Detection", desc: "API keys, tokens, credentials",         icon: Lock },
              { label: "Complexity Score", desc: "Cyclomatic + maintainability index",    icon: Code },
            ].map(({ label, desc, icon: Icon }) => (
              <div key={label} className="flex items-start gap-2">
                <Icon className="w-3.5 h-3.5 text-zinc-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-mono text-xs text-zinc-300">{label}</p>
                  <p className="font-mono text-[11px] text-zinc-600 mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* ── Mobile bottom nav ─────────────────────────────────────────── */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 h-16 bg-zinc-950 border-t border-zinc-800 flex items-center justify-around px-2 z-50">
        {[
          { href: "/dashboard",   icon: LayoutDashboard, label: "Dash" },
          { href: "/marketplace", icon: Store,            label: "Market" },
          { href: "/matching",    icon: Shuffle,          label: "Matching" },
          { href: "/profile",     icon: User,             label: "Profile" },
        ].map(({ href, icon: Icon, label }) => (
          <Link key={href} href={href}
            className="flex flex-col items-center gap-1 text-zinc-500 hover:text-zinc-300 transition-colors min-w-[56px] py-2">
            <Icon className="w-5 h-5" />
            <span className="font-mono text-[10px]">{label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
