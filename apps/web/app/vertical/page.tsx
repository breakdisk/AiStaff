"use client";

import { useState } from "react";
import {
  Landmark, Heart, Scale, Cog, Bot, GraduationCap,
  CheckCircle, ChevronRight, ChevronDown, ExternalLink, Star, Users, FileText,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface VerticalSuite {
  id:              string;
  name:            string;
  tagline:         string;
  icon:            React.ElementType;
  active:          boolean;          // demo: fintech is org's active suite
  complianceBadges:string[];
  agentTypes:      string[];
  talentCount:     number;
  jurisdictions:   string[];
  paymentRails:    string[];
  pricing:         string;
  sotTemplate:     string;
}

// ── Demo data ─────────────────────────────────────────────────────────────────

const VERTICALS: VerticalSuite[] = [
  {
    id: "fintech",
    name: "Fintech",
    tagline: "AML/KYC-aware agents for regulated financial markets",
    icon: Landmark,
    active: true,
    complianceBadges: ["FCA-aligned NDA", "AML Checklist", "SEC SOW Clauses", "GDPR Module"],
    agentTypes: ["KYC Agent", "Fraud Detection", "Portfolio Analyser", "FX Risk Monitor"],
    talentCount: 142,
    jurisdictions: ["UK", "US", "EU", "SG"],
    paymentRails: ["Swift", "FPS", "SEPA", "ACH"],
    pricing: "$4,800 / deployment",
    sotTemplate: "Fintech-SOW-v3.pdf",
  },
  {
    id: "healthcare",
    name: "Healthcare",
    tagline: "HIPAA-compliant agents for clinical and admin workflows",
    icon: Heart,
    active: false,
    complianceBadges: ["HIPAA BAA", "FDA Part 11", "HL7 FHIR", "ISO 27799"],
    agentTypes: ["Clinical Notes AI", "Scheduling Agent", "Billing Coder", "Drug Interaction Scanner"],
    talentCount: 98,
    jurisdictions: ["US", "CA", "AU"],
    paymentRails: ["ACH", "Check", "HSA-compatible"],
    pricing: "$6,200 / deployment",
    sotTemplate: "Healthcare-SOW-v2.pdf",
  },
  {
    id: "legaltech",
    name: "Legal Tech",
    tagline: "Contract intelligence and e-discovery automation",
    icon: Scale,
    active: false,
    complianceBadges: ["SRA-aligned NDA", "ABA Model Rules", "GDPR DPA", "eIDAS"],
    agentTypes: ["Contract Reviewer", "e-Discovery Agent", "IP Monitor", "Due Diligence AI"],
    talentCount: 67,
    jurisdictions: ["UK", "US", "EU"],
    paymentRails: ["Swift", "SEPA", "ACH"],
    pricing: "$5,100 / deployment",
    sotTemplate: "LegalTech-SOW-v1.pdf",
  },
  {
    id: "manufacturing",
    name: "Manufacturing",
    tagline: "OT/IT bridge agents for factory floor automation",
    icon: Cog,
    active: false,
    complianceBadges: ["ISO 9001", "IEC 62443", "CE Marking", "OSHA Module"],
    agentTypes: ["Predictive Maintenance", "Quality Vision AI", "Supply Chain Optimiser", "Energy Monitor"],
    talentCount: 54,
    jurisdictions: ["DE", "US", "JP", "KR"],
    paymentRails: ["SEPA", "Swift", "ACH"],
    pricing: "$3,900 / deployment",
    sotTemplate: "Manufacturing-SOW-v2.pdf",
  },
  {
    id: "robotics",
    name: "Robotics",
    tagline: "Wasm-sandboxed agents for autonomous robot fleets",
    icon: Bot,
    active: false,
    complianceBadges: ["ROS 2 Certified", "IEC 61508 (SIL2)", "ISO 10218", "FCC Part 15"],
    agentTypes: ["Kinematic Planner", "Fleet Coordinator", "Safety Monitor", "Sensor Fusion AI"],
    talentCount: 39,
    jurisdictions: ["US", "DE", "JP"],
    paymentRails: ["ACH", "Swift"],
    pricing: "$7,500 / deployment",
    sotTemplate: "Robotics-SOW-v1.pdf",
  },
  {
    id: "education",
    name: "Education",
    tagline: "AI tutors and admin agents for edtech platforms",
    icon: GraduationCap,
    active: false,
    complianceBadges: ["FERPA-aligned", "COPPA Module", "WCAG 2.1 AA", "GDPR for Minors"],
    agentTypes: ["Adaptive Tutor", "Assessment Generator", "Plagiarism Detector", "Admin Automator"],
    talentCount: 81,
    jurisdictions: ["US", "UK", "AU", "IN"],
    paymentRails: ["ACH", "PayPal", "Stripe"],
    pricing: "$2,400 / deployment",
    sotTemplate: "Education-SOW-v1.pdf",
  },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function ComplianceBadgeTag({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 font-mono text-[9px] px-1.5 py-0.5 rounded-sm border border-zinc-700 text-zinc-400">
      <CheckCircle className="w-2.5 h-2.5 text-green-500 flex-shrink-0" />
      {label}
    </span>
  );
}

function AgentTag({ label }: { label: string }) {
  return (
    <span className="font-mono text-[9px] px-1.5 py-0.5 rounded-sm border border-amber-900 text-amber-500 bg-amber-950/30">
      {label}
    </span>
  );
}

function SuiteDetailPanel({ suite, onActivate }: { suite: VerticalSuite; onActivate: (id: string) => void }) {
  const [activating, setActivating] = useState(false);
  const Icon = suite.icon;

  function handleActivate() {
    setActivating(true);
    setTimeout(() => setActivating(false), 1800);
    onActivate(suite.id);
  }

  return (
    <div className="border border-zinc-800 rounded-sm bg-zinc-900 h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-sm border border-zinc-700 flex items-center justify-center">
            <Icon className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <p className="font-mono text-sm font-medium text-zinc-200">{suite.name} Suite</p>
            <p className="font-mono text-[10px] text-zinc-500">{suite.tagline}</p>
          </div>
        </div>
        {suite.active && (
          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-sm border border-green-800 text-green-400">
            ACTIVE
          </span>
        )}
      </div>

      <div className="p-4 space-y-4">
        {/* Pricing */}
        <div className="flex items-center justify-between border border-zinc-800 rounded-sm px-3 py-2">
          <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">Bundle Pricing</span>
          <span className="font-mono text-sm font-medium text-amber-400">{suite.pricing}</span>
        </div>

        {/* Compliance badges */}
        <div className="space-y-1.5">
          <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest">Compliance Included</p>
          <div className="flex flex-wrap gap-1.5">
            {suite.complianceBadges.map((b) => <ComplianceBadgeTag key={b} label={b} />)}
          </div>
        </div>

        {/* Agent types */}
        <div className="space-y-1.5">
          <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest">Pre-approved Agent Types</p>
          <div className="flex flex-wrap gap-1.5">
            {suite.agentTypes.map((a) => <AgentTag key={a} label={a} />)}
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-2">
          <div className="border border-zinc-800 rounded-sm px-3 py-2">
            <p className="font-mono text-[10px] text-zinc-600">Curated Talent Pool</p>
            <p className="font-mono text-base font-medium text-zinc-200 mt-0.5 tabular-nums">
              {suite.talentCount} <span className="text-zinc-600 text-xs">specialists</span>
            </p>
          </div>
          <div className="border border-zinc-800 rounded-sm px-3 py-2">
            <p className="font-mono text-[10px] text-zinc-600">Jurisdictions</p>
            <p className="font-mono text-sm text-zinc-300 mt-0.5">{suite.jurisdictions.join(" · ")}</p>
          </div>
        </div>

        {/* SOW template */}
        <div className="flex items-center gap-2 border border-zinc-800 rounded-sm px-3 py-2">
          <FileText className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
          <span className="font-mono text-xs text-zinc-400 flex-1 truncate">{suite.sotTemplate}</span>
          <a href="#" className="flex items-center gap-1 font-mono text-[10px] text-amber-500 hover:text-amber-400 transition-colors">
            Download <ExternalLink className="w-2.5 h-2.5" />
          </a>
        </div>

        {/* CTA */}
        {!suite.active ? (
          <button
            onClick={handleActivate}
            disabled={activating}
            className={`w-full h-10 rounded-sm font-mono text-xs font-medium uppercase tracking-widest transition-all border ${
              activating
                ? "border-green-800 bg-green-950 text-green-400"
                : "border-amber-800 bg-amber-950 text-amber-400 hover:bg-amber-900"
            }`}
          >
            {activating ? "✓ Suite Activated" : "Activate Suite"}
          </button>
        ) : (
          <div className="flex items-center gap-2 h-10 px-3 rounded-sm border border-green-800 bg-green-950/30">
            <CheckCircle className="w-3.5 h-3.5 text-green-400" />
            <span className="font-mono text-xs text-green-400">Your active vertical suite</span>
          </div>
        )}
      </div>
    </div>
  );
}

function VerticalCard({
  suite,
  selected,
  onClick,
}: {
  suite: VerticalSuite;
  selected: boolean;
  onClick: () => void;
}) {
  const Icon = suite.icon;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
      className={`border rounded-sm p-3 cursor-pointer transition-all space-y-2 ${
        selected
          ? "border-amber-700 bg-amber-950/20"
          : suite.active
          ? "border-green-800 bg-zinc-900"
          : "border-zinc-800 bg-zinc-900 hover:border-zinc-600"
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-sm border flex items-center justify-center flex-shrink-0 ${
            selected ? "border-amber-800" : "border-zinc-700"
          }`}>
            <Icon className={`w-3.5 h-3.5 ${selected ? "text-amber-400" : "text-zinc-400"}`} />
          </div>
          <div>
            <p className={`font-mono text-xs font-medium ${selected ? "text-amber-400" : "text-zinc-200"}`}>
              {suite.name}
            </p>
            {suite.active && (
              <span className="font-mono text-[9px] text-green-400">● ACTIVE</span>
            )}
          </div>
        </div>
        <ChevronRight className={`w-3 h-3 flex-shrink-0 mt-0.5 transition-transform ${selected ? "rotate-90 text-amber-400" : "text-zinc-700"}`} />
      </div>

      <p className="font-mono text-[10px] text-zinc-500 leading-snug">{suite.tagline}</p>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 font-mono text-[9px] text-zinc-600">
          <Users className="w-2.5 h-2.5" />
          {suite.talentCount} talent
        </div>
        <div className="flex items-center gap-1 font-mono text-[9px] text-zinc-600">
          <Star className="w-2.5 h-2.5" />
          {suite.complianceBadges.length} compliance rules
        </div>
      </div>
    </div>
  );
}

// ── Request Custom Vertical ───────────────────────────────────────────────────

function RequestCustomAccordion() {
  const [open, setOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [text, setText] = useState("");

  function handleSubmit() {
    if (!text.trim()) return;
    setSubmitted(true);
    setTimeout(() => { setSubmitted(false); setOpen(false); setText(""); }, 2000);
  }

  return (
    <div className="border border-zinc-800 rounded-sm overflow-hidden">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => e.key === "Enter" && setOpen((v) => !v)}
        className="flex items-center justify-between px-3 py-2.5 cursor-pointer hover:bg-zinc-900 transition-colors"
      >
        <span className="font-mono text-xs text-zinc-400">Request a custom vertical suite</span>
        <ChevronDown className={`w-3.5 h-3.5 text-zinc-600 transition-transform ${open ? "rotate-180" : ""}`} />
      </div>
      {open && (
        <div className="border-t border-zinc-800 p-3 space-y-3">
          <p className="font-mono text-[10px] text-zinc-500">
            Describe your industry, compliance requirements, and target jurisdictions. Our team will build a custom vertical suite within 14 business days.
          </p>
          <textarea
            rows={3}
            placeholder="e.g. Defense & Aerospace — ITAR-compliant agents, US/UK jurisdiction, biometric verification mandatory..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-sm px-2.5 py-2 font-mono text-xs text-zinc-200 focus:outline-none focus:border-amber-700 placeholder-zinc-700 resize-none"
          />
          <button
            onClick={handleSubmit}
            disabled={submitted || !text.trim()}
            className={`h-8 px-4 rounded-sm font-mono text-xs uppercase tracking-widest border transition-all ${
              submitted
                ? "border-green-800 bg-green-950 text-green-400"
                : "border-amber-800 bg-amber-950 text-amber-400 hover:bg-amber-900 disabled:opacity-40"
            }`}
          >
            {submitted ? "✓ Request Submitted" : "Submit Request"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Sidebar (shared pattern) ──────────────────────────────────────────────────

function Sidebar() {
  return (
    <aside className="hidden lg:flex lg:flex-col w-56 border-r border-zinc-800 bg-zinc-950 p-4 gap-6">
      <span className="font-mono text-xs text-zinc-500 uppercase tracking-widest">AiStaffApp</span>
      <nav className="flex flex-col gap-1">
        {[
          { label: "Dashboard",   href: "/dashboard"   },
          { label: "Marketplace", href: "/marketplace" },
          { label: "Leaderboard", href: "/leaderboard" },
          { label: "Matching",    href: "/matching"    },
          { label: "Profile",     href: "/profile"     },
        ].map(({ label, href }) => (
          <a key={label} href={href}
            className="px-3 py-2 rounded-sm font-mono text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 transition-colors"
          >{label}</a>
        ))}
      </nav>
      {[
        { label: "Payments",       items: [["Escrow","/escrow"],["Payouts","/payouts"],["Billing","/billing"],["Smart Contracts","/smart-contracts"],["Outcome Listings","/outcome-listings"],["Pricing Calculator","/pricing-calculator"]] },
        { label: "Workspace",      items: [["Work Diaries","/work-diaries"],["Async Collab","/async-collab"],["Collaboration","/collab"],["Success Layer","/success-layer"],["Quality Gate","/quality-gate"]] },
        { label: "Legal",          items: [["Legal Toolkit","/legal-toolkit"],["Tax Engine","/tax-engine"],["Reputation","/reputation-export"],["Transparency","/transparency"]] },
        { label: "Notifications",  items: [["Alerts","/notifications"],["Reminders","/reminders"],["Settings","/notification-settings"]] },
        { label: "Enterprise",     items: [["Industry Suites","/vertical"],["Enterprise Hub","/enterprise"],["Talent Pools","/enterprise/talent-pools"],["SLA Dashboard","/enterprise/sla"],["Global & Access","/global"]] },
      ].map(({ label, items }) => (
        <div key={label} className="space-y-1">
          <p className="font-mono text-[10px] text-zinc-300 uppercase tracking-widest px-3">{label}</p>
          {items.map(([lbl, href]) => (
            <a key={lbl} href={href}
              className={`block px-3 py-1.5 rounded-sm font-mono text-xs transition-colors ${
                (lbl === "Industry Suites" && href === "/vertical")
                  ? "text-zinc-100 bg-zinc-800"
                  : "text-zinc-600 hover:text-zinc-300 hover:bg-zinc-900"
              }`}
            >{lbl}</a>
          ))}
        </div>
      ))}
    </aside>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function VerticalPage() {
  const [verticals, setVerticals] = useState<VerticalSuite[]>(VERTICALS);
  const [selected, setSelected]   = useState<string>("fintech");  // default open

  const selectedSuite = verticals.find((v) => v.id === selected) ?? verticals[0];

  function handleActivate(id: string) {
    setVerticals((prev) =>
      prev.map((v) => ({ ...v, active: v.id === id }))
    );
  }

  return (
    <div className="flex flex-col lg:flex-row min-h-screen">
      <Sidebar />

      <main className="flex-1 p-4 pb-20 lg:pb-4 space-y-4 max-w-5xl mx-auto w-full">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-mono text-sm font-medium text-zinc-300 uppercase tracking-widest">
              Industry Suites
            </h1>
            <p className="font-mono text-[10px] text-zinc-500 mt-0.5">
              Pre-configured compliance, talent pools, and templates for your vertical
            </p>
          </div>
          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-sm border border-zinc-700 text-zinc-500">
            {verticals.length} verticals available
          </span>
        </div>

        {/* Active suite callout */}
        {verticals.find((v) => v.active) && (
          <div className="border border-green-900 bg-green-950/20 rounded-sm px-3 py-2 flex items-center gap-2">
            <CheckCircle className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
            <p className="font-mono text-xs text-green-300">
              Active vertical: <span className="font-medium">{verticals.find((v) => v.active)?.name}</span>
              &nbsp;·&nbsp; All new deployments will use this suite's compliance defaults.
            </p>
          </div>
        )}

        {/* Two-column layout on desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Left: card grid */}
          <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2">
            {verticals.map((v) => (
              <VerticalCard
                key={v.id}
                suite={v}
                selected={selected === v.id}
                onClick={() => setSelected(v.id)}
              />
            ))}
          </div>

          {/* Right: detail panel */}
          <div className="lg:col-span-3">
            <SuiteDetailPanel suite={selectedSuite} onActivate={handleActivate} />
          </div>
        </div>

        {/* Request custom */}
        <RequestCustomAccordion />
      </main>
    </div>
  );
}
