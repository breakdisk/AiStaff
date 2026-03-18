"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  LayoutDashboard, Store, Trophy, User, Shuffle,
  Brain, ScanSearch, GitMerge, Target, TrendingUp,
  Lock, Wallet, Receipt, FileText, Calculator, Link2,
  BookOpen, Video, MessageSquare, Layers, ShieldCheck,
  Scale, FileSignature, Globe, Download, Check,
  ChevronDown, ChevronUp, AlertCircle, Plus,
  Landmark, Copy, Eye, Pen, X, Loader2, Mail, Send,
} from "lucide-react";
import {
  fetchContracts,
  createContract,
  signContract,
  requestSignature,
  fetchWarrantyClaims,
  resolveWarrantyClaim,
  type Contract,
  type WarrantyClaim,
} from "@/lib/api";
import { downloadContractPdf } from "@/lib/download-pdf";

// ── Nav ───────────────────────────────────────────────────────────────────────
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
];
const PAYMENTS_NAV = [
  { href: "/escrow",             label: "Escrow",     icon: Lock },
  { href: "/payouts",            label: "Payouts",    icon: Wallet },
  { href: "/billing",            label: "Billing",    icon: Receipt },
  { href: "/smart-contracts",    label: "Contracts",  icon: FileText },
  { href: "/pricing-calculator", label: "Calculator", icon: Calculator },
];
const WORKSPACE_NAV = [
  { href: "/work-diaries",  label: "Work Diaries",  icon: BookOpen },
  { href: "/async-collab",  label: "Async Collab",  icon: Video },
  { href: "/collab",        label: "Collaboration", icon: MessageSquare },
  { href: "/success-layer", label: "Success Layer", icon: Layers },
  { href: "/quality-gate",  label: "Quality Gate",  icon: ShieldCheck },
];
const LEGAL_NAV = [
  { href: "/legal-toolkit",     label: "Legal Toolkit", icon: Scale,         active: true },
  { href: "/tax-engine",        label: "Tax Engine",    icon: Landmark },
  { href: "/reputation-export", label: "Reputation",   icon: Link2 },
  { href: "/transparency",      label: "Transparency",  icon: Eye },
];

// ── Template definitions ──────────────────────────────────────────────────────
type TemplateKind = "nda" | "ip_assignment" | "sow" | "service_agreement" | "data_processing";

interface DocTemplate {
  id:           string;
  kind:         TemplateKind;
  name:         string;
  description:  string;
  jurisdictions: string[];
  fields:       Array<{ key: string; label: string; placeholder: string }>;
  lastUpdated:  string;
}

