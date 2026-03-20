"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  LayoutDashboard, Store, Trophy, User, Shuffle,
  Brain, ScanSearch, GitMerge, Target, TrendingUp,
  Lock, Wallet, Receipt, FileText, Calculator, Link2,
  BookOpen, Video, MessageSquare, Layers, ShieldCheck,
  Scale, Landmark, Eye,
  Download, Share2, CheckCircle, Star, Award,
  ExternalLink, Copy, Check, QrCode, Fingerprint,
  Shield, Clock, Briefcase, Globe, Loader2, AlertCircle,
  RefreshCw,
} from "lucide-react";
import { exportVc, type VcExportResponse } from "@/lib/api";
import { AppSidebar, AppMobileNav } from "@/components/AppSidebar";


// ── Demo work records (individual project data not yet in API) ─────────────────
const DEMO_WORK_RECORDS = [
  {
    id: "wr-001", title: "DataSync Pipeline Automation",
    client: "Acme Corp", duration: "6 weeks", value: "$5,000",
    skills: ["Rust", "Kafka", "PostgreSQL"], rating: 5.0,
    review: "Delivered ahead of schedule. Artifact hash verified on-chain. Exceptional code quality.",
    completedAt: "2026-02-28", vcHash: "0xa4f9…9a2c",
  },
  {
    id: "wr-002", title: "ML Inference Optimisation",
    client: "NeuralCo", duration: "4 weeks", value: "$3,200",
    skills: ["Python", "ONNX", "CUDA"], rating: 4.8,
    review: "Reduced p99 latency by 43%. Great communication throughout.",
    completedAt: "2026-01-15", vcHash: "0xb1e7…7c3a",
  },
  {
    id: "wr-003", title: "K8s Autoscaler Policy",
    client: "DevOps Inc", duration: "2 weeks", value: "$950",
    skills: ["Kubernetes", "Go", "Prometheus"], rating: 5.0,
    review: "Exactly what we needed. Clean IaC, well documented.",
    completedAt: "2026-01-28", vcHash: "0xd9c2…1a9e",
  },
  {
    id: "wr-004", title: "Wasm Agent Integration",
    client: "StartupX", duration: "3 weeks", value: "$2,100",
    skills: ["Rust", "Wasmtime", "Axum"], rating: 4.9,
    review: "Deep expertise in the Wasm ecosystem. Delivered a rock-solid sandbox.",
    completedAt: "2025-12-10",
  },
];

const EXPORT_TARGETS = [
  { id: "vc-jwt",   name: "W3C VC (JSON)",   logo: "🔐", supported: true,  standard: "W3C VC 2.0",    description: "Portable JSON-LD credential issued by AiStaffApp. Verify anywhere." },
  { id: "linkedin", name: "LinkedIn",         logo: "💼", supported: false, standard: "OpenBadge 3.0", description: "Import as a LinkedIn Certification badge to your public profile." },
  { id: "github",   name: "GitHub README",    logo: "⚡", supported: false, standard: "SVG badge",     description: "SVG badge with live reputation score for your README or portfolio." },
  { id: "toptal",   name: "Toptal",           logo: "🌐", supported: false, standard: "Pending",       description: "Cross-platform export in progress. Join the waitlist." },
  { id: "upwork",   name: "Upwork",           logo: "🟢", supported: false, standard: "Pending",       description: "Upwork import API not yet available. Export as PDF for manual upload." },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function StarRating({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1,2,3,4,5].map(i => (
        <Star key={i} className={`w-3 h-3 ${i <= Math.round(score) ? "text-amber-400 fill-amber-400" : "text-zinc-700"}`} />
      ))}
      <span className="font-mono text-xs text-zinc-300 ml-1">{score.toFixed(1)}</span>
    </div>
  );
}

function scoreColor(s: number): string {
  if (s >= 80) return "text-green-400";
  if (s >= 60) return "text-amber-400";
  return "text-zinc-400";
}

