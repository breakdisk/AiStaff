"use client";

import { useEffect, useState } from "react";
import { useSession, signIn } from "next-auth/react";
import Link from "next/link";
import {
  ArrowLeft, Bot, Star, TrendingUp, Rocket,
  CheckCircle2, Clock, Shield, Github, Linkedin, CheckCheck, AlertTriangle,
  Pencil, X, Save, Loader2, DollarSign,
} from "lucide-react";
import { VettingBadge }    from "@/components/VettingBadge";
import { TrustScoreBadge } from "@/components/TrustScoreBadge";
import {
  updateProfile, fetchSkillTags, fetchTalentSkills, updateTalentSkills,
  requestNonce, attestSkills, disconnectProvider,
  type SkillTag, type TalentSkill, type UpdateProfileRequest,
} from "@/lib/api";

// ── Tier helpers ───────────────────────────────────────────────────────────────

type TierString = "UNVERIFIED" | "SOCIAL_VERIFIED" | "BIOMETRIC_VERIFIED";

function tierToNum(t: TierString | string | undefined): 0 | 1 | 2 {
  if (t === "SOCIAL_VERIFIED")    return 1;
  if (t === "BIOMETRIC_VERIFIED") return 2;
  return 0;
}

// ── Google icon ────────────────────────────────────────────────────────────────

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

// ── Connected accounts ─────────────────────────────────────────────────────────

const PROVIDERS = [
  { id: "github",   label: "GitHub",   icon: <Github className="w-4 h-4 text-zinc-300" />,   tierNote: "+30 pts · technical verification" },
  { id: "google",   label: "Google",   icon: <GoogleIcon className="w-4 h-4" />,             tierNote: "auth only · no trust score" },
  { id: "linkedin", label: "LinkedIn", icon: <Linkedin className="w-4 h-4 text-zinc-300" />, tierNote: "+15 pts · professional verification" },
];

