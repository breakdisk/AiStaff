"use client";

import { useState, useEffect } from "react";
import TalentInvitationsWidget from "@/components/TalentInvitationsWidget";
import MyEngagementsWidget from "@/components/MyEngagementsWidget";
import TalentEarningsWidget from "@/components/TalentEarningsWidget";
import TalentStatsStrip from "@/components/TalentStatsStrip";
import TalentProfileCompletenessWidget from "@/components/TalentProfileCompletenessWidget";
import { TrustScoreBadge }   from "@/components/TrustScoreBadge";
import { VettingBadge }      from "@/components/VettingBadge";
import { VerifiedSkillsChips } from "@/components/VerifiedSkillsChips";
import type { PlatformSignal, SkillTag } from "@/components/VerifiedSkillsChips";
import ReputationBadge       from "@/components/ReputationBadge";
import { StitchingDashboard } from "@/components/StitchingDashboard";
import {
  fetchPublicProfile,
  fetchTalentSkills,
  fetchRoiReport,
  exportVc,
  type PublicProfile,
} from "@/lib/api";
import { roiToReputation } from "@/lib/roi";

// ── Helpers (mirror page.tsx patterns) ───────────────────────────────────────

function tierToStitching(tier: string): "Unverified" | "SocialVerified" | "BiometricVerified" {
  if (tier === "BIOMETRIC_VERIFIED") return "BiometricVerified";
  if (tier === "SOCIAL_VERIFIED")    return "SocialVerified";
  return "Unverified";
}

function buildSignals(profile: PublicProfile): PlatformSignal[] {
  const out: PlatformSignal[] = [];
  if (profile.github_connected)
    out.push({ id: "gh", platform: "github",   label: "GitHub",   detail: "Connected", url: "#", verified: true });
  if (profile.linkedin_connected)
    out.push({ id: "li", platform: "linkedin", label: "LinkedIn", detail: "Connected", url: "#", verified: true });
  return out;
}

// ── Defaults ──────────────────────────────────────────────────────────────────

const DEMO_SIGNALS: PlatformSignal[] = [
  { id: "gh", platform: "github",   label: "GitHub",   detail: "Connect to show repos",   url: "#", verified: false },
  { id: "li", platform: "linkedin", label: "LinkedIn", detail: "Connect to verify profile", url: "#", verified: false },
];

const DEMO_SKILLS: SkillTag[] = [];

