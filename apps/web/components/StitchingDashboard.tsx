"use client";

import {
  ExternalLink,
  Fingerprint,
  Github,
  Linkedin,
  Shield,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";

type IdentityTier = "Unverified" | "SocialVerified" | "BiometricVerified";

interface TierConfig {
  label:       string;
  description: string;
  Icon:        React.ElementType;
  borderCls:   string;
  textCls:     string;
  permissions: string[];
}

const TIER_CONFIG: Record<IdentityTier, TierConfig> = {
  Unverified: {
    label:       "Tier 0 — Unverified",
    description: "GitHub identity only",
    Icon:        ShieldAlert,
    borderCls:   "border-zinc-700",
    textCls:     "text-zinc-400",
    permissions: ["Browse marketplace", "View agent listings"],
  },
  SocialVerified: {
    label:       "Tier 1 — Social Verified",
    description: "GitHub + LinkedIn confirmed",
    Icon:        Shield,
    borderCls:   "border-amber-800",
    textCls:     "text-amber-400",
    permissions: ["Tier 0 access", "Submit project bids", "Access escrow system"],
  },
  BiometricVerified: {
    label:       "Tier 2 — Biometric Verified",
    description: "ZK liveness proof confirmed",
    Icon:        ShieldCheck,
    borderCls:   "border-green-800",
    textCls:     "text-green-400",
    permissions: [
      "Full platform access",
      "Deploy AI agents",
      "Receive escrow payouts",
      "Priority listing",
    ],
  },
};

const TIERS: IdentityTier[] = ["Unverified", "SocialVerified", "BiometricVerified"];

interface StitchingDashboardProps {
  currentTier:          IdentityTier;
  trustScore:           number;
  biometricCommitment?: string;
  deepLinkUrl:          string;
  githubLogin:          string;
  linkedinVerified:     boolean;
}

export function StitchingDashboard({
  currentTier,
  trustScore,
  biometricCommitment,
  deepLinkUrl,
  githubLogin,
  linkedinVerified,
}: StitchingDashboardProps) {
  const currentIdx = TIERS.indexOf(currentTier);

  return (
    <div className="space-y-3">
      {/* Trust score header */}
      <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
        <div>
          <p className="text-xs text-zinc-500 uppercase tracking-widest font-mono">
            Trust Score
          </p>
          <p className="font-mono text-3xl font-medium text-zinc-100 tabular-nums mt-0.5">
            {trustScore}
            <span className="text-zinc-500 text-lg">/100</span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-zinc-500 uppercase tracking-widest font-mono">
            Identity Tier
          </p>
          <p
            className={`font-mono text-sm mt-0.5 ${
              TIER_CONFIG[currentTier].textCls
            }`}
          >
            {TIER_CONFIG[currentTier].label}
          </p>
        </div>
      </div>

      {/* Signal indicators — 3-column grid */}
      <div className="grid grid-cols-3 gap-2">
        <SignalChip
          Icon={Github}
          label="GitHub"
          active={true}
          value={githubLogin}
        />
        <SignalChip
          Icon={Linkedin}
          label="LinkedIn"
          active={linkedinVerified}
          value={linkedinVerified ? "Verified" : "Pending"}
        />
        <SignalChip
          Icon={Fingerprint}
          label="Biometric"
          active={!!biometricCommitment}
          value={
            biometricCommitment
              ? `${biometricCommitment.slice(0, 8)}…`
              : "None"
          }
        />
      </div>

      {/* Tier progression */}
      <div className="space-y-2">
        {TIERS.map((tier, idx) => {
          const cfg    = TIER_CONFIG[tier];
          const active = idx <= currentIdx;
          const { Icon } = cfg;

          return (
            <div
              key={tier}
              className={`border rounded-sm p-3 transition-colors ${
                active ? cfg.borderCls : "border-zinc-800 opacity-40"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Icon
                    className={`w-4 h-4 flex-shrink-0 ${
                      active ? cfg.textCls : "text-zinc-600"
                    }`}
                  />
                  <div className="min-w-0">
                    <p
                      className={`font-mono text-xs font-medium truncate ${
                        active ? cfg.textCls : "text-zinc-600"
                      }`}
                    >
                      {cfg.label}
                    </p>
                    <p className="text-zinc-500 text-xs mt-0.5 truncate">
                      {cfg.description}
                    </p>
                  </div>
                </div>
                {active && (
                  <span
                    className={`font-mono text-xs px-1.5 py-0.5 border rounded-sm flex-shrink-0 ${cfg.borderCls} ${cfg.textCls}`}
                  >
                    ACTIVE
                  </span>
                )}
              </div>

              {active && (
                <ul className="mt-2 space-y-0.5 pl-6">
                  {cfg.permissions.map((perm) => (
                    <li
                      key={perm}
                      className="text-xs text-zinc-400 font-mono flex items-center gap-1.5"
                    >
                      <span className="w-1 h-1 rounded-full bg-zinc-600 flex-shrink-0" />
                      {perm}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {/* Biometric upgrade CTA */}
      {currentTier !== "BiometricVerified" && (
        <a
          href={deepLinkUrl}
          className="flex items-center justify-between w-full h-14 sm:h-10
                     px-4 rounded-sm border border-amber-900 bg-amber-950
                     text-amber-400 font-mono text-xs uppercase tracking-widest
                     hover:border-amber-700 active:scale-[0.98] transition-all"
        >
          <span>Upgrade to Tier 2 — Open Identity Wallet</span>
          <ExternalLink className="w-4 h-4 flex-shrink-0" />
        </a>
      )}

      {/* ZK commitment hash — audit trail */}
      {biometricCommitment && (
        <div className="border border-zinc-800 rounded-sm p-2">
          <p className="text-xs text-zinc-500 font-mono uppercase tracking-widest">
            ZK Commitment
          </p>
          <p className="font-mono text-xs text-zinc-400 mt-1 break-all">
            {biometricCommitment}
          </p>
        </div>
      )}
    </div>
  );
}

function SignalChip({
  Icon,
  label,
  active,
  value,
}: {
  Icon: React.ElementType;
  label: string;
  active: boolean;
  value: string;
}) {
  return (
    <div
      className={`border rounded-sm p-2 ${
        active ? "border-zinc-700" : "border-zinc-800 opacity-40"
      }`}
    >
      <div className="flex items-center gap-1.5">
        <Icon
          className={`w-3 h-3 ${active ? "text-zinc-300" : "text-zinc-600"}`}
        />
        <span className="font-mono text-xs text-zinc-500 uppercase tracking-widest truncate">
          {label}
        </span>
      </div>
      <p
        className={`font-mono text-xs mt-1 truncate ${
          active ? "text-zinc-200" : "text-zinc-600"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