const TEMPLATES: DocTemplate[] = [
  {
    id: "tpl-nda", kind: "nda",
    name: "Mutual NDA",
    description: "Standard bilateral NDA. Covers confidential information shared during scoping and delivery.",
    jurisdictions: ["US", "UK", "EU", "AU", "CA"],
    fields: [
      { key: "party_b_name",    label: "Counterparty name",      placeholder: "Acme Corp" },
      { key: "effective_date",  label: "Effective date",          placeholder: "2026-04-01" },
      { key: "duration_months", label: "Duration (months)",       placeholder: "12" },
      { key: "jurisdiction",    label: "Governing jurisdiction",  placeholder: "Delaware, USA" },
    ],
    lastUpdated: "2026-01-15",
  },
  {
    id: "tpl-ip", kind: "ip_assignment",
    name: "IP Assignment",
    description: "Full IP assignment from talent to client upon project completion and final payment.",
    jurisdictions: ["US", "UK", "EU"],
    fields: [
      { key: "party_b_name",    label: "Assignee (client)",        placeholder: "Acme Corp" },
      { key: "project_desc",    label: "Project description",      placeholder: "DataSync Pipeline" },
      { key: "consideration",   label: "Consideration amount",     placeholder: "USD 5,000" },
      { key: "effective_date",  label: "Effective date",           placeholder: "2026-04-01" },
    ],
    lastUpdated: "2026-02-01",
  },
  {
    id: "tpl-sow", kind: "sow",
    name: "Statement of Work",
    description: "Milestone-based SOW aligned with escrow release schedule. Includes deliverable hash verification clause.",
    jurisdictions: ["US", "UK", "EU", "AU", "CA", "SG"],
    fields: [
      { key: "project_title",  label: "Project title",    placeholder: "DataSync Pipeline v2" },
      { key: "party_b_name",   label: "Client name",      placeholder: "Acme Corp" },
      { key: "milestones",     label: "Milestones",       placeholder: "M1: Design, M2: Build, M3: Deploy" },
      { key: "total_value",    label: "Total value",      placeholder: "USD 10,000" },
      { key: "start_date",     label: "Start date",       placeholder: "2026-04-01" },
      { key: "end_date",       label: "End date",         placeholder: "2026-07-01" },
    ],
    lastUpdated: "2026-02-28",
  },
  {
    id: "tpl-service", kind: "service_agreement",
    name: "Independent Contractor Agreement",
    description: "Establishes independent contractor relationship. Includes IR35/1099 classification markers.",
    jurisdictions: ["US", "UK", "EU"],
    fields: [
      { key: "party_b_name",  label: "Client name",              placeholder: "DevOps Inc" },
      { key: "service_desc",  label: "Service description",      placeholder: "Backend engineering" },
      { key: "rate",          label: "Rate / fee structure",     placeholder: "USD 120/hr" },
      { key: "notice_period", label: "Termination notice (days)", placeholder: "14" },
    ],
    lastUpdated: "2026-03-01",
  },
  {
    id: "tpl-dpa", kind: "data_processing",
    name: "Data Processing Agreement",
    description: "GDPR Article 28 compliant DPA for projects involving personal data.",
    jurisdictions: ["EU", "UK"],
    fields: [
      { key: "party_b_name",     label: "Controller (client)",   placeholder: "NeuralCo GmbH" },
      { key: "data_categories",  label: "Data categories",       placeholder: "Names, emails, usage logs" },
      { key: "processing_purpose", label: "Processing purpose",  placeholder: "ML model training" },
      { key: "retention_period", label: "Retention period",      placeholder: "24 months" },
    ],
    lastUpdated: "2026-02-10",
  },
];

// ── Constants ─────────────────────────────────────────────────────────────────
const KIND_LABEL: Record<TemplateKind, string> = {
  nda: "NDA", ip_assignment: "IP Assignment", sow: "SOW",
  service_agreement: "ICA", data_processing: "DPA",
};
const KIND_COLOR: Record<TemplateKind, string> = {
  nda:               "text-sky-400 border-sky-900",
  ip_assignment:     "text-violet-400 border-violet-900",
  sow:               "text-amber-400 border-amber-900",
  service_agreement: "text-green-400 border-green-900",
  data_processing:   "text-rose-400 border-rose-900",
};
const STATUS_MAP: Record<string, { label: string; color: string }> = {
  DRAFT:             { label: "Draft",        color: "text-zinc-400 border-zinc-700" },
  PENDING_SIGNATURE: { label: "Pending Sign", color: "text-amber-400 border-amber-800" },
  SIGNED:            { label: "Signed",       color: "text-green-400 border-green-800" },
  EXPIRED:           { label: "Expired",      color: "text-red-400 border-red-800" },
  REVOKED:           { label: "Revoked",      color: "text-red-400 border-red-800" },
};
const JUR_FLAG: Record<string, string> = {
  US: "🇺🇸", UK: "🇬🇧", EU: "🇪🇺", AU: "🇦🇺", CA: "🇨🇦", SG: "🇸🇬",
};