function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ReputationExportPage() {
  const { data: session } = useSession();
  const profileId = (session?.user as { profileId?: string })?.profileId ?? "";

  const [tab,       setTab]       = useState<"profile" | "export">("profile");
  const [vc,        setVc]        = useState<VcExportResponse | null>(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState("");
  const [copied,    setCopied]    = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // ── Load VC on mount (or when profileId resolves) ─────────────────────────
  useEffect(() => {
    if (!profileId) return;
    setLoading(true);
    setError("");
    exportVc(profileId)
      .then(setVc)
      .catch(e => setError(e instanceof Error ? e.message : "Failed to load reputation data"))
      .finally(() => setLoading(false));
  }, [profileId]);

  const cs   = vc?.credentialSubject as Record<string, unknown> | undefined;
  const score      = typeof cs?.reputationScore     === "number" ? cs.reputationScore     : null;
  const deployments = typeof cs?.deploymentsCompleted === "number" ? cs.deploymentsCompleted : null;
  const tier       = typeof cs?.identityTier         === "string" ? cs.identityTier         : null;
  const issuedAt   = vc?.issuanceDate ? vc.issuanceDate.slice(0, 10) : null;
  const vcId       = vc?.id ?? null;

  function copyText(text: string, key: string) {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  }

  async function handleExportVc() {
    if (!profileId) return;
    setExporting(true);
    try {
      const fresh = await exportVc(profileId);
      setVc(fresh);
      downloadJson(fresh, `aistaff-reputation-vc-${profileId.slice(0, 8)}.json`);
    } catch { /* ignore */ }
    setExporting(false);
  }

  const profileUrl = profileId
    ? `https://rep.aistaffglobal.com/p/${profileId.slice(0, 8)}`
    : "https://rep.aistaffglobal.com/p/—";

  return (
    <div className="flex min-h-screen bg-zinc-950 text-zinc-100">
      <AppSidebar />

      {/* Main */}
      <main className="flex-1 min-w-0 px-4 sm:px-6 py-6 pb-24 sm:pb-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link2 className="w-4 h-4 text-amber-400" />
              <h1 className="font-mono text-base font-medium text-zinc-100">Reputation Portability</h1>
            </div>
            <p className="font-mono text-xs text-zinc-500">Own your ratings and work history — verifiable and exportable across platforms</p>
          </div>
          <button
            onClick={() => { if (profileId) { setLoading(true); exportVc(profileId).then(setVc).catch(() => {}).finally(() => setLoading(false)); } }}
            disabled={loading || !profileId}
            className="h-8 px-3 border border-zinc-700 rounded-sm font-mono text-xs text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 disabled:opacity-40 transition-colors flex items-center gap-1.5"
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            Refresh
          </button>
        </div>

        {/* Ownership callout */}
        <div className="border border-green-900/50 bg-green-950/20 rounded-sm px-3 py-2.5 mb-5 flex items-start gap-2.5">
          <Shield className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-mono text-xs text-green-300 font-medium mb-0.5">You own this data</p>
            <p className="font-mono text-xs text-zinc-400">Your reputation score is cryptographically computed from completed deployments, checklist pass rate, and verified identity — issued as a W3C Verifiable Credential.</p>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="border border-red-900/50 bg-red-950/20 rounded-sm px-3 py-2.5 mb-5 flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
            <p className="font-mono text-xs text-red-400">{error}</p>
          </div>
        )}

        {/* Stats row — live from VC */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
          {[
            {
              label: "Reputation Score",
              value: loading ? "—" : score !== null ? score.toFixed(1) : "—",
              sub:   "/ 100 · W3C VC",
              color: score !== null ? scoreColor(score) : "text-zinc-400",
            },
            {
              label: "Deployments",
              value: loading ? "—" : deployments !== null ? String(deployments) : "—",
              sub:   "completed on platform",
              color: "text-amber-400",
            },
            {
              label: "Identity Tier",
              value: loading ? "—" : tier ?? "—",
              sub:   "ZK biometric · trust score",
              color: tier === "BiometricVerified" ? "text-green-400" : tier === "SocialVerified" ? "text-sky-400" : "text-zinc-400",
            },
            {
              label: "VC Issued",
              value: loading ? "—" : issuedAt ?? "—",
              sub:   "last credential issuance",
              color: "text-zinc-300",
            },
          ].map(({ label, value, sub, color }) => (
            <div key={label} className="border border-zinc-800 rounded-sm p-2.5 bg-zinc-900/40">
              <p className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest">{label}</p>
              {loading
                ? <div className="h-7 mt-1 bg-zinc-800 rounded-sm animate-pulse" />
                : <p className={`font-mono text-lg font-medium mt-0.5 tabular-nums ${color}`}>{value}</p>
              }
              <p className="font-mono text-[10px] text-zinc-600 mt-0.5">{sub}</p>
            </div>
          ))}
        </div>

        {/* Score breakdown */}
        {score !== null && (
          <div className="border border-zinc-800 rounded-sm px-3 py-2.5 mb-5 bg-zinc-900/30">
            <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest mb-2">Score Formula</p>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs text-zinc-400">40% checklist pass rate</span>
              <span className="font-mono text-xs text-zinc-700">+</span>
              <span className="font-mono text-xs text-zinc-400">30% drift-free rate</span>
              <span className="font-mono text-xs text-zinc-700">+</span>
              <span className="font-mono text-xs text-zinc-400">30% identity trust score</span>
              <span className="font-mono text-xs text-zinc-700">=</span>
              <span className={`font-mono text-sm font-medium ${scoreColor(score)}`}>{score.toFixed(1)} / 100</span>
            </div>
          </div>
        )}

        {/* Public URL strip */}
        <div className="border border-zinc-800 rounded-sm px-3 py-2 mb-5 flex items-center gap-2 bg-zinc-900/40">
          <Globe className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
          <span className="font-mono text-xs text-zinc-400 flex-1 truncate">{profileUrl}</span>
          <button
            onClick={() => copyText(profileUrl, "url")}
            className="h-6 px-2 border border-zinc-700 rounded-sm font-mono text-[11px] text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors flex items-center gap-1 flex-shrink-0"
          >
            {copied === "url" ? <><Check className="w-2.5 h-2.5" /> Copied</> : <><Copy className="w-2.5 h-2.5" /> Copy</>}
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-zinc-800 mb-4">
          {[
            { key: "profile" as const, label: `Work History (${DEMO_WORK_RECORDS.length} sample)` },
            { key: "export"  as const, label: "Export & Share" },
          ].map(({ key, label }) => (
            <button key={key} onClick={() => setTab(key)}
              className={`px-3 py-2 font-mono text-xs border-b-2 transition-colors ${
                tab === key ? "border-amber-500 text-amber-400" : "border-transparent text-zinc-500 hover:text-zinc-300"
              }`}
            >{label}</button>
          ))}
        </div>

        {/* Work history tab */}
        {tab === "profile" && (
          <div className="space-y-3">
            <div className="border border-amber-900/40 bg-amber-950/10 rounded-sm px-3 py-2 flex items-center gap-2">
              <Award className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
              <p className="font-mono text-[11px] text-amber-300">
                Sample work history shown. Per-project records with client reviews will be live once more deployments complete.
              </p>
            </div>
            {DEMO_WORK_RECORDS.map(wr => (
              <div key={wr.id} className="border border-zinc-800 rounded-sm bg-zinc-900/40 p-3 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm text-zinc-100">{wr.title}</span>
                      {wr.vcHash && (
                        <span className="font-mono text-[10px] px-1 py-0.5 border border-green-900 text-green-400 rounded-sm flex items-center gap-0.5">
                          <Fingerprint className="w-2.5 h-2.5" /> On-chain
                        </span>
                      )}
                    </div>
                    <p className="font-mono text-xs text-zinc-500 mt-0.5">
                      {wr.client} · {wr.duration} · {wr.value} · {wr.completedAt}
                    </p>
                  </div>
                  <div className="flex-shrink-0"><StarRating score={wr.rating} /></div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {wr.skills.map(s => (
                    <span key={s} className="font-mono text-[11px] text-zinc-400 border border-zinc-800 rounded-sm px-1.5 py-0.5 bg-zinc-900">{s}</span>
                  ))}
                </div>
                <p className="font-mono text-xs text-zinc-400 italic border-l-2 border-zinc-700 pl-2.5">
                  &ldquo;{wr.review}&rdquo;
                </p>
                {wr.vcHash && (
                  <div className="flex items-center gap-2 pt-1">
                    <CheckCircle className="w-3 h-3 text-green-400 flex-shrink-0" />
                    <span className="font-mono text-[10px] text-zinc-600">Credential hash: {wr.vcHash}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Export tab */}
        {tab === "export" && (
          <div className="space-y-3">
            {/* W3C VC JSON preview */}
            {vc && (
              <div className="border border-zinc-800 rounded-sm bg-zinc-900/40 p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
                    <CheckCircle className="w-3 h-3 text-green-400" /> Live W3C VC — issued {issuedAt}
                  </p>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => copyText(JSON.stringify(vc, null, 2), "vc")}
                      className="h-6 px-2 border border-zinc-700 rounded-sm font-mono text-[11px] text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors flex items-center gap-1"
                    >
                      {copied === "vc" ? <><Check className="w-2.5 h-2.5" /> Copied</> : <><Copy className="w-2.5 h-2.5" /> Copy JSON</>}
                    </button>
                  </div>
                </div>
                <pre className="font-mono text-[10px] text-zinc-400 bg-zinc-950 border border-zinc-800 rounded-sm p-2.5 overflow-x-auto max-h-48 leading-relaxed">
                  {JSON.stringify(vc, null, 2)}
                </pre>
                {vcId && (
                  <p className="font-mono text-[10px] text-zinc-600 mt-1.5">ID: {vcId}</p>
                )}
              </div>
            )}

            {/* Master export */}
            <div className="border border-amber-900/50 rounded-sm p-3 bg-amber-950/10 flex items-center justify-between gap-3">
              <div>
                <p className="font-mono text-sm text-amber-300 font-medium">Export W3C Verifiable Credential</p>
                <p className="font-mono text-xs text-zinc-500 mt-0.5">
                  Download your live reputation VC as JSON-LD — portable to any W3C-compatible verifier
                </p>
              </div>
              <button
                onClick={handleExportVc}
                disabled={exporting || !profileId}
                className="h-9 px-4 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-mono text-xs rounded-sm transition-colors flex items-center gap-1.5 flex-shrink-0"
              >
                {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                {exporting ? "Generating…" : "Download VC"}
              </button>
            </div>

            {/* Per-target export */}
            {EXPORT_TARGETS.map(target => (
              <div key={target.id} className={`border rounded-sm p-3 flex items-center gap-3 ${
                target.supported ? "border-zinc-800 bg-zinc-900/40" : "border-zinc-800/50 bg-zinc-900/20 opacity-60"
              }`}>
                <span className="text-2xl flex-shrink-0">{target.logo}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm text-zinc-100">{target.name}</span>
                    <span className="font-mono text-[10px] px-1 py-0.5 border border-zinc-700 rounded-sm text-zinc-500">{target.standard}</span>
                    {!target.supported && (
                      <span className="font-mono text-[10px] px-1 py-0.5 border border-zinc-800 rounded-sm text-zinc-600">Coming soon</span>
                    )}
                  </div>
                  <p className="font-mono text-xs text-zinc-500 mt-0.5">{target.description}</p>
                </div>
                {target.supported ? (
                  <button
                    onClick={target.id === "vc-jwt" ? handleExportVc : undefined}
                    disabled={!profileId}
                    className="h-8 px-3 rounded-sm font-mono text-xs border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 disabled:opacity-40 transition-colors flex items-center gap-1.5 flex-shrink-0"
                  >
                    <Share2 className="w-3 h-3" /> Export
                  </button>
                ) : (
                  <button className="h-8 px-3 rounded-sm font-mono text-xs border border-zinc-800 text-zinc-600 flex-shrink-0" disabled>
                    Waitlist
                  </button>
                )}
              </div>
            ))}

            {/* QR placeholder */}
            <div className="border border-zinc-800 rounded-sm p-3 flex items-center gap-3 bg-zinc-900/40">
              <div className="w-16 h-16 border-2 border-zinc-700 rounded-sm flex items-center justify-center flex-shrink-0 bg-zinc-800">
                <QrCode className="w-8 h-8 text-zinc-500" />
              </div>
              <div>
                <p className="font-mono text-sm text-zinc-200">QR Code — Share in person</p>
                <p className="font-mono text-xs text-zinc-500 mt-0.5">Scan to view your verified reputation profile. Works offline with cached VC.</p>
                <p className="font-mono text-[10px] text-zinc-700 mt-1">QR generation — coming soon</p>
              </div>
            </div>

            {/* Verification info */}
            <div className="border border-zinc-800 rounded-sm p-3 bg-zinc-900/30">
              <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest mb-2">How Verification Works</p>
              <div className="space-y-1.5">
                {[
                  { icon: Fingerprint, text: "Score computed from completed deployments, DoD checklist pass rate, and ZK-verified identity tier" },
                  { icon: Shield,      text: "Issued as W3C VC 2.0 JSON-LD — self-contained, platform-independent" },
                  { icon: CheckCircle, text: "Each export re-computes the score from live DB data — always current, never stale" },
                  { icon: Clock,       text: "VC includes issuance date — verifiers can check credential age" },
                ].map(({ icon: Icon, text }) => (
                  <div key={text} className="flex items-start gap-2">
                    <Icon className="w-3.5 h-3.5 text-zinc-600 flex-shrink-0 mt-0.5" />
                    <p className="font-mono text-xs text-zinc-400">{text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      <AppMobileNav />
    </div>
  );
}
