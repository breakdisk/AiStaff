"use client";

import { useState } from "react";
import Link from "next/link";
import {
  LayoutDashboard, Store, Trophy, User, Shuffle,
  Brain, ScanSearch, GitMerge, Target, TrendingUp,
  Lock, Wallet, Receipt, FileText, Calculator, Link2,
  BookOpen, Video, MessageSquare, Layers, ShieldCheck,
  Scale, Landmark, Eye,
  Download, Share2, CheckCircle, Star, Award,
  ExternalLink, Copy, Check, QrCode, Fingerprint,
  Shield, Clock, Briefcase, Code, Globe
} from "lucide-react";

const MAIN_NAV = [
  { href: "/dashboard",   label: "Dashboard",  icon: LayoutDashboard },
  { href: "/marketplace", label: "Marketplace", icon: Store },
  { href: "/matching",    label: "Matching",    icon: Shuffle },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
];
const AI_TOOLS_NAV = [
  { href: "/matching",     label: "AI Matching", icon: Brain },
  { href: "/scoping",      label: "Scoping",      icon: ScanSearch },
  { href: "/outcomes",     label: "Outcomes",     icon: Target },
  { href: "/proposals",    label: "Proposals",    icon: GitMerge },
  { href: "/pricing-tool", label: "Pricing",      icon: TrendingUp },
  { href: "/hybrid-match", label: "Hybrid Match", icon: Shuffle },
];
const PAYMENTS_NAV = [
  { href: "/escrow",             label: "Escrow",     icon: Lock },
  { href: "/payouts",            label: "Payouts",     icon: Wallet },
  { href: "/billing",            label: "Billing",     icon: Receipt },
  { href: "/smart-contracts",    label: "Contracts",   icon: FileText },
  { href: "/outcome-listings",   label: "Outcomes",    icon: Target },
  { href: "/pricing-calculator", label: "Calculator",  icon: Calculator },
];
const WORKSPACE_NAV = [
  { href: "/work-diaries",  label: "Work Diaries",  icon: BookOpen },
  { href: "/async-collab",  label: "Async Collab",  icon: Video },
  { href: "/collab",        label: "Collaboration", icon: MessageSquare },
  { href: "/success-layer", label: "Success Layer", icon: Layers },
  { href: "/quality-gate",  label: "Quality Gate",  icon: ShieldCheck },
];
const LEGAL_NAV = [
  { href: "/legal-toolkit",     label: "Legal Toolkit", icon: Scale },
  { href: "/tax-engine",        label: "Tax Engine",     icon: Landmark },
  { href: "/reputation-export", label: "Reputation",     icon: Link2,  active: true },
  { href: "/transparency",      label: "Transparency",   icon: Eye },
];

// ── Types ─────────────────────────────────────────────────────────────────────
interface WorkRecord {
  id:          string;
  title:       string;
  client:      string;
  duration:    string;
  value:       string;
  skills:      string[];
  rating:      number;
  review:      string;
  completedAt: string;
  vcHash?:     string;   // on-chain credential hash
}

interface ReputationStat {
  label: string;
  value: string;
  sub?:  string;
}

interface ExportTarget {
  id:          string;
  name:        string;
  logo:        string;
  supported:   boolean;
  standard:    string;
  description: string;
}