function ConnectedAccounts({
  provider,
  profileId,
  onDisconnect,
}: {
  provider:     string;
  profileId:    string | undefined;
  onDisconnect: (provider: string, newScore: number, newTier: string) => void;
}) {
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  async function handleDisconnect(pid: string) {
    if (!profileId) return;
    setDisconnecting(pid);
    try {
      const res = await disconnectProvider(profileId, pid as "github" | "google" | "linkedin");
      onDisconnect(pid, res.trust_score, res.identity_tier);
    } catch {
      // backend offline — show nothing, keep UI unchanged
    } finally {
      setDisconnecting(null);
    }
  }

  return (
    <div className="border border-zinc-800 rounded-sm bg-zinc-900 divide-y divide-zinc-800">
      {PROVIDERS.map((p) => {
        const connected = p.id === provider;
        return (
          <div key={p.id} className="flex items-center gap-3 px-3 py-2.5">
            {p.icon}
            <div className="flex-1 min-w-0">
              <p className="font-mono text-xs text-zinc-200">{p.label}</p>
              <p className="font-mono text-[10px] text-zinc-600">{p.tierNote}</p>
            </div>
            {connected ? (
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1 font-mono text-[10px] text-emerald-500">
                  <CheckCheck className="w-3 h-3" /> Connected
                </span>
                <button
                  onClick={() => handleDisconnect(p.id)}
                  disabled={disconnecting === p.id}
                  className="font-mono text-[10px] text-zinc-600 hover:text-red-400
                             border border-zinc-700 hover:border-red-900 px-2 py-1
                             rounded-sm transition-colors disabled:opacity-40"
                >
                  {disconnecting === p.id ? "…" : "Disconnect"}
                </button>
              </div>
            ) : (
              <button
                onClick={() => signIn(p.id)}
                className="font-mono text-[10px] text-amber-400 hover:text-amber-300
                           border border-amber-900 hover:border-amber-700 px-2 py-1
                           rounded-sm transition-colors"
              >
                Connect →
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Role stats ─────────────────────────────────────────────────────────────────

const ROLE_STATS: Record<string, { label: string; value: string; icon: React.ElementType }[]> = {
  client: [
    { label: "Deployments",    value: "3",     icon: Rocket    },
    { label: "Agents Active",  value: "2",     icon: Bot       },
    { label: "Avg Trust Score",value: "72",    icon: Shield    },
  ],
  talent: [
    { label: "Deployments Done", value: "12",   icon: Rocket    },
    { label: "Reputation Score", value: "73",   icon: Star      },
    { label: "Escrow Earned",    value: "$1.8k", icon: TrendingUp },
  ],
  "agent-owner": [
    { label: "Agents Published", value: "4",   icon: Bot       },
    { label: "Total Licenses",   value: "19",  icon: Star      },
    { label: "Escrow Earned",    value: "$12k", icon: TrendingUp },
  ],
};

// ── Proficiency labels ─────────────────────────────────────────────────────────

const PROF_LABELS = ["", "Beginner", "Basic", "Intermediate", "Advanced", "Expert"];

// ── Skill picker ──────────────────────────────────────────────────────────────

function SkillPicker({
  allTags,
  current,
  onChange,
}: {
  allTags:  SkillTag[];
  current:  Map<string, number>;
  onChange: (tagId: string, proficiency: number | null) => void;
}) {
  const domains = [...new Set(allTags.map((t) => t.domain))].sort();

  return (
    <div className="space-y-4">
      {domains.map((domain) => (
        <div key={domain}>
          <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest mb-2">{domain}</p>
          <div className="flex flex-wrap gap-2">
            {allTags
              .filter((t) => t.domain === domain)
              .map((tag) => {
                const prof = current.get(tag.id) ?? 0;
                const selected = prof > 0;
                return (
                  <div key={tag.id} className="flex flex-col items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onChange(tag.id, selected ? null : 3)}
                      className={`h-7 px-2.5 rounded-sm border font-mono text-xs transition-all ${
                        selected
                          ? "border-amber-400/60 bg-amber-400/10 text-amber-400"
                          : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-600"
                      }`}
                    >
                      {tag.tag}
                    </button>
                    {selected && (
                      <select
                        value={prof}
                        onChange={(e) => onChange(tag.id, Number(e.target.value))}
                        className="h-5 text-[10px] font-mono bg-zinc-900 border border-zinc-700
                                   text-zinc-400 rounded-sm px-1 focus:outline-none"
                      >
                        {[1, 2, 3, 4, 5].map((v) => (
                          <option key={v} value={v}>{PROF_LABELS[v]}</option>
                        ))}
                      </select>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Edit form ─────────────────────────────────────────────────────────────────

function EditForm({
  profileId,
  initial,
  allTags,
  onSaved,
  onCancel,
}: {
  profileId: string;
  initial: { bio: string; hourlyRate: string; availability: string; role: string; skills: Map<string, number> };
  allTags:   SkillTag[];
  onSaved:   (data: { bio: string; hourlyRate: string; availability: string; role: string; skills: TalentSkill[] }) => void;
  onCancel:  () => void;
}) {
  const [bio,          setBio]          = useState(initial.bio);
  const [hourlyRate,   setHourlyRate]   = useState(initial.hourlyRate);
  const [availability, setAvailability] = useState(initial.availability);
  const [role,         setRole]         = useState(initial.role);
  const [skills,       setSkills]       = useState(new Map(initial.skills));
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  function handleSkillChange(tagId: string, proficiency: number | null) {
    setSkills((prev) => {
      const next = new Map(prev);
      if (proficiency === null) next.delete(tagId);
      else next.set(tagId, proficiency);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const profileData: UpdateProfileRequest = {
        availability: availability as UpdateProfileRequest["availability"],
        role:         role         as UpdateProfileRequest["role"],
      };
      if (bio.trim()) profileData.bio = bio.trim();
      if (hourlyRate)  profileData.hourly_rate_cents = Math.round(parseFloat(hourlyRate) * 100);

      const skillPayload = [...skills.entries()].map(([tag_id, proficiency]) => ({ tag_id, proficiency }));
      await Promise.all([
        updateProfile(profileId, profileData),
        updateTalentSkills(profileId, skillPayload),
      ]);
    } catch {
      setError("Backend offline — changes shown locally.");
    }

    // Build local skill objects from allTags for immediate UI update
    const updatedSkills: TalentSkill[] = [...skills.entries()].map(([tag_id, proficiency]) => {
      const tag = allTags.find((t) => t.id === tag_id);
      return { tag_id, tag: tag?.tag ?? "", domain: tag?.domain ?? "", proficiency, verified_at: null };
    });

    setSaving(false);
    onSaved({ bio: bio.trim(), hourlyRate, availability, role, skills: updatedSkills });
  }

  return (
    <div className="space-y-5">
      {/* Bio */}
      <div className="space-y-1.5">
        <label className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">Bio</label>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={3}
          placeholder="Describe your expertise, stack, and what projects you enjoy..."
          className="w-full px-3 py-2 rounded-sm border border-zinc-700 bg-zinc-900
                     text-zinc-100 text-xs placeholder:text-zinc-600 font-mono resize-none
                     focus:outline-none focus:border-amber-400/50 transition-colors"
        />
      </div>

      {/* Hourly rate */}
      <div className="space-y-1.5">
        <label className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">Hourly Rate (USD)</label>
        <div className="relative">
          <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-500" />
          <input
            type="number"
            value={hourlyRate}
            onChange={(e) => setHourlyRate(e.target.value)}
            placeholder="150"
            min="0"
            step="5"
            className="w-full h-9 pl-8 pr-3 rounded-sm border border-zinc-700 bg-zinc-900
                       text-zinc-100 text-xs placeholder:text-zinc-600 font-mono
                       focus:outline-none focus:border-amber-400/50 transition-colors"
          />
        </div>
      </div>

      {/* Availability */}
      <div className="space-y-1.5">
        <label className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">Availability</label>
        <div className="flex gap-2">
          {(["available", "busy", "not-available"] as const).map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setAvailability(a)}
              className={`h-8 px-3 rounded-sm border font-mono text-xs transition-all ${
                availability === a
                  ? a === "available"
                    ? "border-emerald-600/60 bg-emerald-500/10 text-emerald-400"
                    : a === "busy"
                    ? "border-amber-600/60 bg-amber-500/10 text-amber-400"
                    : "border-zinc-600 bg-zinc-700 text-zinc-300"
                  : "border-zinc-700 bg-zinc-900 text-zinc-500 hover:border-zinc-600"
              }`}
            >
              {a.replace("-", " ")}
            </button>
          ))}
        </div>
      </div>

      {/* Role */}
      <div className="space-y-1.5">
        <label className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">Primary Role</label>
        <div className="flex gap-2">
          {(["talent", "client", "agent-owner"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRole(r)}
              className={`h-8 px-3 rounded-sm border font-mono text-xs transition-all ${
                role === r
                  ? "border-amber-400/60 bg-amber-400/10 text-amber-400"
                  : "border-zinc-700 bg-zinc-900 text-zinc-500 hover:border-zinc-600"
              }`}
            >
              {r.replace("-", " ")}
            </button>
          ))}
        </div>
      </div>

      {/* Skills */}
      <div className="space-y-1.5">
        <label className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">Skills</label>
        {allTags.length > 0 ? (
          <SkillPicker allTags={allTags} current={skills} onChange={handleSkillChange} />
        ) : (
          <p className="font-mono text-xs text-zinc-600">
            Loading skill tags… (marketplace service must be running)
          </p>
        )}
        <p className="font-mono text-[10px] text-zinc-600">
          {skills.size} skill{skills.size !== 1 ? "s" : ""} selected — click a tag to toggle, then set proficiency
        </p>
      </div>

      {error && (
        <p className="font-mono text-[10px] text-amber-400 border border-amber-900 bg-amber-950/20 px-2 py-1.5 rounded-sm">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 h-10 flex items-center justify-center gap-2 rounded-sm
                     bg-amber-400 hover:bg-amber-300 disabled:bg-zinc-700 disabled:text-zinc-500
                     text-zinc-950 font-mono text-xs font-medium transition-all active:scale-[0.98]"
        >
          {saving
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</>
            : <><Save className="w-3.5 h-3.5" /> Save profile</>}
        </button>
        <button
          onClick={onCancel}
          className="h-10 px-4 rounded-sm border border-zinc-700 text-zinc-400
                     font-mono text-xs hover:border-zinc-600 hover:text-zinc-300 transition-all"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const DEMO_ACTIVITY = [
  { id: "a1", label: "Signed in via OAuth",            at: "just now", success: true  },
  { id: "a2", label: "Profile created",                at: "just now", success: true  },
  { id: "a3", label: "DataSync Agent v2.1 deployed",   at: "2h ago",   success: true  },
  { id: "a4", label: "LogAudit Sentinel — DoD passed", at: "1d ago",   success: true  },
  { id: "a5", label: "Smoke test — remediated",        at: "3d ago",   success: false },
];

export default function ProfilePage() {
  const { data: session, status } = useSession();

  const [editing,         setEditing]         = useState(false);
  const [allTags,         setAllTags]         = useState<SkillTag[]>([]);
  const [currentSkills,   setCurrentSkills]   = useState<TalentSkill[]>([]);
  const [bio,             setBio]             = useState("");
  const [hourlyRate,      setHourlyRate]      = useState("");
  const [availability,    setAvailability]    = useState("available");
  const [role,            setRole]            = useState("talent");
  const [zkLoading,       setZkLoading]       = useState(false);
  const [zkError,         setZkError]         = useState<string | null>(null);
  const [attesting,       setAttesting]       = useState(false);
  const [attestMsg,       setAttestMsg]       = useState<string | null>(null);
  const [liveScore,       setLiveScore]       = useState<number | null>(null);
  const [liveTier,        setLiveTier]        = useState<string | null>(null);

  const profileId = session?.user?.profileId;

  useEffect(() => {
    if (!profileId) return;
    fetchSkillTags()
      .then(({ skill_tags }) => setAllTags(skill_tags))
      .catch(() => {});
    fetchTalentSkills(profileId)
      .then(({ skills }) => setCurrentSkills(skills))
      .catch(() => {});
  }, [profileId]);

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="w-4 h-4 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!session?.user) return null;

  const user        = session.user;
  const tierStr     = liveTier ?? user.identityTier;
  const tier        = tierToNum(tierStr);
  const primaryRole = role || (user.roles?.[0] as string) || "talent";
  const stats       = ROLE_STATS[primaryRole] ?? ROLE_STATS.talent;
  const trustScore  = liveScore ?? user.trustScore ?? 0;

  async function handleOpenWallet() {
    if (!profileId) return;
    setZkLoading(true);
    setZkError(null);
    try {
      const { wallet_deep_link } = await requestNonce(profileId);
      window.open(wallet_deep_link, "_blank");
    } catch {
      setZkError("Nonce service unavailable — try again shortly.");
    } finally {
      setZkLoading(false);
    }
  }

  async function handleAttestSkills() {
    if (!profileId) return;
    setAttesting(true);
    setAttestMsg(null);
    try {
      const { attested } = await attestSkills(profileId);
      setCurrentSkills((prev) =>
        prev.map((s) => ({ ...s, verified_at: s.verified_at ?? new Date().toISOString() })),
      );
      setAttestMsg(attested > 0 ? `${attested} skill${attested !== 1 ? "s" : ""} self-attested ✓` : "All skills already attested.");
    } catch {
      setAttestMsg("Backend offline — attestation noted locally.");
      setCurrentSkills((prev) =>
        prev.map((s) => ({ ...s, verified_at: s.verified_at ?? new Date().toISOString() })),
      );
    } finally {
      setAttesting(false);
    }
  }

  function handleDisconnect(_provider: string, newScore: number, newTier: string) {
    setLiveScore(newScore);
    setLiveTier(newTier);
  }

  const currentSkillMap = new Map<string, number>(
    currentSkills.map((s) => [s.tag_id, s.proficiency]),
  );

  function handleSaved(data: { bio: string; hourlyRate: string; availability: string; role: string; skills: TalentSkill[] }) {
    setBio(data.bio);
    setHourlyRate(data.hourlyRate);
    setAvailability(data.availability);
    setRole(data.role);
    setCurrentSkills(data.skills);
    setEditing(false);
  }

  return (
    <div className="min-h-screen bg-zinc-950">

      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur-sm">
        <div className="max-w-2xl mx-auto px-4 h-12 flex items-center gap-3">
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 text-zinc-500 hover:text-zinc-300 transition-colors font-mono text-xs"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Dashboard
          </Link>
          <span className="text-zinc-800">/</span>
          <span className="font-mono text-xs text-zinc-400">Profile</span>
          <div className="ml-auto flex items-center gap-2">
            <TrustScoreBadge score={trustScore} biometricVerified={tier === 2} />
            {!editing && (
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-1.5 h-7 px-3 rounded-sm border border-zinc-700
                           text-zinc-400 font-mono text-xs hover:border-zinc-500 hover:text-zinc-200 transition-colors"
              >
                <Pencil className="w-3 h-3" /> Edit
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">

        {/* Tier 0 banner */}
        {tier === 0 && (
          <div className="flex items-start gap-3 px-4 py-3 rounded-sm border border-amber-900 bg-amber-950/20">
            <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-mono text-xs text-amber-400 font-medium">
                Connect GitHub or LinkedIn to receive job matches
              </p>
              <p className="font-mono text-[10px] text-amber-700 mt-0.5">
                Google sign-in grants browse access only (Tier 0). Add GitHub (+30 pts) or LinkedIn (+15 pts) to unlock jobs.
              </p>
            </div>
          </div>
        )}

        {/* Identity card */}
        <div className="border border-zinc-800 rounded-sm bg-zinc-900 p-4">
          <div className="flex items-start gap-4">
            {user.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.image} alt={user.name ?? ""} className="w-12 h-12 rounded-sm border border-zinc-700 object-cover flex-shrink-0" />
            ) : (
              <div className="w-12 h-12 rounded-sm bg-zinc-800 border border-zinc-700 flex items-center justify-center flex-shrink-0">
                <span className="font-mono text-base font-medium text-zinc-300">
                  {(user.name ?? "?").split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)}
                </span>
              </div>
            )}
            <div className="flex-1 min-w-0 space-y-1">
              <p className="font-mono text-sm font-medium text-zinc-100">{user.name}</p>
              <p className="font-mono text-xs text-zinc-500 truncate">{user.email}</p>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-[10px] capitalize border border-zinc-700 text-zinc-400 px-1.5 py-0.5 rounded-sm">
                  {primaryRole.replace("-", " ")}
                </span>
                {availability !== "available" && (
                  <span className={`font-mono text-[10px] border px-1.5 py-0.5 rounded-sm capitalize ${
                    availability === "busy"
                      ? "border-amber-800 text-amber-500"
                      : "border-zinc-700 text-zinc-500"
                  }`}>
                    {availability.replace("-", " ")}
                  </span>
                )}
                {hourlyRate && (
                  <span className="font-mono text-[10px] text-zinc-500">${hourlyRate}/hr</span>
                )}
              </div>
              {bio && <p className="font-mono text-xs text-zinc-400 leading-relaxed">{bio}</p>}
            </div>
          </div>

          {/* Trust score bar */}
          <div className="mt-4 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">Trust Score</span>
              <span className="font-mono text-[10px] text-zinc-400 tabular-nums">{trustScore} / 100</span>
            </div>
            <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div className="h-full bg-amber-400 rounded-full transition-all duration-700" style={{ width: `${trustScore}%` }} />
            </div>
            <p className="font-mono text-[10px] text-zinc-600">GitHub +30 · LinkedIn +15 · Biometric ZK +40</p>
          </div>
        </div>

        {/* Edit form */}
        {editing && profileId && (
          <div className="border border-amber-900/40 rounded-sm bg-zinc-900 p-4">
            <p className="font-mono text-xs text-zinc-400 uppercase tracking-widest mb-4">Edit Profile</p>
            <EditForm
              profileId={profileId}
              initial={{ bio, hourlyRate, availability, role, skills: currentSkillMap }}
              allTags={allTags}
              onSaved={handleSaved}
              onCancel={() => setEditing(false)}
            />
          </div>
        )}

        {/* Skills (view mode) */}
        {!editing && currentSkills.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="font-mono text-xs text-zinc-500 uppercase tracking-widest">Skills</p>
              <button
                onClick={handleAttestSkills}
                disabled={attesting}
                className="flex items-center gap-1.5 h-6 px-2.5 rounded-sm border border-zinc-700
                           text-zinc-400 font-mono text-[10px] hover:border-zinc-500 hover:text-zinc-200
                           disabled:opacity-40 transition-colors"
              >
                {attesting
                  ? <><Loader2 className="w-3 h-3 animate-spin" /> Attesting…</>
                  : <><Shield className="w-3 h-3" /> Attest skills</>}
              </button>
            </div>
            {attestMsg && (
              <p className="font-mono text-[10px] text-emerald-500 border border-emerald-900 bg-emerald-950/20 px-2 py-1 rounded-sm">
                {attestMsg}
              </p>
            )}
            <div className="flex flex-wrap gap-1.5">
              {currentSkills.map((s) => (
                <div key={s.tag_id} className="flex items-center gap-1 h-7 px-2.5 rounded-sm border border-amber-400/40 bg-amber-400/5">
                  {s.verified_at && <CheckCircle2 className="w-3 h-3 text-emerald-500 flex-shrink-0" />}
                  <span className="font-mono text-xs text-amber-400">{s.tag}</span>
                  <span className="font-mono text-[10px] text-amber-700">{PROF_LABELS[s.proficiency]}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Role stats */}
        {!editing && (
          <div className="grid grid-cols-3 gap-2">
            {stats.map(({ label, value, icon: Icon }) => (
              <div key={label} className="border border-zinc-800 rounded-sm bg-zinc-900 p-3 space-y-1">
                <div className="flex items-center gap-1.5">
                  <Icon className="w-3 h-3 text-zinc-600" />
                  <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-wider">{label}</p>
                </div>
                <p className="font-mono text-lg font-medium text-zinc-100 tabular-nums">{value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Vetting badge */}
        {!editing && (
          <div className="space-y-2">
            <p className="font-mono text-xs text-zinc-500 uppercase tracking-widest">Vetting Status</p>
            <VettingBadge tier={tier} expandable />
          </div>
        )}

        {/* Connected accounts */}
        {!editing && (
          <div className="space-y-2">
            <p className="font-mono text-xs text-zinc-500 uppercase tracking-widest">Connected Accounts</p>
            <ConnectedAccounts
              provider={user.provider ?? ""}
              profileId={profileId}
              onDisconnect={handleDisconnect}
            />
          </div>
        )}

        {/* Upgrade prompt */}
        {!editing && tier < 2 && (
          <div className="border border-amber-900 rounded-sm bg-amber-950/20 p-4 space-y-3">
            <p className="font-mono text-xs text-amber-400 uppercase tracking-widest">Upgrade to Tier {tier + 1}</p>
            <ul className="space-y-1.5">
              {tier === 0 ? [
                "Connect GitHub — unlocks technical job matching (+30 pts)",
                "Connect LinkedIn — unlocks consulting roles (+15 pts)",
              ] : [
                "Complete ZK biometric liveness proof via identity wallet",
                "Unlocks high-value contracts + auto escrow release",
              ].map((step) => (
                <li key={step} className="flex items-start gap-2 font-mono text-xs text-zinc-400">
                  <Clock className="w-3 h-3 text-amber-600 flex-shrink-0 mt-0.5" />
                  {step}
                </li>
              ))}
            </ul>
            {zkError && (
              <p className="font-mono text-[10px] text-red-400 border border-red-900 bg-red-950/20 px-2 py-1 rounded-sm">
                {zkError}
              </p>
            )}
            <button
              onClick={handleOpenWallet}
              disabled={zkLoading || tier >= 2}
              className="flex items-center gap-2 h-10 px-4 rounded-sm border border-amber-800 bg-amber-950
                         text-amber-400 font-mono text-xs uppercase tracking-widest
                         hover:border-amber-600 active:scale-[0.98] transition-all w-full justify-center
                         disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {zkLoading
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Requesting nonce…</>
                : <><Shield className="w-3.5 h-3.5" /> Open Identity Wallet</>}
            </button>
          </div>
        )}

        {/* Recent activity */}
        {!editing && (
          <div className="space-y-2">
            <p className="font-mono text-xs text-zinc-500 uppercase tracking-widest">Recent Activity</p>
            <div className="border border-zinc-800 rounded-sm bg-zinc-900 divide-y divide-zinc-800">
              {DEMO_ACTIVITY.map((ev) => (
                <div key={ev.id} className="flex items-center gap-3 px-3 py-2.5">
                  {ev.success
                    ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                    : <div className="w-3.5 h-3.5 rounded-full border border-amber-700 flex-shrink-0" />
                  }
                  <p className="font-mono text-xs text-zinc-300 flex-1 min-w-0 truncate">{ev.label}</p>
                  <span className="font-mono text-[10px] text-zinc-600 flex-shrink-0">{ev.at}</span>
                </div>
              ))}
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
