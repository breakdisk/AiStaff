"use client";

import { useState } from "react";
import Link from "next/link";
import {
  LayoutDashboard, Store, Trophy, User, Shuffle,
  Brain, ScanSearch, GitMerge, Target, TrendingUp,
  Lock, Wallet, Receipt, FileText, Calculator, Link2,
  BookOpen, Video, MessageSquare, Layers, ShieldCheck,
  Scale, FileSignature, Globe, Download, Check,
  ChevronDown, ChevronUp, Clock, AlertCircle, Plus,
  Landmark, Copy, Eye, Pen
} from "lucide-react";

// ── Nav constants ─────────────────────────────────────────────────────────────
const MAIN_NAV = [
  { href: "/dashboard",   label: "Dashboard",   icon: LayoutDashboard },
  { href: "/marketplace", label: "Marketplace",  icon: Store },
  { href: "/matching",    label: "Matching",      icon: Shuffle },
  { href: "/leaderboard", label: "Leaderboard",  icon: Trophy },
];
const AI_TOOLS_NAV = [
  { href: "/matching",     label: "AI Matching",  icon: Brain },
  { href: "/scoping",      label: "Scoping",       icon: ScanSearch },
  { href: "/outcomes",     label: "Outcomes",      icon: Target },
  { href: "/proposals",    label: "Proposals",     icon: GitMerge },
  { href: "/pricing-tool", label: "Pricing",       icon: TrendingUp },
  { href: "/hybrid-match", label: "Hybrid Match",  icon: Shuffle },
];
const PAYMENTS_NAV = [
  { href: "/escrow",             label: "Escrow",      icon: Lock },
  { href: "/payouts",            label: "Payouts",      icon: Wallet },
  { href: "/billing",            label: "Billing",      icon: Receipt },
  { href: "/smart-contracts",    label: "Contracts",    icon: FileText },
  { href: "/outcome-listings",   label: "Outcomes",     icon: Target },
  { href: "/pricing-calculator", label: "Calculator",   icon: Calculator },
];
const WORKSPACE_NAV = [
  { href: "/work-diaries",  label: "Work Diaries",   icon: BookOpen },
  { href: "/async-collab",  label: "Async Collab",   icon: Video },
  { href: "/collab",        label: "Collaboration",  icon: MessageSquare },
  { href: "/success-layer", label: "Success Layer",  icon: Layers },
  { href: "/quality-gate",  label: "Quality Gate",   icon: ShieldCheck },
];
const LEGAL_NAV = [
  { href: "/legal-toolkit",    label: "Legal Toolkit",  icon: Scale,       active: true },
  { href: "/tax-engine",       label: "Tax Engine",      icon: Landmark },
  { href: "/reputation-export",label: "Reputation",      icon: Link2 },
  { href: "/transparency",     label: "Transparency",    icon: Eye },
];

// ── Types ─────────────────────────────────────────────────────────────────────
type DocStatus = "draft" | "pending_signature" | "signed" | "expired";
type TemplateKind = "nda" | "ip_assignment" | "sow" | "service_agreement" | "data_processing";

interface DocTemplate {
  id:           string;
  kind:         TemplateKind;
  name:         string;
  description:  string;
  jurisdictions: string[];
  fields:       string[];
  lastUpdated:  string;
}

interface GeneratedDoc {
  id:          string;
  templateId:  string;
  name:        string;
  kind:        TemplateKind;
  parties:     string[];
  jurisdiction: string;
  status:      DocStatus;
  createdAt:   string;
  signedAt?:   string;
  expiresAt?:  string;
}

