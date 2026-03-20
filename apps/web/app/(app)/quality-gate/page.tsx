"use client";

import { useState, useEffect, useRef, useMemo, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  LayoutDashboard, Store, Trophy, User, ShieldCheck,
  Brain, ScanSearch, GitMerge, Target, TrendingUp, Shuffle,
  Wallet, Receipt, FileText, Calculator,
  BookOpen, Video, MessageSquare, Layers, ChevronDown, ChevronUp,
  Shield, AlertTriangle, CheckCircle, Clock, XCircle,
  Code, FileSearch, Lock, Zap, RotateCcw, Play, Eye,
  Bug, Copy, ChevronRight, Info, Upload,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
type ScanStatus    = "pending" | "scanning" | "passed" | "flagged" | "skipped";
type SeverityLevel = "critical" | "high" | "medium" | "low" | "info";
type ScanType      = "code" | "security" | "plagiarism" | "text";

interface ScanIssue {
  id:         string;
  severity:   SeverityLevel;
  category:   string;
  message:    string;
  location:   string;
  suggestion: string;
}

interface DeliverableScan {
  id:            string;
  deployment_id: string | null;
  name:          string;
  type:          ScanType;
  milestone:     string;
  uploadedAt:    string;
  fileSize:      string;
  status:        ScanStatus;
  score:         number | null;
  blocksRelease: boolean;
  issues:        ScanIssue[];
  scannedAt?:    string;
  duration?:     string;
}

// ── API response → DeliverableScan ────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1_048_576)   return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

function mapApiScan(s: Record<string, unknown>): DeliverableScan {
  const durationMs = s.duration_ms as number | null;
  return {
    id:            s.id as string,
    deployment_id: s.deployment_id as string | null,
    name:          s.file_name as string,
    type:          s.scan_type as ScanType,
    milestone:     s.milestone as string,
    uploadedAt:    s.created_at ? new Date(s.created_at as string).toLocaleString() : "",
    fileSize:      formatBytes(s.file_size_bytes as number),
    status:        s.status as ScanStatus,
    score:         s.score as number | null,
    blocksRelease: s.blocks_release as boolean,
    issues:        (s.issues as ScanIssue[]) ?? [],
    scannedAt:     s.scanned_at ? new Date(s.scanned_at as string).toLocaleString() : undefined,
    duration:      durationMs ? `${(durationMs / 1000).toFixed(1)}s` : undefined,
  };
}

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
  return { code: "Code Review", text: "Text Scan", security: "Security", plagiarism: "Plagiarism" }[t];
}

function scanTypeIcon(t: ScanType) {
  if (t === "code")     return <Code className="w-3.5 h-3.5" />;
  if (t === "security") return <Lock className="w-3.5 h-3.5" />;
  return <FileSearch className="w-3.5 h-3.5" />;
}

function scoreColor(n: number) {
  if (n >= 90) return "text-green-400";
  if (n >= 70) return "text-amber-400";
  return "text-red-400";
}

// ── IssueRow ──────────────────────────────────────────────────────────────────

