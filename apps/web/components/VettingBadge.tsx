"use client";

import { useState } from "react";
import {
  ShieldAlert, Shield, ShieldCheck,
  CheckCircle2, Circle, ChevronDown, ChevronUp,
  Fingerprint, Video, FileCode, Users2,
  CreditCard, Linkedin,
} from "lucide-react";

export type VettingTier = 0 | 1 | 2;

interface VettingCheck {
  id:            string;
  label:         string;
  description:   string;
  icon:          React.ElementType;
  minTier:       VettingTier;   // which tier unlocks this check
}

const CHECKS: VettingCheck[] = [
  {
    id:          "gov_id",
    label:       "Gov. ID Verified",
    description: "Government-issued photo ID checked against official records",
    icon:        CreditCard,
    minTier:     1,
  },
  {
    id:          "linkedin",
    label:       "LinkedIn Confirmed",
    description: "Professional profile linked — employment history verified",
    icon:        Linkedin,
    minTier:     1,
  },
  {
    id:          "biometric",
    label:       "Proof of Human",
    description: "ZK liveness proof — cryptographically confirmed you are a real person",
    icon:        Fingerprint,
    minTier:     2,
  },
  {
    id:          "interview",
    label:       "Live Interview",
    description: "30-minute recorded video call with an AiStaff vetter",
    icon:        Video,
    minTier:     2,
  },
  {
    id:          "sample",
    label:       "Sample Deployment",
    description: "Completed a supervised Wasm agent deployment reviewed by senior talent",
    icon:        FileCode,
    minTier:     2,
  },
  {
    id:          "references",
    label:       "Client References",
    description: "Two or more previous client engagements verified by AiStaff",
    icon:        Users2,
    minTier:     2,
  },
];

// ── Tier config ───────────────────────────────────────────────────────────────

const TIER_META = {
  0: {
    label:       "Unverified",
    sublabel:    "GitHub only",
    icon:        ShieldAlert,
    badgeBorder: "border-zinc-700",
    badgeText:   "text-zinc-400",
    pill:        "border-zinc-700 bg-zinc-900 text-zinc-400",
  },
  1: {
    label:       "Social Verified",
    sublabel:    "ID + LinkedIn",
    icon:        Shield,
    badgeBorder: "border-amber-800",
    badgeText:   "text-amber-400",
    pill:        "border-amber-800 bg-amber-950/40 text-amber-400",
  },
  2: {
    label:       "Biometric Verified",
    sublabel:    "ZK proof + Full vetting",
    icon:        ShieldCheck,
    badgeBorder: "border-green-800",
    badgeText:   "text-green-400",
    pill:        "border-green-800 bg-green-950/40 text-green-400",
  },
} as const;

// ── Props ─────────────────────────────────────────────────────────────────────

interface VettingBadgeProps {
  tier:        VettingTier;
  /** Controls whether to show the expandable checklist. Default: true */
  expandable?: boolean;
  /** If true, renders as a compact pill only — no checklist */
  compact?:    boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function VettingBadge({ tier, expandable = true, compact = false }: VettingBadgeProps) {
  const [open, setOpen] = useState(false);
  const meta = TIER_META[tier];
  const Icon = meta.icon;

  // Determine which checks are "passed" based on tier
  const checks = CHECKS.map((c) => ({
    ...c,
    passed: c.minTier <= tier,
  }));

  if (compact) {
    return (
      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm border font-mono text-[10px] ${meta.pill}`}>
        <Icon className="w-3 h-3 flex-shrink-0" />
        {meta.label}
      </span>
    );
  }

  return (
    <div className={`border rounded-sm bg-zinc-900/60 overflow-hidden ${meta.badgeBorder}`}>
      {/* Header row */}
      <div
        className={`flex items-center gap-3 px-3 py-2.5 ${expandable ? "cursor-pointer select-none" : ""}`}
        onClick={() => expandable && setOpen((v) => !v)}
      >
        <Icon className={`w-5 h-5 flex-shrink-0 ${meta.badgeText}`} />

        <div className="flex-1 min-w-0">
          <p className={`font-mono text-xs font-medium leading-none ${meta.badgeText}`}>
            Tier {tier} — {meta.label}
          </p>
          <p className="font-mono text-[10px] text-zinc-500 mt-0.5">{meta.sublabel}</p>
        </div>

        {/* Pass count */}
        <span className="font-mono text-[10px] text-zinc-500 tabular-nums">
          {checks.filter((c) => c.passed).length}/{checks.length}
        </span>

        {expandable && (
          open
            ? <ChevronUp className="w-3.5 h-3.5 text-zinc-600 flex-shrink-0" />
            : <ChevronDown className="w-3.5 h-3.5 text-zinc-600 flex-shrink-0" />
        )}
      </div>

      {/* Progress bar */}
      <div className="h-px bg-zinc-800 relative">
        <div
          className={`h-full transition-all duration-500 ${
            tier === 2 ? "bg-green-700" : tier === 1 ? "bg-amber-700" : "bg-zinc-700"
          }`}
          style={{ width: `${(checks.filter((c) => c.passed).length / checks.length) * 100}%` }}
        />
      </div>

      {/* Expandable checklist */}
      {expandable && open && (
        <div className="divide-y divide-zinc-800/60">
          {checks.map((check) => {
            const CheckIcon = check.icon;
            return (
              <div key={check.id} className="flex items-start gap-3 px-3 py-2.5">
                {/* Status icon */}
                {check.passed
                  ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0 mt-0.5" />
                  : <Circle       className="w-3.5 h-3.5 text-zinc-700  flex-shrink-0 mt-0.5" />
                }

                {/* Check icon */}
                <CheckIcon className={`w-3.5 h-3.5 flex-shrink-0 mt-0.5 ${
                  check.passed ? "text-zinc-400" : "text-zinc-700"
                }`} />

                <div className="min-w-0">
                  <p className={`font-mono text-xs leading-none ${
                    check.passed ? "text-zinc-200" : "text-zinc-600"
                  }`}>
                    {check.label}
                  </p>
                  <p className="font-mono text-[10px] text-zinc-600 mt-0.5 leading-relaxed">
                    {check.description}
                  </p>
                </div>

                {/* Tier requirement */}
                {!check.passed && (
                  <span className="ml-auto flex-shrink-0 font-mono text-[9px] text-zinc-700 border border-zinc-800 px-1 py-0.5 rounded-sm">
                    Tier {check.minTier}+
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
