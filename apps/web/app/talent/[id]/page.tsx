"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import { Users, Share2, UserPlus, UserMinus, CheckCircle2, ArrowLeft } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Skill {
  tag:         string;
  domain:      string;
  proficiency: number;
  verified:    boolean;
}

interface PublicProfile {
  profile_id:        string;
  display_name:      string;
  role:              string | null;
  hidden:            boolean;
  follower_count:    number;
  // present when not hidden and privacy flags allow:
  bio?:              string | null;
  hourly_rate_cents?: number | null;
  availability?:     string;
  identity_tier?:    string;
  trust_score?:      number;
  skills?:           Skill[];
}

interface FollowState {
  following:      boolean;
  follower_count: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function initials(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return (words[0][0] ?? "?").toUpperCase();
  return ((words[0][0] ?? "") + (words[words.length - 1][0] ?? "")).toUpperCase();
}

function roleLabel(role: string | null): string | null {
  if (role === "talent")      return "Talent";
  if (role === "agent-owner") return "Agency Owner";
  if (role === "client")      return "Client";
  return null;
}

function availabilityColor(a: string): string {
  if (a === "available")     return "border-emerald-700 text-emerald-400";
  if (a === "busy")          return "border-amber-700 text-amber-400";
  return "border-zinc-700 text-zinc-500";
}

function tierLabel(tier: string): string {
  if (tier === "BIOMETRIC_VERIFIED") return "Biometric Verified";
  if (tier === "SOCIAL_VERIFIED")    return "Social Verified";
  return "Unverified";
}

function computeMilestones(profile: PublicProfile): string[] {
  const milestones: string[] = [];
  if (profile.identity_tier === "BIOMETRIC_VERIFIED") milestones.push("Biometric Verified");
  else if (profile.identity_tier === "SOCIAL_VERIFIED") milestones.push("Social Verified");
  const verifiedSkills = (profile.skills ?? []).filter((s) => s.verified).length;
  if (verifiedSkills >= 3) milestones.push(`${verifiedSkills} Skills Verified`);
  if ((profile.trust_score ?? 0) >= 75) milestones.push("Trust Score 75+");
  return milestones;
}

async function shareAchievement(displayName: string, milestone: string) {
  const url = window.location.href;
  const text = `${displayName} achieved "${milestone}" on AiStaff — the AI talent marketplace with ZK identity verification.`;
  if (typeof navigator.share === "function") {
    await navigator.share({ title: displayName, text, url }).catch(() => {});
  } else {
    await navigator.clipboard.writeText(`${text} ${url}`).catch(() => {});
  }
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function ProfileSkeleton() {
  return (
    <div className="animate-pulse space-y-4" aria-hidden="true">
      <div className="border border-zinc-800 rounded-sm bg-zinc-900 p-5">
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 rounded-sm bg-zinc-800 flex-shrink-0" />
          <div className="flex-1 space-y-2 pt-1">
            <div className="h-4 bg-zinc-800 rounded w-40" />
            <div className="h-3 bg-zinc-800 rounded w-24" />
            <div className="h-3 bg-zinc-800 rounded w-32" />
          </div>
        </div>
      </div>
      <div className="h-16 border border-zinc-800 rounded-sm bg-zinc-900" />
      <div className="h-24 border border-zinc-800 rounded-sm bg-zinc-900" />
    </div>
  );
}

// ── Proficiency dots ───────────────────────────────────────────────────────────

function ProficiencyDots({ value }: { value: number }) {
  return (
    <span className="flex gap-0.5" aria-label={`Proficiency ${value} of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={`w-2 h-2 rounded-full ${i <= value ? "bg-amber-400" : "bg-zinc-700"}`}
        />
      ))}
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TalentProfilePage() {
  const params   = useParams<{ id: string }>();
  const router   = useRouter();
  const { data: session } = useSession();

  const profileId = params.id;
  const sessionProfileId = (session?.user as { profileId?: string } | undefined)?.profileId;

  const [profile,     setProfile]     = useState<PublicProfile | null>(null);
  const [loadState,   setLoadState]   = useState<"loading" | "loaded" | "hidden" | "not-found" | "error">("loading");
  const [followState, setFollowState] = useState<FollowState>({ following: false, follower_count: 0 });
  const [following,   setFollowing]   = useState(false);

  // Load profile
  useEffect(() => {
    if (!profileId) return;
    fetch(`/api/talent/${profileId}`)
      .then((res) => {
        if (res.status === 404) { setLoadState("not-found"); return null; }
        if (!res.ok)            { setLoadState("error");     return null; }
        return res.json() as Promise<PublicProfile>;
      })
      .then((data) => {
        if (!data) return;
        setProfile(data);
        setFollowState((prev) => ({ ...prev, follower_count: data.follower_count }));
        setLoadState(data.hidden ? "hidden" : "loaded");
      })
      .catch(() => setLoadState("error"));
  }, [profileId]);

  // Load follow state for authenticated users
  useEffect(() => {
    if (!profileId || !sessionProfileId || sessionProfileId === profileId) return;
    fetch(`/api/talent/${profileId}/follow`)
      .then((res) => res.ok ? res.json() as Promise<FollowState> : null)
      .then((data) => {
        if (!data) return;
        setFollowState(data);
        setFollowing(data.following);
      })
      .catch(() => {});
  }, [profileId, sessionProfileId]);

  const handleFollow = useCallback(async () => {
    if (!sessionProfileId) { router.push("/login"); return; }
    const res = await fetch(`/api/talent/${profileId}/follow`, { method: "POST" });
    if (!res.ok) return;
    const data = await res.json() as FollowState;
    setFollowState(data);
    setFollowing(data.following);
  }, [profileId, sessionProfileId, router]);

  const isOwnProfile = sessionProfileId === profileId;

  // ── Not Found ─────────────────────────────────────────────────────────────

  if (loadState === "not-found") {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
        <div className="text-center space-y-3">
          <p className="font-mono text-sm text-zinc-300">Profile not found.</p>
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1.5 font-mono text-xs text-amber-400 hover:text-amber-300 mx-auto"
          >
            <ArrowLeft className="w-3 h-3" /> Go back
          </button>
        </div>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────

  if (loadState === "error") {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
        <p className="font-mono text-sm text-zinc-400" role="alert">
          Could not load profile. Please try again.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur-sm">
        <div className="max-w-2xl mx-auto px-4 h-12 flex items-center gap-3">
          <button
            onClick={() => router.back()}
            aria-label="Go back"
            className="flex items-center gap-1.5 font-mono text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>
          <span className="font-mono text-xs text-zinc-400">Profile</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4 pb-24">

        {/* Loading state */}
        {loadState === "loading" && (
          <div aria-busy="true" aria-label="Loading profile">
            <ProfileSkeleton />
          </div>
        )}

        {/* Hidden profile */}
        {loadState === "hidden" && profile && (
          <div className="border border-zinc-800 rounded-sm bg-zinc-900 p-5 space-y-4">
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-sm bg-zinc-800 border border-zinc-700
                              flex items-center justify-center flex-shrink-0">
                <span className="font-mono text-xl font-medium text-zinc-300">
                  {initials(profile.display_name)}
                </span>
              </div>
              <div className="flex-1 space-y-1.5">
                <p className="font-mono text-base font-medium text-zinc-100">
                  {profile.display_name}
                </p>
                {roleLabel(profile.role) && (
                  <span className="inline-block font-mono text-[10px] border border-zinc-700
                                   text-zinc-400 px-1.5 py-0.5 rounded-sm">
                    {roleLabel(profile.role)}
                  </span>
                )}
              </div>
            </div>
            <p className="font-mono text-xs text-zinc-500">
              This talent has chosen to keep their profile private.
            </p>
            {!isOwnProfile && (
              <FollowButton
                following={following}
                followerCount={followState.follower_count}
                onFollow={handleFollow}
              />
            )}
          </div>
        )}

        {/* Loaded profile */}
        {loadState === "loaded" && profile && (
          <>
            {/* Identity card */}
            <div className="border border-zinc-800 rounded-sm bg-zinc-900 p-5 space-y-4">
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 rounded-sm bg-zinc-800 border border-zinc-700
                                flex items-center justify-center flex-shrink-0">
                  <span className="font-mono text-xl font-medium text-zinc-300">
                    {initials(profile.display_name)}
                  </span>
                </div>
                <div className="flex-1 min-w-0 space-y-1.5">
                  <p className="font-mono text-base font-medium text-zinc-100">
                    {profile.display_name}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    {roleLabel(profile.role) && (
                      <span className="font-mono text-[10px] border border-zinc-700
                                       text-zinc-400 px-1.5 py-0.5 rounded-sm">
                        {roleLabel(profile.role)}
                      </span>
                    )}
                    {profile.availability && (
                      <span className={`font-mono text-[10px] border px-1.5 py-0.5 rounded-sm capitalize
                                        ${availabilityColor(profile.availability)}`}>
                        {profile.availability.replace("-", " ")}
                      </span>
                    )}
                    {profile.hourly_rate_cents != null && (
                      <span className="font-mono text-[10px] text-zinc-500">
                        ${Math.round(profile.hourly_rate_cents / 100)}/hr
                      </span>
                    )}
                  </div>
                  {profile.bio && (
                    <p className="font-mono text-xs text-zinc-400 leading-relaxed">
                      {profile.bio}
                    </p>
                  )}
                </div>
              </div>

              {/* Follow row */}
              {!isOwnProfile && (
                <FollowButton
                  following={following}
                  followerCount={followState.follower_count}
                  onFollow={handleFollow}
                />
              )}
              {isOwnProfile && followState.follower_count > 0 && (
                <div className="flex items-center gap-1.5 font-mono text-xs text-zinc-500">
                  <Users className="w-3.5 h-3.5" />
                  {followState.follower_count} follower{followState.follower_count !== 1 ? "s" : ""}
                </div>
              )}
            </div>

            {/* Trust score */}
            {profile.trust_score != null && profile.identity_tier && (
              <div className="border border-zinc-800 rounded-sm bg-zinc-900 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
                    Trust Score
                  </span>
                  <span className="font-mono text-[10px] text-zinc-400 tabular-nums">
                    {profile.trust_score} / 100
                  </span>
                </div>
                <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-400 rounded-full transition-all"
                    style={{ width: `${profile.trust_score}%` }}
                  />
                </div>
                <span className="inline-block font-mono text-[10px] border border-zinc-700
                                 text-zinc-400 px-1.5 py-0.5 rounded-sm">
                  {tierLabel(profile.identity_tier)}
                </span>
              </div>
            )}

            {/* Skills */}
            {(profile.skills ?? []).length > 0 && (
              <div className="border border-zinc-800 rounded-sm bg-zinc-900 p-4 space-y-3">
                <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
                  Skills
                </p>
                <div className="space-y-2">
                  {(profile.skills ?? []).map((skill) => (
                    <div key={skill.tag} className="flex items-center gap-3">
                      <span className="font-mono text-xs text-zinc-200 w-28 truncate">
                        {skill.tag}
                      </span>
                      <ProficiencyDots value={skill.proficiency} />
                      {skill.verified && (
                        <span className="flex items-center gap-1 font-mono text-[10px] text-emerald-400">
                          <CheckCircle2 className="w-3 h-3" /> Verified
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Milestones */}
            <MilestoneSection profile={profile} />
          </>
        )}
      </main>
    </div>
  );
}

// ── Follow Button ─────────────────────────────────────────────────────────────

function FollowButton({
  following,
  followerCount,
  onFollow,
}: {
  following:     boolean;
  followerCount: number;
  onFollow:      () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={onFollow}
        className={`flex items-center gap-1.5 h-8 px-3 rounded-sm border font-mono text-xs transition-all ${
          following
            ? "border-amber-400/40 bg-amber-400/10 text-amber-400 hover:bg-amber-400/5"
            : "border-zinc-700 text-zinc-300 hover:border-amber-400/40 hover:text-amber-400"
        }`}
        aria-label={following ? "Unfollow" : "Follow"}
      >
        {following
          ? <><UserMinus className="w-3.5 h-3.5" /> Following</>
          : <><UserPlus className="w-3.5 h-3.5" /> Follow</>}
      </button>
      {followerCount > 0 && (
        <span className="flex items-center gap-1 font-mono text-xs text-zinc-500">
          <Users className="w-3.5 h-3.5" />
          {followerCount} follower{followerCount !== 1 ? "s" : ""}
        </span>
      )}
    </div>
  );
}

// ── Milestones ────────────────────────────────────────────────────────────────

function MilestoneSection({ profile }: { profile: PublicProfile }) {
  const milestones = computeMilestones(profile);
  if (milestones.length === 0) return null;

  return (
    <div className="border border-zinc-800 rounded-sm bg-zinc-900 p-4 space-y-3">
      <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
        Milestones
      </p>
      <div className="space-y-2">
        {milestones.map((milestone) => (
          <div key={milestone} className="flex items-center justify-between">
            <span className="font-mono text-xs text-zinc-200">{milestone}</span>
            <button
              onClick={() => shareAchievement(profile.display_name, milestone)}
              className="flex items-center gap-1 h-6 px-2 rounded-sm border border-zinc-700
                         font-mono text-[10px] text-zinc-500 hover:border-amber-400/40
                         hover:text-amber-400 transition-colors"
              aria-label={`Share ${milestone}`}
            >
              <Share2 className="w-3 h-3" /> Share
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