const DEMO_REPUTATION = {
  talentId:         "",
  reputationScore:  0,
  totalDeployments: 0,
  totalEarnedCents: 0,
  driftIncidents:   0,
  vcIssued:         false,
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface TalentDashboardContentProps {
  session: {
    user: {
      profileId?: string;
      name?: string | null;
      identityTier?: string;
      trustScore?: number;
      role?: string | null;
    };
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TalentDashboardContent({ session }: TalentDashboardContentProps) {
  const profileId     = (session.user as { profileId?: string }).profileId ?? "";
  const identityTier  = session.user.identityTier ?? "UNVERIFIED";
  const trustScore    = session.user.trustScore ?? 0;
  const sessionName   = session.user.name;

  const [publicProfile, setPublicProfile] = useState<PublicProfile | null>(null);
  const [liveSkills,    setLiveSkills]    = useState<SkillTag[] | null>(null);
  // liveSkillsRaw is used for TalentProfileCompletenessWidget which needs { id: string }[]
  const [liveSkillsRaw, setLiveSkillsRaw] = useState<{ id: string }[] | null>(null);
  const [reputation,    setReputation]    = useState(DEMO_REPUTATION);
  const [vcExporting,   setVcExporting]   = useState(false);

  useEffect(() => {
    if (!profileId) return;

    Promise.all([
      fetchPublicProfile(profileId).catch(() => null),
      fetchTalentSkills(profileId).catch(() => ({ skills: [] })),
      fetchRoiReport(profileId).catch(() => null),
    ]).then(([profile, skillsRes, roi]) => {
      setPublicProfile(profile);

      const skills = skillsRes?.skills ?? [];
      if (skills.length > 0) {
        setLiveSkills(
          skills.map((s) => ({
            tag:         s.tag,
            proficiency: (Math.min(5, Math.max(1, s.proficiency)) as 1 | 2 | 3 | 4 | 5),
            verified:    s.verified_at !== null,
          })),
        );
        setLiveSkillsRaw(skills.map((s) => ({ id: s.tag_id })));
      }

      if (roi) {
        setReputation({ ...roiToReputation(roi), vcIssued: false });
      }
    });
  }, [profileId]);

  async function handleExportVc() {
    if (!reputation.talentId) return;
    setVcExporting(true);
    try {
      await exportVc(reputation.talentId);
      setReputation((prev) => ({ ...prev, vcIssued: true }));
    } catch {
      // VC export service unavailable — silently degrade
    } finally {
      setVcExporting(false);
    }
  }

  const tierNumeric = (
    identityTier === "BIOMETRIC_VERIFIED" ? 2 :
    identityTier === "SOCIAL_VERIFIED"    ? 1 : 0
  ) as 0 | 1 | 2;

  return (
    <div className="space-y-4">
      {/* Section header */}
      <p className="font-mono text-[10px] text-amber-400 uppercase tracking-widest">
        Talent Dashboard
      </p>

      {/* Trust score badge row */}
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
          Identity
        </span>
        <TrustScoreBadge
          score={trustScore}
          biometricVerified={identityTier === "BIOMETRIC_VERIFIED"}
        />
      </div>

      {/* 1. Invitations */}
      <TalentInvitationsWidget />

      {/* 2. Engagements */}
      <div className="space-y-1">
        <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
          My Engagements
        </p>
        <MyEngagementsWidget />
      </div>

      {/* 3. Earnings */}
      <div className="space-y-1">
        <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
          Earnings
        </p>
        <TalentEarningsWidget />
      </div>

      {/* 4. Stats strip */}
      <div className="space-y-1">
        <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
          GitHub · Activity
        </p>
        <TalentStatsStrip
          githubFollowers={publicProfile?.github_followers ?? undefined}
          githubRepos={publicProfile?.github_stars ?? undefined}
          totalDeployments={reputation.totalDeployments}
          reputationScore={reputation.reputationScore}
        />
      </div>

      {/* 5. Profile completeness */}
      <TalentProfileCompletenessWidget
        publicProfile={publicProfile}
        sessionName={sessionName}
        liveSkills={liveSkillsRaw}
      />

      {/* 6. Reputation */}
      <div className="space-y-1">
        <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
          Reputation
        </p>
        <ReputationBadge
          {...reputation}
          onExportVc={vcExporting ? async () => {} : handleExportVc}
        />
      </div>

      {/* 7. Vetting status */}
      <div className="space-y-1">
        <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
          Vetting Status
        </p>
        <VettingBadge tier={tierNumeric} expandable />
      </div>

      {/* 8. Verified skills & platform signals */}
      <div className="space-y-1">
        <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
          Verified Skills &amp; Platforms
        </p>
        <div className="border border-zinc-800 rounded-sm p-4 bg-zinc-900/60">
          <VerifiedSkillsChips
            signals={publicProfile ? buildSignals(publicProfile) : DEMO_SIGNALS}
            skills={liveSkills ?? DEMO_SKILLS}
          />
        </div>
      </div>

      {/* 9. Identity stitching */}
      <div className="space-y-1">
        <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
          Identity Stitching
        </p>
        <div className="border border-zinc-800 rounded-sm p-4 bg-zinc-900">
          <StitchingDashboard
            currentTier={tierToStitching(identityTier)}
            trustScore={trustScore}
            biometricCommitment={undefined}
            deepLinkUrl="openid4vp://?request_uri=https%3A%2F%2Fapi.aistaffapp.com%2Fidentity%2Fvp-request"
            githubLogin={
              publicProfile?.github_connected
                ? (sessionName ?? "user")
                : undefined
            }
            linkedinVerified={publicProfile?.linkedin_connected ?? false}
          />
        </div>
      </div>
    </div>
  );
}