// ── Demo data ─────────────────────────────────────────────────────────────────
const WORK_RECORDS: WorkRecord[] = [
  {
    id: "wr-001",
    title: "DataSync Pipeline Automation",
    client: "Acme Corp",
    duration: "6 weeks",
    value: "$5,000",
    skills: ["Rust", "Kafka", "PostgreSQL"],
    rating: 5.0,
    review: "Delivered ahead of schedule. Artifact hash verified on-chain. Exceptional code quality.",
    completedAt: "2026-02-28",
    vcHash: "0xa4f9...9a2c",
  },
  {
    id: "wr-002",
    title: "ML Inference Optimisation",
    client: "NeuralCo",
    duration: "4 weeks",
    value: "$3,200",
    skills: ["Python", "ONNX", "CUDA"],
    rating: 4.8,
    review: "Reduced p99 latency by 43%. Great communication throughout.",
    completedAt: "2026-01-15",
    vcHash: "0xb1e7...7c3a",
  },
  {
    id: "wr-003",
    title: "K8s Autoscaler Policy",
    client: "DevOps Inc",
    duration: "2 weeks",
    value: "$950",
    skills: ["Kubernetes", "Go", "Prometheus"],
    rating: 5.0,
    review: "Exactly what we needed. Clean IaC, well documented.",
    completedAt: "2026-01-28",
    vcHash: "0xd9c2...1a9e",
  },
  {
    id: "wr-004",
    title: "Wasm Agent Integration",
    client: "StartupX",
    duration: "3 weeks",
    value: "$2,100",
    skills: ["Rust", "Wasmtime", "Axum"],
    rating: 4.9,
    review: "Deep expertise in the Wasm ecosystem. Delivered a rock-solid sandbox.",
    completedAt: "2025-12-10",
  },
];

const STATS: ReputationStat[] = [
  { label: "Overall Rating",    value: "4.93",  sub: "/ 5.0 across 4 projects" },
  { label: "On-time Delivery",  value: "100%",  sub: "4 / 4 projects" },
  { label: "Verified On-Chain", value: "3 / 4", sub: "W3C VC credentials" },
  { label: "Total Earned",      value: "$11.3k", sub: "verified escrow payouts" },
];