// ── Document text generator ───────────────────────────────────────────────────
function buildDocumentText(
  kind: TemplateKind,
  fields: Record<string, string>,
  authorName: string,
): string {
  const date = new Date().toISOString().split("T")[0];
  const counterparty = fields.party_b_name ?? "Counterparty";

  const header = `${KIND_LABEL[kind]}
Generated by AiStaff Legal Toolkit — ${date}
Party A (talent): ${authorName}
Party B (client): ${counterparty}

`;

  const body: Record<TemplateKind, string> = {
    nda: `MUTUAL NON-DISCLOSURE AGREEMENT

Effective Date: ${fields.effective_date ?? date}
Duration: ${fields.duration_months ?? "12"} months
Governing Law: ${fields.jurisdiction ?? ""}

Both parties agree to hold the other party's Confidential Information in strict confidence and not to disclose such information to any third parties without prior written consent.

This agreement shall be governed by the laws of ${fields.jurisdiction ?? "the agreed jurisdiction"}.`,

    ip_assignment: `INTELLECTUAL PROPERTY ASSIGNMENT

Project: ${fields.project_desc ?? ""}
Consideration: ${fields.consideration ?? ""}
Effective Date: ${fields.effective_date ?? date}

The Assignor (Party A) hereby irrevocably assigns to the Assignee (Party B) all right, title, and interest in and to the Work Product created under the referenced project, including all intellectual property rights therein.`,

    sow: `STATEMENT OF WORK

Project: ${fields.project_title ?? ""}
Total Value: ${fields.total_value ?? ""}
Start Date: ${fields.start_date ?? ""}
End Date: ${fields.end_date ?? ""}

Milestones:
${fields.milestones ?? ""}

Deliverable verification: SHA-256 hash of each deliverable shall be recorded and verified against the escrow release condition.`,

    service_agreement: `INDEPENDENT CONTRACTOR AGREEMENT

Service Description: ${fields.service_desc ?? ""}
Rate / Fee Structure: ${fields.rate ?? ""}
Termination Notice: ${fields.notice_period ?? "14"} days

Party A is an independent contractor. Nothing in this agreement shall be construed to create an employment, partnership, or joint venture relationship. Party A shall be responsible for all applicable taxes (1099-NEC / IR35 as applicable).`,

    data_processing: `DATA PROCESSING AGREEMENT (GDPR Article 28)

Data Categories: ${fields.data_categories ?? ""}
Processing Purpose: ${fields.processing_purpose ?? ""}
Retention Period: ${fields.retention_period ?? ""}

Party B (Controller) appoints Party A (Processor) to process personal data solely on documented instructions from the Controller and in accordance with Regulation (EU) 2016/679.`,
  };

  return header + body[kind];
}

// ── Generate Doc Modal ────────────────────────────────────────────────────────
interface GenerateModalProps {
  tpl:       DocTemplate;
  profileId: string;
  name:      string;
  email:     string;
  onClose:   () => void;
  onCreated: (c: Contract) => void;
}