function IssueRow({ issue }: { issue: ScanIssue }) {
  const [expanded, setExpanded] = useState(
    issue.severity === "critical" || issue.severity === "high"
  );

  return (
    <div className="px-3 py-2.5">
      <div
        role="button" tabIndex={0}
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
            {expanded
              ? <ChevronUp className="w-3 h-3 text-zinc-600 flex-shrink-0 mt-0.5" />
              : <ChevronRight className="w-3 h-3 text-zinc-600 flex-shrink-0 mt-0.5" />}
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

// ── ScanCard ──────────────────────────────────────────────────────────────────

function ScanCard({ scan }: { scan: DeliverableScan }) {
  const [open, setOpen] = useState(scan.status === "flagged");

  return (
    <div className={`border rounded-sm overflow-hidden ${
      scan.blocksRelease ? "border-red-800" : "border-zinc-800"
    }`}>
      <div
        role="button" tabIndex={0}
        onClick={() => setOpen(v => !v)}
        onKeyDown={(e) => e.key === "Enter" && setOpen(v => !v)}
        className="w-full flex items-start gap-3 px-3 py-2.5 bg-zinc-900 hover:bg-zinc-800/60 cursor-pointer transition-colors"
      >
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
              {scan.milestone && <span className="font-mono text-xs text-zinc-500">{scan.milestone}</span>}
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
          {open
            ? <ChevronUp className="w-3.5 h-3.5 text-zinc-500" />
            : <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />}
        </div>
      </div>

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
            </div>
          )}
          {(scan.status === "passed" || scan.status === "flagged") && (
            <div className="divide-y divide-zinc-800">
              <div className="px-3 py-2 flex items-center justify-between bg-zinc-950">
                <div className="flex items-center gap-3">
                  {scan.score !== null && (
                    <div>
                      <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">Quality Score</p>
                      <p className={`font-mono text-xl font-medium ${scoreColor(scan.score)}`}>
                        {scan.score}<span className="text-zinc-600 text-sm">/100</span>
                      </p>
                    </div>
                  )}
                  <div>
                    <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">Issues</p>
                    <p className="font-mono text-xl font-medium text-zinc-100">{scan.issues.length}</p>
                  </div>
                  {scan.scannedAt && (
                    <div>
                      <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">Scanned</p>
                      <p className="font-mono text-xs text-zinc-400 mt-0.5">{scan.scannedAt}</p>
                    </div>
                  )}
                </div>
              </div>
              {scan.issues.length === 0 ? (
                <div className="px-3 py-3 flex items-center gap-2 text-green-400">
                  <CheckCircle className="w-4 h-4" />
                  <span className="font-mono text-sm">No issues detected — deliverable cleared for release</span>
                </div>
              ) : (
                scan.issues.map((issue) => <IssueRow key={issue.id} issue={issue} />)
              )}
            </div>
          )}
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

// ── Page inner (needs Suspense for useSearchParams) ────────────────────────────

function QualityGatePageInner() {
  const { data: session } = useSession();
  const searchParams  = useSearchParams();
  const deploymentId  = searchParams.get("deployment_id");

  const [scans,      setScans]      = useState<DeliverableScan[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [uploading,  setUploading]  = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [milestoneFilter, setMilestoneFilter] = useState("all");
  const [statusFilter,    setStatusFilter]    = useState("all");

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchScans = useCallback(async () => {
    const qs = deploymentId ? `?deployment_id=${deploymentId}` : "";
    const res = await fetch(`/api/quality-gate/scans${qs}`).catch(() => null);
    if (res?.ok) {
      const data = await res.json() as { scans: Record<string, unknown>[] };
      setScans((data.scans ?? []).map(mapApiScan));
    }
    setLoading(false);
  }, [deploymentId]);

  useEffect(() => { fetchScans(); }, [fetchScans]);

  // Poll every 3s while any scan is in progress
  useEffect(() => {
    const hasActive = scans.some(s => s.status === "scanning" || s.status === "pending");
    if (!hasActive) return;
    const timer = setInterval(fetchScans, 3000);
    return () => clearInterval(timer);
  }, [scans, fetchScans]);

  const scanStats = useMemo(() => ({
    total:       scans.length,
    passed:      scans.filter(s => s.status === "passed").length,
    flagged:     scans.filter(s => s.status === "flagged").length,
    scanning:    scans.filter(s => s.status === "scanning").length,
    pending:     scans.filter(s => s.status === "pending").length,
    escrowGated: scans.filter(s => s.blocksRelease).length,
  }), [scans]);

  const milestones = useMemo(() => {
    const unique = new Set(scans.map(s => s.milestone).filter(Boolean));
    return ["all", ...Array.from(unique)];
  }, [scans]);

  const statusOpts = ["all", "pending", "scanning", "passed", "flagged"];

  const filtered = scans.filter(s => {
    const mOk = milestoneFilter === "all" || s.milestone === milestoneFilter;
    const sOk = statusFilter    === "all" || s.status    === statusFilter;
    return mOk && sOk;
  });

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);

    const form = new FormData();
    form.append("file", file);
    if (deploymentId) form.append("deployment_id", deploymentId);
    form.append("milestone", milestoneFilter !== "all" ? milestoneFilter : "");

    const res = await fetch("/api/quality-gate/upload", {
      method: "POST",
      body:   form,
    }).catch(() => null);

    if (!res?.ok) {
      const err = await res?.json().catch(() => null) as { error?: string } | null;
      setUploadError(err?.error ?? "Upload failed");
    } else {
      await fetchScans();
    }
    setUploading(false);
    e.target.value = "";
  }

  return (
      <main className="flex-1 min-w-0 px-4 sm:px-6 py-6 pb-24 sm:pb-6">
        {/* Header */}
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
          <div>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileChange}
              accept=".py,.rs,.ts,.js,.tsx,.jsx,.go,.java,.rb,.php,.cpp,.c,.cs,.env,.yml,.yaml,.toml,.json,.sh,.md,.txt"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || !session?.user}
              className="h-8 px-3 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-950 font-mono text-xs rounded-sm transition-colors flex items-center gap-1.5"
            >
              {uploading
                ? <><RotateCcw className="w-3 h-3 animate-spin" /> Scanning…</>
                : <><Upload className="w-3 h-3" /> Queue Scan</>}
            </button>
          </div>
        </div>

        {uploadError && (
          <div className="mb-4 border border-red-800 bg-red-950/30 rounded-sm px-3 py-2 font-mono text-xs text-red-400">
            {uploadError}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-5 gap-2 mb-5">
          <StatPill label="Total"    value={scanStats.total}    color="text-zinc-100"  />
          <StatPill label="Passed"   value={scanStats.passed}   color="text-green-400" />
          <StatPill label="Flagged"  value={scanStats.flagged}  color="text-red-400"   />
          <StatPill label="Scanning" value={scanStats.scanning} color="text-amber-400" />
          <StatPill label="Pending"  value={scanStats.pending}  color="text-zinc-500"  />
        </div>

        {/* Escrow gate warning */}
        {scanStats.escrowGated > 0 && (
          <div className="border border-red-800 bg-red-950/30 rounded-sm px-3 py-2.5 mb-5 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-mono text-sm text-red-300 font-medium">
                {scanStats.escrowGated} deliverable{scanStats.escrowGated > 1 ? "s" : ""} blocking escrow release
              </p>
              <p className="font-mono text-xs text-red-400/70 mt-0.5">
                Resolve all CRITICAL and HIGH issues before escrow can be approved.
              </p>
            </div>
          </div>
        )}

        {/* How it works */}
        <div className="border border-zinc-800 rounded-sm px-3 py-2.5 mb-5 flex items-start gap-2.5 bg-zinc-900/40">
          <Shield className="w-4 h-4 text-sky-400 flex-shrink-0 mt-0.5" />
          <div className="font-mono text-xs text-zinc-400 space-y-0.5">
            <p><span className="text-zinc-200">How it works:</span> Upload any deliverable — Claude scans it instantly for bugs, security issues, and plagiarism.</p>
            <p>Code files → bug &amp; security analysis · Text/docs → plagiarism detection · CRITICAL issues block escrow release.</p>
          </div>
        </div>

        {/* Filters */}
        {scans.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
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
                  {m === "all" ? "All Milestones" : m}
                </button>
              ))}
            </div>
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
        )}

        {/* Scan cards */}
        <div className="space-y-2">
          {loading ? (
            <div className="border border-zinc-800 rounded-sm p-6 flex items-center justify-center">
              <span className="font-mono text-[10px] text-zinc-600">Loading scans…</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="border border-dashed border-zinc-800 rounded-sm px-4 py-8 text-center">
              <FileSearch className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
              <p className="font-mono text-sm text-zinc-500">
                {scans.length === 0 ? "No deliverables scanned yet" : "No deliverables match this filter"}
              </p>
              {scans.length === 0 && (
                <p className="font-mono text-[10px] text-zinc-700 mt-1">
                  Click <span className="text-amber-500">Queue Scan</span> to upload a file for AI analysis
                </p>
              )}
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
              { label: "Code Analysis",    desc: "AST-based bug + security scan",     icon: Bug      },
              { label: "Plagiarism Check", desc: "AI-powered originality analysis",    icon: Copy     },
              { label: "Secret Detection", desc: "API keys, tokens, credentials",      icon: Lock     },
              { label: "Complexity Score", desc: "Cyclomatic + maintainability index", icon: Code     },
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
      );
}

export default function QualityGatePage() {
  return (
    <Suspense>
      <QualityGatePageInner />
    </Suspense>
  );
}