const EXPORT_TARGETS: ExportTarget[] = [
  { id: "vc-jwt",    name: "W3C VC (JWT)",   logo: "🔐", supported: true,  standard: "W3C VC 2.0",    description: "Portable JSON-LD credential signed by AiStaffApp DID. Verify anywhere." },
  { id: "linkedin",  name: "LinkedIn",        logo: "💼", supported: true,  standard: "OpenBadge 3.0", description: "Import as a LinkedIn Certification badge to your public profile." },
  { id: "github",    name: "GitHub README",   logo: "⚡", supported: true,  standard: "SVG badge",     description: "SVG badge with live reputation score for your README or portfolio." },
  { id: "toptal",    name: "Toptal",          logo: "🌐", supported: false, standard: "Pending",       description: "Cross-platform export in progress. Join the waitlist." },
  { id: "upwork",    name: "Upwork",          logo: "🟢", supported: false, standard: "Pending",       description: "Upwork import API not yet available. Export as PDF for manual upload." },
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

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ReputationExportPage() {
  const [tab, setTab]           = useState<"profile" | "export">("profile");
  const [exportedId, setExportedId] = useState<string | null>(null);
  const [copied, setCopied]     = useState(false);
  const profileUrl = "https://rep.aistaffapp.com/p/marcus-t";

  function copyUrl() {
    navigator.clipboard.writeText(profileUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex min-h-screen bg-zinc-950 text-zinc-100">
      {/* Sidebar */}
      <aside className="hidden sm:flex flex-col w-56 border-r border-zinc-800 px-2 py-4 gap-1 flex-shrink-0">
        {MAIN_NAV.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className="flex items-center gap-2.5 px-2 py-1.5 rounded-sm text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 font-mono text-xs transition-colors">
            <Icon className="w-3.5 h-3.5" />{label}
          </Link>
        ))}
        <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest px-2 mt-4 mb-1">AI Tools</p>
        {AI_TOOLS_NAV.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className="flex items-center gap-2.5 px-2 py-1 rounded-sm text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 font-mono text-xs transition-colors">
            <Icon className="w-3 h-3" />{label}
          </Link>
        ))}
        <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest px-2 mt-4 mb-1">Payments</p>
        {PAYMENTS_NAV.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className="flex items-center gap-2.5 px-2 py-1 rounded-sm text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 font-mono text-xs transition-colors">
            <Icon className="w-3 h-3" />{label}
          </Link>
        ))}
        <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest px-2 mt-4 mb-1">Workspace</p>
        {WORKSPACE_NAV.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className="flex items-center gap-2.5 px-2 py-1 rounded-sm text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 font-mono text-xs transition-colors">
            <Icon className="w-3 h-3" />{label}
          </Link>
        ))}
        <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest px-2 mt-4 mb-1">Legal</p>
        {LEGAL_NAV.map(({ href, label, icon: Icon, active }) => (
          <Link key={href} href={href} className={`flex items-center gap-2.5 px-2 py-1 rounded-sm font-mono text-xs transition-colors ${
            active ? "text-amber-400 bg-amber-950/40 border border-amber-900/50" : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
          }`}>
            <Icon className="w-3 h-3" />{label}
          </Link>
        ))}
        <div className="mt-auto">
          <Link href="/profile" className="flex items-center gap-2.5 px-2 py-1.5 rounded-sm text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 font-mono text-xs transition-colors">
            <User className="w-3.5 h-3.5" />Profile
          </Link>
        </div>
      </aside>

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
        </div>

        {/* Ownership callout */}
        <div className="border border-green-900/50 bg-green-950/20 rounded-sm px-3 py-2.5 mb-5 flex items-start gap-2.5">
          <Shield className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-mono text-xs text-green-300 font-medium mb-0.5">You own this data</p>
            <p className="font-mono text-xs text-zinc-400">Your ratings, reviews, and work history are cryptographically signed by AiStaffApp and portable as W3C Verifiable Credentials. No platform lock-in.</p>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
          {STATS.map(({ label, value, sub }) => (
            <div key={label} className="border border-zinc-800 rounded-sm p-2.5 bg-zinc-900/40">
              <p className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest">{label}</p>
              <p className="font-mono text-lg font-medium text-amber-400 mt-0.5 tabular-nums">{value}</p>
              {sub && <p className="font-mono text-[10px] text-zinc-600 mt-0.5">{sub}</p>}
            </div>
          ))}
        </div>

        {/* Public URL strip */}
        <div className="border border-zinc-800 rounded-sm px-3 py-2 mb-5 flex items-center gap-2 bg-zinc-900/40">
          <Globe className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
          <span className="font-mono text-xs text-zinc-400 flex-1 truncate">{profileUrl}</span>
          <button onClick={copyUrl} className="h-6 px-2 border border-zinc-700 rounded-sm font-mono text-[11px] text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors flex items-center gap-1 flex-shrink-0">
            {copied ? <><Check className="w-2.5 h-2.5" /> Copied</> : <><Copy className="w-2.5 h-2.5" /> Copy</>}
          </button>
          <a href="#" className="h-6 px-2 border border-zinc-700 rounded-sm font-mono text-[11px] text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors flex items-center gap-1 flex-shrink-0">
            <ExternalLink className="w-2.5 h-2.5" /> View
          </a>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-zinc-800 mb-4">
          {[
            { key: "profile" as const, label: `Work History (${WORK_RECORDS.length})` },
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
            {WORK_RECORDS.map(wr => (
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
                  <div className="flex-shrink-0">
                    <StarRating score={wr.rating} />
                  </div>
                </div>

                {/* Skills */}
                <div className="flex flex-wrap gap-1.5">
                  {wr.skills.map(s => (
                    <span key={s} className="font-mono text-[11px] text-zinc-400 border border-zinc-800 rounded-sm px-1.5 py-0.5 bg-zinc-900">
                      {s}
                    </span>
                  ))}
                </div>

                {/* Review */}
                <p className="font-mono text-xs text-zinc-400 italic border-l-2 border-zinc-700 pl-2.5">
                  &ldquo;{wr.review}&rdquo;
                </p>

                {/* VC hash */}
                {wr.vcHash && (
                  <div className="flex items-center gap-2 pt-1">
                    <CheckCircle className="w-3 h-3 text-green-400 flex-shrink-0" />
                    <span className="font-mono text-[10px] text-zinc-600">Credential hash: {wr.vcHash}</span>
                    <a href="#" className="font-mono text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors flex items-center gap-0.5 ml-auto">
                      <ExternalLink className="w-2.5 h-2.5" /> Verify
                    </a>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Export tab */}
        {tab === "export" && (
          <div className="space-y-3">
            {/* Master export button */}
            <div className="border border-amber-900/50 rounded-sm p-3 bg-amber-950/10 flex items-center justify-between gap-3">
              <div>
                <p className="font-mono text-sm text-amber-300 font-medium">Export Full Reputation Package</p>
                <p className="font-mono text-xs text-zinc-500 mt-0.5">
                  ZIP containing W3C VC JWT, work history JSON, PDF report, and SVG badge
                </p>
              </div>
              <button className="h-9 px-4 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-mono text-xs rounded-sm transition-colors flex items-center gap-1.5 flex-shrink-0">
                <Download className="w-3.5 h-3.5" /> Export All
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
                    onClick={() => { setExportedId(target.id); setTimeout(() => setExportedId(null), 2500); }}
                    className={`h-8 px-3 rounded-sm font-mono text-xs transition-colors flex items-center gap-1.5 flex-shrink-0 ${
                      exportedId === target.id
                        ? "bg-green-900/40 border border-green-800 text-green-400"
                        : "border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100"
                    }`}
                  >
                    {exportedId === target.id
                      ? <><Check className="w-3 h-3" /> Exported!</>
                      : <><Share2 className="w-3 h-3" /> Export</>}
                  </button>
                ) : (
                  <button className="h-8 px-3 rounded-sm font-mono text-xs border border-zinc-800 text-zinc-600 flex-shrink-0" disabled>
                    Waitlist
                  </button>
                )}
              </div>
            ))}

            {/* QR section */}
            <div className="border border-zinc-800 rounded-sm p-3 flex items-center gap-3 bg-zinc-900/40">
              <div className="w-16 h-16 border-2 border-zinc-700 rounded-sm flex items-center justify-center flex-shrink-0 bg-zinc-800">
                <QrCode className="w-8 h-8 text-zinc-500" />
              </div>
              <div>
                <p className="font-mono text-sm text-zinc-200">QR Code — Share in person</p>
                <p className="font-mono text-xs text-zinc-500 mt-0.5">Scan to view your verified reputation profile. Works offline with cached VC.</p>
                <button className="mt-1.5 h-7 px-2 border border-zinc-700 rounded-sm font-mono text-[11px] text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors flex items-center gap-1">
                  <Download className="w-2.5 h-2.5" /> Download QR
                </button>
              </div>
            </div>

            {/* Verification info */}
            <div className="border border-zinc-800 rounded-sm p-3 bg-zinc-900/30">
              <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest mb-2">How Verification Works</p>
              <div className="space-y-1.5">
                {[
                  { icon: Fingerprint, text: "Each project completion is signed by AiStaffApp's DID key (Ed25519)" },
                  { icon: Shield,      text: "Third parties verify credentials at verify.aistaffapp.com without contacting AiStaffApp" },
                  { icon: CheckCircle, text: "Credentials include escrow payout confirmation — earnings are cryptographically proven" },
                  { icon: Clock,       text: "Credentials include issuance date and expiry — no stale reputation gaming" },
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

      {/* Mobile nav */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 h-16 bg-zinc-950 border-t border-zinc-800 flex items-center justify-around px-2 z-50">
        {[
          { href: "/dashboard",   icon: LayoutDashboard, label: "Dash" },
          { href: "/marketplace", icon: Store,            label: "Market" },
          { href: "/matching",    icon: Shuffle,          label: "Matching" },
          { href: "/profile",     icon: User,             label: "Profile" },
        ].map(({ href, icon: Icon, label }) => (
          <Link key={href} href={href} className="flex flex-col items-center gap-1 text-zinc-500 hover:text-zinc-300 transition-colors min-w-[56px] py-2">
            <Icon className="w-5 h-5" />
            <span className="font-mono text-[10px]">{label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