function GenerateModal({ tpl, profileId, name, email, onClose, onCreated }: GenerateModalProps) {
  const [values,      setValues]      = useState<Record<string, string>>({});
  const [partyBEmail, setPartyBEmail] = useState("");
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState("");
  const [signUrl,     setSignUrl]     = useState("");

  async function submit() {
    setLoading(true);
    setError("");
    try {
      const text   = buildDocumentText(tpl.kind, values, name);
      const b64    = btoa(unescape(encodeURIComponent(text)));
      const result = await createContract({
        contract_type:  tpl.kind,
        party_a:        profileId,
        party_b:        profileId,
        party_b_email:  partyBEmail.trim() || undefined,
        party_a_email:  email || undefined,
        document_b64:   b64,
      });

      // Generate and download PDF (server-side pdfkit — 5–20 KB output)
      await downloadContractPdf(text, result.document_hash, tpl.kind, result.contract_id);

      // Request counterparty signature if email provided
      if (partyBEmail.trim()) {
        const sig = await requestSignature(result.contract_id, partyBEmail.trim()).catch(() => null);
        if (sig?.sign_url) setSignUrl(sig.sign_url);
      }

      // Fetch the newly created record and surface it
      const fresh = await fetch(`/api/compliance/contracts/${result.contract_id}`)
        .then(r => r.json()) as Contract;
      onCreated(fresh);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate document");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60">
      <div className="w-full sm:w-[520px] bg-zinc-900 border border-zinc-700 rounded-sm sm:rounded-sm mx-0 sm:mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <span className={`font-mono text-[10px] px-1 py-0.5 border rounded-sm ${KIND_COLOR[tpl.kind]}`}>
              {KIND_LABEL[tpl.kind]}
            </span>
            <span className="font-mono text-sm text-zinc-100">{tpl.name}</span>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        {/* Fields */}
        <div className="px-4 py-4 space-y-3 max-h-[60vh] overflow-y-auto">
          {tpl.fields.map(f => (
            <div key={f.key}>
              <label className="block font-mono text-[11px] text-zinc-400 mb-1">{f.label}</label>
              <input
                className="w-full h-8 px-2.5 bg-zinc-950 border border-zinc-700 rounded-sm font-mono text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500"
                placeholder={f.placeholder}
                value={values[f.key] ?? ""}
                onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))}
              />
            </div>
          ))}
          {/* Counterparty email for e-signature */}
          <div className="border-t border-zinc-800 pt-3">
            <label className="block font-mono text-[11px] text-zinc-400 mb-1">
              Counterparty email <span className="text-zinc-600">(optional — sends sign link)</span>
            </label>
            <input
              className="w-full h-8 px-2.5 bg-zinc-950 border border-zinc-700 rounded-sm font-mono text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500"
              placeholder="counterparty@example.com"
              type="email"
              value={partyBEmail}
              onChange={e => setPartyBEmail(e.target.value)}
            />
          </div>
          {signUrl && (
            <div className="border border-amber-900 rounded-sm p-2 bg-amber-950/20">
              <p className="font-mono text-[10px] text-amber-400 mb-1">Sign link (share if email failed)</p>
              <p className="font-mono text-[11px] text-zinc-400 break-all">{signUrl}</p>
            </div>
          )}
          {error && (
            <p className="font-mono text-xs text-red-400 flex items-center gap-1.5">
              <AlertCircle className="w-3 h-3" /> {error}
            </p>
          )}
        </div>
        {/* Footer */}
        <div className="px-4 py-3 border-t border-zinc-800 flex items-center justify-between">
          <p className="font-mono text-[10px] text-zinc-600">SHA-256 hashed · PDF downloaded locally.</p>
          <div className="flex gap-2">
            <button onClick={onClose} className="h-8 px-3 border border-zinc-700 rounded-sm font-mono text-xs text-zinc-400 hover:border-zinc-500 hover:text-zinc-300 transition-colors">
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={loading}
              className="h-8 px-3 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-mono text-xs rounded-sm transition-colors flex items-center gap-1.5"
            >
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileSignature className="w-3 h-3" />}
              Generate &amp; Download
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Template card ─────────────────────────────────────────────────────────────
function TemplateCard({
  tpl, profileId, name, email, onCreated,
}: {
  tpl:       DocTemplate;
  profileId: string;
  name:      string;
  email:     string;
  onCreated: (c: Contract) => void;
}) {
  const [open, setOpen]       = useState(false);
  const [modal, setModal]     = useState(false);

  return (
    <>
      <div className={`border rounded-sm bg-zinc-900/40 ${open ? "border-zinc-700" : "border-zinc-800"}`}>
        <div
          role="button" tabIndex={0}
          onClick={() => setOpen(v => !v)}
          onKeyDown={e => e.key === "Enter" && setOpen(v => !v)}
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
                  <span key={f.key} className="font-mono text-[11px] text-zinc-400 border border-zinc-800 rounded-sm px-1.5 py-0.5 bg-zinc-900">
                    {f.label}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setModal(true)}
                className="h-8 px-3 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-mono text-xs rounded-sm transition-colors flex items-center gap-1.5"
              >
                <Plus className="w-3 h-3" /> Generate Doc
              </button>
            </div>
          </div>
        )}
      </div>

      {modal && (
        <GenerateModal
          tpl={tpl}
          profileId={profileId}
          name={name}
          email={email}
          onClose={() => setModal(false)}
          onCreated={c => { setModal(false); onCreated(c); }}
        />
      )}
    </>
  );
}