// ── Demo data ─────────────────────────────────────────────────────────────────
const TEMPLATES: DocTemplate[] = [
  {
    id: "tpl-nda",
    kind: "nda",
    name: "Mutual NDA",
    description: "Standard bilateral non-disclosure agreement. Covers confidential information shared during project scoping and delivery.",
    jurisdictions: ["US", "UK", "EU", "AU", "CA"],
    fields: ["Party A name", "Party B name", "Effective date", "Duration (months)", "Governing jurisdiction"],
    lastUpdated: "2026-01-15",
  },
  {
    id: "tpl-ip",
    kind: "ip_assignment",
    name: "IP Assignment",
    description: "Full intellectual property assignment from talent to client upon project completion and final payment.",
    jurisdictions: ["US", "UK", "EU"],
    fields: ["Assignor (talent)", "Assignee (client)", "Project description", "Consideration amount", "Effective date"],
    lastUpdated: "2026-02-01",
  },
  {
    id: "tpl-sow",
    kind: "sow",
    name: "Statement of Work",
    description: "Milestone-based SOW aligned with escrow release schedule. Includes deliverable hash verification clause.",
    jurisdictions: ["US", "UK", "EU", "AU", "CA", "SG"],
    fields: ["Project title", "Talent name", "Client name", "Milestones", "Total value", "Start / end dates"],
    lastUpdated: "2026-02-28",
  },
  {
    id: "tpl-service",
    kind: "service_agreement",
    name: "Independent Contractor Agreement",
    description: "Establishes independent contractor relationship. Includes IR35/1099 classification markers and no employment obligation clauses.",
    jurisdictions: ["US", "UK", "EU"],
    fields: ["Contractor name", "Client name", "Service description", "Rate / fee structure", "Termination notice period"],
    lastUpdated: "2026-03-01",
  },
  {
    id: "tpl-dpa",
    kind: "data_processing",
    name: "Data Processing Agreement",
    description: "GDPR-compliant DPA for projects involving personal data. Maps controller/processor roles and data retention rules.",
    jurisdictions: ["EU", "UK"],
    fields: ["Controller (client)", "Processor (talent)", "Data categories", "Processing purpose", "Retention period"],
    lastUpdated: "2026-02-10",
  },
];

const GENERATED_DOCS: GeneratedDoc[] = [
  {
    id: "doc-001",
    templateId: "tpl-nda",
    name: "NDA — Acme Corp × Marcus T.",
    kind: "nda",
    parties: ["Acme Corp", "Marcus T."],
    jurisdiction: "US",
    status: "signed",
    createdAt: "2026-02-14",
    signedAt: "2026-02-14",
    expiresAt: "2027-02-14",
  },
  {
    id: "doc-002",
    templateId: "tpl-sow",
    name: "SOW — DataSync Pipeline",
    kind: "sow",
    parties: ["Acme Corp", "Marcus T."],
    jurisdiction: "US",
    status: "signed",
    createdAt: "2026-02-14",
    signedAt: "2026-02-15",
  },
  {
    id: "doc-003",
    templateId: "tpl-ip",
    name: "IP Assignment — DataSync",
    kind: "ip_assignment",
    parties: ["Marcus T.", "Acme Corp"],
    jurisdiction: "US",
    status: "pending_signature",
    createdAt: "2026-03-01",
  },
  {
    id: "doc-004",
    templateId: "tpl-dpa",
    name: "DPA — NeuralCo × Lena K.",
    kind: "data_processing",
    parties: ["NeuralCo", "Lena K."],
    jurisdiction: "EU",
    status: "signed",
    createdAt: "2026-03-01",
    signedAt: "2026-03-02",
    expiresAt: "2027-03-01",
  },
  {
    id: "doc-005",
    templateId: "tpl-service",
    name: "ICA — DevOps Inc × Diego R.",
    kind: "service_agreement",
    parties: ["DevOps Inc", "Diego R."],
    jurisdiction: "UK",
    status: "draft",
    createdAt: "2026-03-08",
  },
];

const KIND_LABEL: Record<TemplateKind, string> = {
  nda: "NDA", ip_assignment: "IP Assignment", sow: "SOW",
  service_agreement: "ICA", data_processing: "DPA",
};
const KIND_COLOR: Record<TemplateKind, string> = {
  nda: "text-sky-400 border-sky-900",
  ip_assignment: "text-violet-400 border-violet-900",
  sow: "text-amber-400 border-amber-900",
  service_agreement: "text-green-400 border-green-900",
  data_processing: "text-rose-400 border-rose-900",
};
const STATUS_MAP: Record<DocStatus, { label: string; color: string }> = {
  draft:             { label: "Draft",            color: "text-zinc-400 border-zinc-700" },
  pending_signature: { label: "Pending Sign",     color: "text-amber-400 border-amber-800" },
  signed:            { label: "Signed",           color: "text-green-400 border-green-800" },
  expired:           { label: "Expired",          color: "text-red-400 border-red-800" },
};

const JUR_FLAG: Record<string, string> = {
  US: "🇺🇸", UK: "🇬🇧", EU: "🇪🇺", AU: "🇦🇺", CA: "🇨🇦", SG: "🇸🇬",
};