// ── Contract row ──────────────────────────────────────────────────────────────
function ContractRow({ doc, profileId, onSigned }: {
  doc:       Contract;
  profileId: string;
  onSigned:  (id: string) => void;
}) {
  const s      = STATUS_MAP[doc.status] ?? { label: doc.status, color: "text-zinc-400 border-zinc-700" };
  const kind   = doc.contract_type as TemplateKind;
  const kLabel = KIND_LABEL[kind] ?? doc.contract_type.toUpperCase();
  const kColor = KIND_COLOR[kind] ?? "text-zinc-400 border-zinc-700";

  const [copied,    setCopied]    = useState(false);
  const [signing,   setSigning]   = useState(false);
  const [showSend,  setShowSend]  = useState(false);
  const [sendEmail, setSendEmail] = useState(doc.party_b_email ?? "");
  const [sending,   setSending]   = useState(false);
  const [signUrl,   setSignUrl]   = useState("");
  const [sendDone,  setSendDone]  = useState(false);

  async function handleSign() {
    setSigning(true);
    try {
      await signContract(doc.id, profileId);
      onSigned(doc.id);
    } catch { /* ignore */ }
    setSigning(false);
  }

  async function handleSend() {
    if (!sendEmail.trim()) return;
    setSending(true);
    try {
      const result = await requestSignature(doc.id, sendEmail.trim());
      setSignUrl(result.sign_url ?? "");
      setSendDone(true);
      setShowSend(false);
    } catch { /* ignore */ }
    setSending(false);
  }

  function copyHash() {
    navigator.clipboard.writeText(doc.document_hash).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const isPending = doc.status === "DRAFT" || doc.status === "PENDING_SIGNATURE";

  return (
    <div className="border-b border-zinc-800 last:border-0">
      {/* Main row */}
      <div className="flex items-center justify-between px-3 py-2.5 gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className={`font-mono text-[10px] px-1 py-0.5 border rounded-sm flex-shrink-0 ${kColor}`}>
            {kLabel}
          </span>
          <div className="min-w-0">
            <p className="font-mono text-xs text-zinc-200 truncate">{doc.contract_type} — {doc.id.slice(0, 8)}</p>
            <p className="font-mono text-[10px] text-zinc-600">
              {doc.party_a_signed_at && `You signed ${doc.party_a_signed_at.slice(0, 10)}`}
              {doc.party_b_signed_at && ` · Counterparty signed ${doc.party_b_signed_at.slice(0, 10)}`}
              {!doc.party_a_signed_at && `hash: ${doc.document_hash.slice(0, 16)}…`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`font-mono text-[10px] px-1.5 py-0.5 border rounded-sm ${s.color}`}>{s.label}</span>
          {isPending && !doc.party_a_signed_at && (
            <button
              onClick={handleSign}
              disabled={signing}
              className="h-6 px-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-mono text-[11px] rounded-sm transition-colors flex items-center gap-1"
            >
              {signing ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Pen className="w-2.5 h-2.5" />}
              Sign
            </button>
          )}
          {isPending && (
            <button
              onClick={() => setShowSend(v => !v)}
              className={`h-6 px-2 border rounded-sm font-mono text-[11px] transition-colors flex items-center gap-1 ${
                sendDone
                  ? "border-green-800 text-green-400"
                  : "border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500"
              }`}
            >
              {sendDone
                ? <><Check className="w-2.5 h-2.5" /> Sent</>
                : doc.status === "PENDING_SIGNATURE"
                  ? <><Mail className="w-2.5 h-2.5" /> Resend</>
                  : <><Send className="w-2.5 h-2.5" /> Send</>
              }
            </button>
          )}
          <button
            onClick={copyHash}
            className="h-6 px-2 border border-zinc-700 rounded-sm font-mono text-[11px] text-zinc-500 hover:text-zinc-300 hover:border-zinc-500 transition-colors flex items-center gap-1"
          >
            {copied ? <><Check className="w-2.5 h-2.5" /> Copied</> : <><Copy className="w-2.5 h-2.5" /> Hash</>}
          </button>
        </div>
      </div>
      {/* Inline send form */}
      {showSend && (
        <div className="px-3 pb-3 pt-0 bg-zinc-950/40 border-t border-zinc-800/50">
          <p className="font-mono text-[10px] text-zinc-600 mb-1.5 pt-2">
            {doc.status === "PENDING_SIGNATURE" ? "Resend sign link to counterparty" : "Send sign link to counterparty"}
          </p>
          <div className="flex gap-2">
            <input
              className="flex-1 h-7 px-2 bg-zinc-900 border border-zinc-700 rounded-sm font-mono text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500"
              placeholder="counterparty@example.com"
              type="email"
              value={sendEmail}
              onChange={e => setSendEmail(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSend()}
            />
            <button
              onClick={handleSend}
              disabled={sending || !sendEmail.trim()}
              className="h-7 px-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-mono text-xs rounded-sm transition-colors flex items-center gap-1"
            >
              {sending ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Send className="w-2.5 h-2.5" />}
              Send Link
            </button>
          </div>
        </div>
      )}
      {/* Sign URL fallback (if email delivery is uncertain) */}
      {signUrl && (
        <div className="px-3 pb-2.5 border-t border-zinc-800/50 bg-zinc-950/40">
          <p className="font-mono text-[10px] text-amber-400 mt-2 mb-1">Sign link (share if email didn&apos;t arrive)</p>
          <p className="font-mono text-[11px] text-zinc-500 break-all">{signUrl}</p>
        </div>
      )}
    </div>
  );
}

// ── Warranty claims tab ───────────────────────────────────────────────────────
function WarrantyTab({ profileId }: { profileId: string }) {
  const [claims, setClaims] = useState<WarrantyClaim[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWarrantyClaims()
      .then(setClaims)
      .catch(() => setClaims([]))
      .finally(() => setLoading(false));
  }, []);

  async function resolve(id: string, resolution: "REMEDIATED" | "REFUNDED" | "REJECTED") {
    await resolveWarrantyClaim(id, resolution).catch(() => {});
    setClaims(prev => prev.map(c => c.id === id ? { ...c, resolution, resolved_at: new Date().toISOString() } : c));
  }

  if (loading) return (
    <div className="flex items-center gap-2 py-8 justify-center text-zinc-600 font-mono text-xs">
      <Loader2 className="w-4 h-4 animate-spin" /> Loading claims…
    </div>
  );

  if (claims.length === 0) return (
    <div className="py-12 text-center font-mono text-xs text-zinc-600">No warranty claims.</div>
  );

  const resolutionColor: Record<string, string> = {
    REMEDIATED: "text-green-400 border-green-800",
    REFUNDED:   "text-sky-400 border-sky-800",
    REJECTED:   "text-red-400 border-red-800",
  };

  return (
    <div className="border border-zinc-800 rounded-sm overflow-hidden">
      {claims.map(c => (
        <div key={c.id} className="data-row justify-between">
          <div className="min-w-0">
            <p className="font-mono text-xs text-zinc-200 truncate">
              Deployment: {c.deployment_id.slice(0, 8)}…
            </p>
            <p className="font-mono text-[10px] text-zinc-600">
              Filed {c.claimed_at.slice(0, 10)} · {c.drift_proof.slice(0, 40)}…
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {c.resolution ? (
              <span className={`font-mono text-[10px] px-1.5 py-0.5 border rounded-sm ${resolutionColor[c.resolution] ?? "text-zinc-400 border-zinc-700"}`}>
                {c.resolution}
              </span>
            ) : (
              <>
                <button onClick={() => resolve(c.id, "REMEDIATED")} className="h-6 px-2 border border-green-800 rounded-sm font-mono text-[11px] text-green-400 hover:bg-green-900/30 transition-colors">Fix</button>
                <button onClick={() => resolve(c.id, "REFUNDED")}   className="h-6 px-2 border border-sky-800   rounded-sm font-mono text-[11px] text-sky-400   hover:bg-sky-900/30   transition-colors">Refund</button>
                <button onClick={() => resolve(c.id, "REJECTED")}   className="h-6 px-2 border border-red-800   rounded-sm font-mono text-[11px] text-red-400   hover:bg-red-900/30   transition-colors">Reject</button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function LegalToolkitPage() {
  const { data: session } = useSession();
  const profileId   = (session?.user as { profileId?: string })?.profileId ?? "";
  const displayName = session?.user?.name ?? "Me";
  const userEmail   = session?.user?.email ?? "";

  const [tab, setTab]           = useState<"templates" | "documents" | "warranty">("templates");
  const [jurFilter, setJurFilter] = useState("All");
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading]   = useState(false);

  const jurisdictions = ["All", "US", "UK", "EU", "AU", "CA", "SG"];
  const filteredTpls  = TEMPLATES.filter(t =>
    jurFilter === "All" || t.jurisdictions.includes(jurFilter),
  );

  const loadContracts = useCallback(() => {
    if (!profileId) return;
    setLoading(true);
    fetchContracts(profileId)
      .then(setContracts)
      .catch(() => setContracts([]))
      .finally(() => setLoading(false));
  }, [profileId]);

  useEffect(() => {
    if (tab === "documents") loadContracts();
  }, [tab, loadContracts]);

  function handleSigned(id: string) {
    setContracts(prev =>
      prev.map(c => c.id === id ? { ...c, status: "SIGNED", signed_at: new Date().toISOString() } : c),
    );
  }

  const stats = {
    signed:  contracts.filter(c => c.status === "SIGNED").length,
    pending: contracts.filter(c => c.status === "PENDING_SIGNATURE" || c.status === "DRAFT").length,
    total:   contracts.length,
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
            <p className="font-mono text-xs text-zinc-500">NDAs, IP assignments &amp; jurisdiction-specific contracts — SHA-256 hashed on creation</p>
          </div>
          <button
            onClick={() => setTab("templates")}
            className="h-8 px-3 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-mono text-xs rounded-sm transition-colors flex items-center gap-1.5"
          >
            <Plus className="w-3 h-3" /> New Document
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 mb-5">
          {[
            { label: "Signed",      value: stats.signed,  color: "text-green-400" },
            { label: "In Progress", value: stats.pending, color: "text-amber-400" },
            { label: "Total",       value: stats.total,   color: "text-zinc-400"  },
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
            US: 1099-NEC language · UK: IR35 safe-harbour · EU: GDPR Article 28 compliant.
            Always consult a qualified lawyer before signing.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-zinc-800 mb-4">
          {[
            { key: "templates" as const, label: `Templates (${TEMPLATES.length})` },
            { key: "documents" as const, label: `My Contracts (${contracts.length})` },
            { key: "warranty"  as const, label: "Warranty Claims" },
          ].map(({ key, label }) => (
            <button key={key} onClick={() => setTab(key)}
              className={`px-3 py-2 font-mono text-xs border-b-2 transition-colors ${
                tab === key ? "border-amber-500 text-amber-400" : "border-transparent text-zinc-500 hover:text-zinc-300"
              }`}
            >{label}</button>
          ))}
        </div>

        {/* Templates tab */}
        {tab === "templates" && (
          <>
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
              {filteredTpls.map(tpl => (
                <TemplateCard
                  key={tpl.id}
                  tpl={tpl}
                  profileId={profileId}
                  name={displayName}
                  email={userEmail}
                  onCreated={c => { setContracts(prev => [c, ...prev]); setTab("documents"); }}
                />
              ))}
            </div>
          </>
        )}

        {/* Documents tab */}
        {tab === "documents" && (
          loading ? (
            <div className="flex items-center gap-2 py-8 justify-center text-zinc-600 font-mono text-xs">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading contracts…
            </div>
          ) : contracts.length === 0 ? (
            <div className="py-12 text-center">
              <p className="font-mono text-xs text-zinc-600">No contracts yet.</p>
              <button onClick={() => setTab("templates")} className="mt-3 h-8 px-4 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-mono text-xs rounded-sm transition-colors">
                Generate your first document
              </button>
            </div>
          ) : (
            <div className="border border-zinc-800 rounded-sm divide-y-0 overflow-hidden">
              {contracts.map(doc => (
                <ContractRow
                  key={doc.id}
                  doc={doc}
                  profileId={profileId}
                  onSigned={handleSigned}
                />
              ))}
            </div>
          )
        )}

        {/* Warranty tab */}
        {tab === "warranty" && <WarrantyTab profileId={profileId} />}

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
          { href: "/dashboard",   icon: LayoutDashboard, label: "Dash"    },
          { href: "/marketplace", icon: Store,            label: "Market"  },
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