// ── Sub-components ────────────────────────────────────────────────────────────
function TemplateCard({ tpl }: { tpl: DocTemplate }) {
  const [open, setOpen] = useState(false);
  const [generated, setGenerated] = useState(false);

  return (
    <div className={`border rounded-sm bg-zinc-900/40 ${open ? "border-zinc-700" : "border-zinc-800"}`}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen(v => !v)}
        onKeyDown={(e) => e.key === "Enter" && setOpen(v => !v)}
        className="flex items-start gap-3 px-3 py-2.5 cursor-pointer hover:bg-zinc-900/60 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`font-mono text-[10px] px-1 py-0.5 border rounded-sm ${KIND_COLOR[tpl.kind]}`}>
              {KIND_LABEL[tpl.kind]}
            </span>
            <span className="font-mono text-sm text-zinc-100">{tpl.name}</span>
          </div>
          <p className="font-mono text-xs text-zinc-500 mt-0.5">{tpl.description}</p>
          <div className="flex items-center gap-1 mt-1.5 flex-wrap">
            {tpl.jurisdictions.map(j => (
              <span key={j} className="font-mono text-[10px] text-zinc-500 border border-zinc-800 rounded-sm px-1 py-0.5">
                {JUR_FLAG[j]} {j}
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
          <span className="font-mono text-[10px] text-zinc-600">Updated {tpl.lastUpdated}</span>
          {open ? <ChevronUp className="w-3.5 h-3.5 text-zinc-500" /> : <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />}
        </div>
      </div>

      {open && (
        <div className="border-t border-zinc-800 px-3 py-3 space-y-3 bg-zinc-950/40">
          <div>
            <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest mb-1.5">Required fields</p>
            <div className="flex flex-wrap gap-1.5">
              {tpl.fields.map(f => (
                <span key={f} className="font-mono text-[11px] text-zinc-400 border border-zinc-800 rounded-sm px-1.5 py-0.5 bg-zinc-900">
                  {f}
                </span>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { setGenerated(true); setTimeout(() => setGenerated(false), 2500); }}
              className={`h-8 px-3 rounded-sm font-mono text-xs transition-colors flex items-center gap-1.5 ${
                generated
                  ? "bg-green-900/40 border border-green-800 text-green-400"
                  : "bg-amber-500 hover:bg-amber-400 text-zinc-950"
              }`}
            >
              {generated ? <><Check className="w-3 h-3" /> Generated!</> : <><Plus className="w-3 h-3" /> Generate Doc</>}
            </button>
            <button className="h-8 px-3 rounded-sm font-mono text-xs border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1.5">
              <Eye className="w-3 h-3" /> Preview
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DocRow({ doc }: { doc: GeneratedDoc }) {
  const s = STATUS_MAP[doc.status];
  const [copied, setCopied] = useState(false);

  function copyLink() {
    navigator.clipboard.writeText(`https://docs.aistaffapp.com/${doc.id}`).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="data-row justify-between">
      <div className="flex items-center gap-3 min-w-0">
        <span className={`font-mono text-[10px] px-1 py-0.5 border rounded-sm flex-shrink-0 ${KIND_COLOR[doc.kind]}`}>
          {KIND_LABEL[doc.kind]}
        </span>
        <div className="min-w-0">
          <p className="font-mono text-xs text-zinc-200 truncate">{doc.name}</p>
          <p className="font-mono text-[10px] text-zinc-600">
            {doc.parties.join(" × ")} · {JUR_FLAG[doc.jurisdiction]} {doc.jurisdiction}
            {doc.signedAt && ` · Signed ${doc.signedAt}`}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className={`font-mono text-[10px] px-1.5 py-0.5 border rounded-sm ${s.color}`}>{s.label}</span>
        {doc.status === "pending_signature" && (
          <button className="h-6 px-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-mono text-[11px] rounded-sm transition-colors flex items-center gap-1">
            <Pen className="w-2.5 h-2.5" /> Sign
          </button>
        )}
        <button
          onClick={copyLink}
          className="h-6 px-2 border border-zinc-700 rounded-sm font-mono text-[11px] text-zinc-500 hover:text-zinc-300 hover:border-zinc-500 transition-colors flex items-center gap-1"
        >
          {copied ? <><Check className="w-2.5 h-2.5" /> Copied</> : <><Copy className="w-2.5 h-2.5" /> Link</>}
        </button>
        <button className="h-6 px-2 border border-zinc-700 rounded-sm font-mono text-[11px] text-zinc-500 hover:text-zinc-300 hover:border-zinc-500 transition-colors flex items-center gap-1">
          <Download className="w-2.5 h-2.5" /> PDF
        </button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function LegalToolkitPage() {
  const [tab, setTab] = useState<"templates" | "documents">("templates");
  const [jurFilter, setJurFilter] = useState("All");

  const jurisdictions = ["All", "US", "UK", "EU", "AU", "CA", "SG"];
  const filteredTpls = TEMPLATES.filter(t =>
    jurFilter === "All" || t.jurisdictions.includes(jurFilter)
  );

  const stats = {
    signed:  GENERATED_DOCS.filter(d => d.status === "signed").length,
    pending: GENERATED_DOCS.filter(d => d.status === "pending_signature").length,
    draft:   GENERATED_DOCS.filter(d => d.status === "draft").length,
  };

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
              <Scale className="w-4 h-4 text-amber-400" />
              <h1 className="font-mono text-base font-medium text-zinc-100">Legal Toolkit</h1>
            </div>
            <p className="font-mono text-xs text-zinc-500">One-click NDAs, IP assignments &amp; jurisdiction-specific contracts</p>
          </div>
          <button className="h-8 px-3 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-mono text-xs rounded-sm transition-colors flex items-center gap-1.5">
            <Plus className="w-3 h-3" /> New Document
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 mb-5">
          {[
            { label: "Signed",          value: stats.signed,  color: "text-green-400" },
            { label: "Pending Sign",    value: stats.pending, color: "text-amber-400" },
            { label: "Draft",           value: stats.draft,   color: "text-zinc-400"  },
          ].map(({ label, value, color }) => (
            <div key={label} className="border border-zinc-800 rounded-sm p-2.5 text-center bg-zinc-900/40">
              <p className={`font-mono text-xl font-medium ${color}`}>{value}</p>
              <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* Compliance callout */}
        <div className="border border-zinc-800 rounded-sm px-3 py-2.5 mb-5 flex items-start gap-2.5 bg-zinc-900/30">
          <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="font-mono text-xs text-zinc-400">
            <span className="text-zinc-200">All templates are jurisdiction-aware.</span>{" "}
            US templates include 1099 independent contractor language. UK templates include IR35 safe-harbour clauses.
            EU templates are GDPR Article 28 compliant. Always consult a qualified lawyer before signing.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-zinc-800 mb-4">
          {[
            { key: "templates" as const, label: `Templates (${TEMPLATES.length})` },
            { key: "documents" as const, label: `My Documents (${GENERATED_DOCS.length})` },
          ].map(({ key, label }) => (
            <button key={key} onClick={() => setTab(key)}
              className={`px-3 py-2 font-mono text-xs border-b-2 transition-colors ${
                tab === key ? "border-amber-500 text-amber-400" : "border-transparent text-zinc-500 hover:text-zinc-300"
              }`}
            >{label}</button>
          ))}
        </div>

        {tab === "templates" && (
          <>
            {/* Jurisdiction filter */}
            <div className="flex items-center gap-1.5 flex-wrap mb-4">
              {jurisdictions.map(j => (
                <button key={j} onClick={() => setJurFilter(j)}
                  className={`h-7 px-2.5 rounded-sm font-mono text-xs border transition-colors ${
                    jurFilter === j
                      ? "bg-amber-500 border-amber-500 text-zinc-950"
                      : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
                  }`}
                >
                  {j === "All" ? "All Jurisdictions" : `${JUR_FLAG[j]} ${j}`}
                </button>
              ))}
            </div>
            <div className="space-y-2">
              {filteredTpls.map(tpl => <TemplateCard key={tpl.id} tpl={tpl} />)}
            </div>
          </>
        )}

        {tab === "documents" && (
          <div className="border border-zinc-800 rounded-sm overflow-hidden">
            {GENERATED_DOCS.map(doc => <DocRow key={doc.id} doc={doc} />)}
          </div>
        )}

        {/* Jurisdiction guide */}
        <div className="mt-6 border border-zinc-800 rounded-sm p-3">
          <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest mb-3">Jurisdiction Quick Reference</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { jur: "US", flag: "🇺🇸", notes: "1099-NEC for contractors >$600/yr. No IP auto-assignment — explicit clause required." },
              { jur: "UK", flag: "🇬🇧", notes: "IR35 determines employment status. Check via HMRC CEST tool before contract." },
              { jur: "EU", flag: "🇪🇺", notes: "GDPR DPA mandatory if processing personal data. IP vests in creator by default in most member states." },
              { jur: "AU", flag: "🇦🇺", notes: "ABN registration required for contractors. GST applies if annual revenue >A$75k." },
              { jur: "CA", flag: "🇨🇦", notes: "PST/HST may apply to services. Federal T4A for contractors >CA$500/yr." },
              { jur: "SG", flag: "🇸🇬", notes: "SOW-based engagement avoids employer obligations. IP follows contract terms." },
            ].map(({ jur, flag, notes }) => (
              <div key={jur} className="border border-zinc-800 rounded-sm p-2">
                <p className="font-mono text-xs text-zinc-200 mb-1">{flag} {jur}</p>
                <p className="font-mono text-[11px] text-zinc-500 leading-relaxed">{notes}</p>
              </div>
            ))}
          </div>
        </div>
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
