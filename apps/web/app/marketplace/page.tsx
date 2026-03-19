"use client";

import { useEffect, useRef, useState } from "react";
import { useSession, signIn } from "next-auth/react";
import {
  Package, Cpu, Hash, ChevronRight, CheckCircle,
  Users, Bot, Zap, Building2, User, Plus, X,
  AlertTriangle, Github, Linkedin, Handshake, Loader2, MessageSquare,
} from "lucide-react";
import {
  fetchListings, createListing, expressInterest, fetchPublicProfile,
  fetchListingRequiredSkills, fetchTalentSkills,
  type AgentListing, type ListingCategory, type SellerType, type SkillTag,
} from "@/lib/api";
import { AppSidebar, AppMobileNav } from "@/components/AppSidebar";
import { VettingBadge }  from "@/components/VettingBadge";
import { ShareButton }   from "@/components/ShareSheet";
import type { VettingTier } from "@/components/VettingBadge";

function tierStringToNum(t: string | undefined): VettingTier {
  if (t === "SOCIAL_VERIFIED")    return 1;
  if (t === "BIOMETRIC_VERIFIED") return 2;
  return 0;
}

// ── Category + seller config ───────────────────────────────────────────────

type CategoryFilter = "All" | ListingCategory;
type SellerFilter   = "All" | SellerType;

const CATEGORY_META: Record<ListingCategory, { icon: React.ElementType; label: string; color: string }> = {
  AiTalent: { icon: Users,   label: "AiTalent", color: "text-sky-400 border-sky-900"    },
  AiStaff:  { icon: Bot,     label: "AiStaff",  color: "text-amber-400 border-amber-900" },
  AiRobot:  { icon: Zap,     label: "AiRobot",  color: "text-violet-400 border-violet-900" },
};

const SELLER_META: Record<SellerType, { icon: React.ElementType; label: string }> = {
  Agency:     { icon: Building2, label: "Agency"     },
  Freelancer: { icon: User,      label: "Freelancer" },
};

// ── Demo listings ──────────────────────────────────────────────────────────

const DEMO_LISTINGS: AgentListing[] = [
  {
    id:           "a6000001-0000-0000-0000-a1a1a1a1a1a1",
    developer_id: "de000001-0000-0000-0000-111111111111",
    name:         "DataSync Agent v2.1",
    description:  "Bidirectional ETL sync between PostgreSQL and S3. Handles schema drift, deduplication, and incremental loads. 99.9% SLA.",
    wasm_hash:    "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
    price_cents:  249900,
    active:       true,
    category:     "AiStaff",
    seller_type:  "Agency",
    slug:         "datasync-agent-v2-1",
    created_at:   "2026-02-01T00:00:00Z",
    updated_at:   "2026-02-01T00:00:00Z",
  },
  {
    id:           "a6000002-0000-0000-0000-b2b2b2b2b2b2",
    developer_id: "de000002-0000-0000-0000-222222222222",
    name:         "LogAudit Sentinel",
    description:  "Real-time log ingestion, anomaly detection, and compliance tagging for SOC 2 / ISO 27001 environments. Outputs structured alerts.",
    wasm_hash:    "b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3",
    price_cents:  149900,
    active:       true,
    category:     "AiStaff",
    seller_type:  "Freelancer",
    slug:         "logaudit-sentinel",
    created_at:   "2026-02-10T00:00:00Z",
    updated_at:   "2026-02-10T00:00:00Z",
  },
  {
    id:           "a6000003-0000-0000-0000-c3c3c3c3c3c3",
    developer_id: "de000001-0000-0000-0000-111111111111",
    name:         "HireAssist Pro",
    description:  "AI-driven candidate screening, skills verification, and interview scheduling. Integrates with LinkedIn, GitHub, and ATS systems.",
    wasm_hash:    "c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
    price_cents:  189900,
    active:       true,
    category:     "AiTalent",
    seller_type:  "Agency",
    slug:         "hireassist-pro",
    created_at:   "2026-02-15T00:00:00Z",
    updated_at:   "2026-02-15T00:00:00Z",
  },
  {
    id:           "a6000004-0000-0000-0000-d4d4d4d4d4d4",
    developer_id: "de000003-0000-0000-0000-333333333333",
    name:         "K8s Scaler Agent",
    description:  "Autonomous HPA tuning for Kubernetes workloads. Reads Prometheus metrics and adjusts replica counts within user-defined bounds.",
    wasm_hash:    "d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5",
    price_cents:  349900,
    active:       true,
    category:     "AiRobot",
    seller_type:  "Agency",
    slug:         "k8s-scaler-agent",
    created_at:   "2026-02-20T00:00:00Z",
    updated_at:   "2026-02-20T00:00:00Z",
  },
  {
    id:           "a6000005-0000-0000-0000-e5e5e5e5e5e5",
    developer_id: "de000002-0000-0000-0000-222222222222",
    name:         "SecretRotator",
    description:  "Zero-downtime rotation of database passwords, API keys, and TLS certificates across AWS Secrets Manager, Vault, and Kubernetes secrets.",
    wasm_hash:    "e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6",
    price_cents:  199900,
    active:       true,
    category:     "AiStaff",
    seller_type:  "Freelancer",
    slug:         "secretrotator",
    created_at:   "2026-02-25T00:00:00Z",
    updated_at:   "2026-02-25T00:00:00Z",
  },
  {
    id:           "a6000006-0000-0000-0000-f6f6f6f6f6f6",
    developer_id: "de000003-0000-0000-0000-333333333333",
    name:         "RoboticArm Calibrator",
    description:  "Vision-guided calibration and trajectory planning for 6-DOF robotic arms. Supports FANUC, ABB, and UR hardware via Wasm bridge.",
    wasm_hash:    "f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1",
    price_cents:  549900,
    active:       true,
    category:     "AiRobot",
    seller_type:  "Freelancer",
    slug:         "roboticarm-calibrator",
    created_at:   "2026-03-01T00:00:00Z",
    updated_at:   "2026-03-01T00:00:00Z",
  },
  {
    id:           "a6000007-0000-0000-0000-a7a7a7a7a7a7",
    developer_id: "de000001-0000-0000-0000-111111111111",
    name:         "ContractReviewer",
    description:  "Extracts risk clauses, compares against template SOWs, and flags deviations. Outputs structured diff with severity ratings.",
    wasm_hash:    "77a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1",
    price_cents:  129900,
    active:       true,
    category:     "AiTalent",
    seller_type:  "Freelancer",
    slug:         "contractreviewer",
    created_at:   "2026-03-03T00:00:00Z",
    updated_at:   "2026-03-03T00:00:00Z",
  },
];

// ── Developer vetting tiers (demo) ─────────────────────────────────────────
// Maps developer_id → their identity tier for badge display

const DEV_TIERS: Record<string, VettingTier> = {
  "de000001-0000-0000-0000-111111111111": 2,  // Agency — fully vetted
  "de000002-0000-0000-0000-222222222222": 1,  // Freelancer — social verified
};

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtUSD(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: 0,
  }).format(cents / 100);
}

function shortHash(hash: string) {
  return `sha256:${hash.slice(0, 8)}…`;
}

// ── Category badge (inline) ────────────────────────────────────────────────

function CategoryBadge({ category }: { category: ListingCategory }) {
  const { icon: Icon, label, color } = CATEGORY_META[category];
  return (
    <span className={`inline-flex items-center gap-1 font-mono text-[10px] px-1.5 py-0.5 border rounded-sm ${color}`}>
      <Icon className="w-2.5 h-2.5" />
      {label}
    </span>
  );
}

function SellerBadge({ sellerType }: { sellerType: SellerType }) {
  const { icon: Icon, label } = SELLER_META[sellerType];
  return (
    <span className="inline-flex items-center gap-1 font-mono text-[10px] px-1.5 py-0.5 border border-zinc-700 rounded-sm text-zinc-400">
      <Icon className="w-2.5 h-2.5" />
      {label}
    </span>
  );
}

// ── Tier gate bottom sheet ─────────────────────────────────────────────────

function TierGateSheet({ onClose }: { onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60" onClick={onClose} />
      <div className="fixed z-50 bottom-0 left-0 right-0 rounded-t-sm
                      bg-zinc-950 border-t border-zinc-800 p-5 space-y-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-mono text-sm text-amber-400 font-medium">
              Verification required to deploy
            </p>
            <p className="font-mono text-xs text-zinc-500 mt-1">
              Connect GitHub (technical roles) or LinkedIn (consulting roles)
              to receive job matches and deploy agents.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => signIn("github")}
            className="flex items-center justify-center gap-2 h-11 rounded-sm
                       border border-zinc-700 bg-zinc-900 hover:bg-zinc-800
                       font-mono text-xs text-zinc-200 transition-all active:scale-[0.98]"
          >
            <Github className="w-4 h-4" /> Connect GitHub
          </button>
          <button
            onClick={() => signIn("linkedin")}
            className="flex items-center justify-center gap-2 h-11 rounded-sm
                       border border-zinc-700 bg-zinc-900 hover:bg-zinc-800
                       font-mono text-xs text-zinc-200 transition-all active:scale-[0.98]"
          >
            <Linkedin className="w-4 h-4" /> Connect LinkedIn
          </button>
        </div>
        <button onClick={onClose}
          className="w-full font-mono text-xs text-zinc-600 hover:text-zinc-400 transition-colors">
          Cancel
        </button>
      </div>
    </>
  );
}

// ── Shared action button logic ─────────────────────────────────────────────

type MarketView = "client" | "freelancer";

interface ActionButtonProps {
  listing:    AgentListing;
  userTier:   string;
  profileId:  string;
  marketView: MarketView;
  compact?:   boolean;
}

function ActionButton({ listing, userTier, profileId, marketView, compact }: ActionButtonProps) {
  const [done,        setDone]        = useState<string | null>(null); // deployment_id | "applied"
  const [busy,        setBusy]        = useState(false);
  const [showGate,    setShowGate]    = useState(false);
  const [offlineNote, setOfflineNote] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);

  async function handleFreelancer() {
    if (userTier === "UNVERIFIED") { setShowGate(true); return; }
    setBusy(true);
    try {
      await expressInterest(listing.id, profileId, []);
      setDone("applied");
    } catch {
      setDone("applied");
      setOfflineNote(true);
    } finally {
      setBusy(false);
    }
  }

  async function handleDeploy() {
    if (userTier === "UNVERIFIED") { setShowGate(true); return; }
    setDeployError(null);
    setBusy(true);
    try {
      // Guard: price must be set
      const amountCents = listing.price_cents ?? 0;
      if (amountCents < 100) {
        setDeployError("Listing has no price set. Contact support.");
        setBusy(false);
        return;
      }
      // Guard: client_id must be a real profile (not fallback zero UUID)
      if (!profileId || profileId === "00000000-0000-0000-0000-000000000000") {
        setDeployError("Profile not loaded — please refresh and try again.");
        setBusy(false);
        return;
      }

      // Call N-Genius checkout — server auto-detects currency from CF-IPCountry:
      // UAE (AE) → AED, all others → USD
      const res = await fetch("/api/network-intl/checkout", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount_cents: amountCents,
          listing_id:   listing.id,
          agent_name:   listing.name,
          client_id:    profileId,
        }),
      });
      const data = await res.json() as { payment_url?: string; error?: string; currency?: string };
      if (!res.ok || !data.payment_url) {
        const msg = data.error ?? `Server error ${res.status}`;
        console.error("[deploy] checkout failed:", msg);
        setDeployError(msg);
        setBusy(false);
        return;
      }
      // Redirect to N-Genius hosted payment page
      // On completion, N-Genius redirects back to /api/network-intl/callback
      // which creates the deployment and sends user to /dashboard
      window.location.href = data.payment_url;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error — try again.";
      console.error("[deploy] unexpected error:", err);
      setDeployError(msg);
      setBusy(false);
    }
  }

  const h  = compact ? "h-7" : "h-8";
  const px = compact ? "px-2" : "px-3";

  if (done) {
    if (done === "applied") {
      return (
        <span className="flex items-center gap-1 font-mono text-xs text-emerald-400">
          <CheckCircle className="w-3 h-3" />
          {offlineNote ? <span className="text-amber-400">Noted locally</span> : "Applied ✓"}
        </span>
      );
    }
    // done = deployment_id — show confirmation + Collaborate link
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <span className="flex items-center gap-1 font-mono text-xs text-emerald-400">
          <CheckCircle className="w-3 h-3" /> Deployed
        </span>
        <a
          href={`/collab?deployment_id=${done}`}
          className="flex items-center gap-1 font-mono text-[10px] text-amber-400 border border-amber-900 bg-amber-950/40 px-2 h-6 rounded-sm hover:border-amber-700 transition-colors"
        >
          <MessageSquare className="w-2.5 h-2.5" /> Collaborate
        </a>
      </div>
    );
  }

  return (
    <>
      {marketView === "freelancer" ? (
        <button
          onClick={handleFreelancer}
          disabled={busy}
          className={`flex items-center gap-1 ${px} ${h} rounded-sm border border-sky-900
                     bg-sky-950 text-sky-400 font-mono text-xs uppercase tracking-widest
                     hover:border-sky-700 active:scale-[0.97] transition-all disabled:opacity-40`}
        >
          {busy ? "…" : <><Handshake className="w-3 h-3" /> Apply</>}
        </button>
      ) : (
        <div className="flex flex-col items-start gap-0.5">
          <button
            onClick={handleDeploy}
            disabled={busy}
            className={`flex items-center gap-1 ${px} ${h} rounded-sm border border-amber-900
                       bg-amber-950 text-amber-400 font-mono text-xs uppercase tracking-widest
                       hover:border-amber-700 active:scale-[0.97] transition-all disabled:opacity-40`}
          >
            {busy
              ? <><Loader2 className="w-3 h-3 animate-spin" /> Preparing…</>
              : <>Deploy <ChevronRight className="w-3 h-3" /></>
            }
          </button>
          {deployError && (
            <span className="flex items-start gap-1 text-[10px] font-mono text-red-400 max-w-[200px] leading-tight">
              <AlertTriangle className="w-3 h-3 mt-px flex-shrink-0" />
              {deployError}
            </span>
          )}
        </div>
      )}

      {showGate && <TierGateSheet onClose={() => setShowGate(false)} />}
    </>
  );
}

// ── Listing detail bottom sheet ────────────────────────────────────────────
// Opens when the user taps/clicks the listing name on either mobile or desktop.

function ListingDetailSheet({ listing, userTier, profileId, marketView, onClose }: {
  listing:    AgentListing;
  userTier:   string;
  profileId:  string;
  marketView: MarketView;
  onClose:    () => void;
}) {
  const [reqSkills,    setReqSkills]    = useState<SkillTag[]>([]);
  const [myTagIds,     setMyTagIds]     = useState<Set<string>>(new Set());
  const [skillsLoaded, setSkillsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSkillsLoaded(false);
    setReqSkills([]);
    setMyTagIds(new Set());

    async function load() {
      const [reqRes, myRes] = await Promise.allSettled([
        fetchListingRequiredSkills(listing.id),
        profileId && marketView === "freelancer"
          ? fetchTalentSkills(profileId)
          : Promise.resolve(null),
      ]);
      if (cancelled) return;
      if (reqRes.status === "fulfilled") setReqSkills(reqRes.value.skills);
      if (myRes.status === "fulfilled" && myRes.value) {
        setMyTagIds(new Set(myRes.value.skills.map((s) => s.tag_id)));
      }
      setSkillsLoaded(true);
    }
    void load();
    return () => { cancelled = true; };
  }, [listing.id, profileId, marketView]);

  const matchedCount = reqSkills.filter((s) => myTagIds.has(s.id)).length;

  return (
    <>
      {/* Backdrop — on desktop starts after the sidebar (lg:left-56 = 224px) */}
      <div
        className="fixed inset-0 z-40 bg-black/60 lg:left-56"
        onClick={onClose}
      />

      {/* Positioning wrapper:
          mobile  → anchored to viewport bottom, full width
          desktop → centred inside the content column (lg:left-56 to lg:right-0) */}
      <div className="fixed inset-x-0 bottom-0 z-50
                      lg:top-0 lg:bottom-0 lg:left-56 lg:right-0
                      lg:flex lg:items-center lg:justify-center lg:p-8">

        {/* Panel */}
        <div className="bg-zinc-900 border-t border-zinc-800 rounded-t-sm
                        max-h-[88vh] flex flex-col w-full
                        lg:border lg:border-zinc-800 lg:rounded-sm
                        lg:max-w-2xl lg:max-h-[85vh]">

        {/* Drag handle — mobile only */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0 lg:hidden">
          <div className="w-10 h-1 rounded-full bg-zinc-700" />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between px-4 py-3 border-b border-zinc-800 flex-shrink-0">
          <div className="space-y-1.5 min-w-0 pr-3">
            <div className="flex items-center gap-1.5 flex-wrap">
              <CategoryBadge category={listing.category} />
              <SellerBadge sellerType={listing.seller_type} />
            </div>
            <p className="font-mono text-sm font-semibold text-zinc-100 leading-snug">
              {listing.name}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close detail panel"
            className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-4 py-4 space-y-5">
          {/* Full description */}
          <div>
            <p className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest mb-2">
              Description
            </p>
            <p className="text-sm text-zinc-300 leading-relaxed">{listing.description}</p>
          </div>

          {/* Required skills */}
          {(skillsLoaded || reqSkills.length > 0) && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">
                  Required Skills
                </p>
                {marketView === "freelancer" && reqSkills.length > 0 && (
                  <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded-sm ${
                    matchedCount === reqSkills.length
                      ? "bg-emerald-950 text-emerald-400"
                      : matchedCount > 0
                        ? "bg-amber-950 text-amber-400"
                        : "bg-zinc-800 text-zinc-400"
                  }`}>
                    {matchedCount}/{reqSkills.length} matched
                  </span>
                )}
              </div>
              {!skillsLoaded && reqSkills.length === 0 ? (
                <div className="flex gap-1.5 flex-wrap">
                  {[1,2,3].map((i) => (
                    <div key={i} className="h-6 w-16 rounded-sm bg-zinc-800 animate-pulse" />
                  ))}
                </div>
              ) : reqSkills.length === 0 ? (
                <p className="font-mono text-xs text-zinc-600">No specific skills required</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {reqSkills.map((skill) => {
                    const have = myTagIds.has(skill.id);
                    return (
                      <span
                        key={skill.id}
                        className={`inline-flex items-center gap-1 px-2 h-6 rounded-sm border font-mono text-[11px] ${
                          marketView === "freelancer"
                            ? have
                              ? "border-emerald-800 bg-emerald-950/50 text-emerald-300"
                              : "border-zinc-700 bg-zinc-800/50 text-zinc-400"
                            : "border-zinc-700 bg-zinc-800/50 text-zinc-400"
                        }`}
                      >
                        {marketView === "freelancer" && (
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${have ? "bg-emerald-400" : "bg-zinc-600"}`} />
                        )}
                        {skill.tag}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Price + escrow split */}
          <div className="flex items-end gap-6">
            <div>
              <p className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest mb-1">
                Escrow
              </p>
              <p className="font-mono text-xl font-semibold text-amber-400 tabular-nums">
                {fmtUSD(listing.price_cents)}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest mb-1">
                Split
              </p>
              <p className="font-mono text-xs text-zinc-400">70% dev · 30% talent</p>
            </div>
          </div>

          {/* Wasm hash */}
          <div>
            <p className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest mb-1.5">
              Artifact hash
            </p>
            <p className="font-mono text-[11px] text-zinc-500 break-all leading-relaxed">
              {listing.wasm_hash}
            </p>
          </div>

          {/* Developer ID */}
          <div>
            <p className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest mb-1.5">
              Developer
            </p>
            <p className="font-mono text-[11px] text-zinc-500 break-all">{listing.developer_id}</p>
          </div>
        </div>

        {/* Footer — action buttons always visible */}
        <div className="flex-shrink-0 border-t border-zinc-800 px-4 py-3 flex items-center gap-2">
          <div className="flex-1">
            <ActionButton
              listing={listing}
              userTier={userTier}
              profileId={profileId}
              marketView={marketView}
            />
          </div>
          <ShareButton listing={listing} />
        </div>

        </div> {/* end panel */}
      </div>   {/* end positioning wrapper */}
    </>
  );
}

// ── Listing card (mobile) ──────────────────────────────────────────────────

function ListingCard({ listing, userTier, profileId, marketView, devTierMap, highlighted }: {
  listing:     AgentListing;
  userTier:    string;
  highlighted?: boolean;
  profileId:  string;
  marketView: MarketView;
  devTierMap: Map<string, VettingTier>;
}) {
  const devTier     = devTierMap.get(listing.developer_id) ?? DEV_TIERS[listing.developer_id] ?? 0;
  const [showDetail, setShowDetail] = useState(false);

  return (
    <>
      <div
        id={`listing-${listing.id}`}
        className={`border rounded-sm bg-zinc-900 p-3 space-y-2 hover:border-zinc-700 transition-colors ${
          highlighted ? "border-amber-500 ring-1 ring-amber-500/30" : "border-zinc-800"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            {/* Clickable name → opens detail sheet */}
            <button
              onClick={() => setShowDetail(true)}
              className="font-mono text-sm font-medium text-zinc-100 hover:text-amber-400
                         transition-colors text-left w-full truncate"
            >
              {listing.name}
            </button>
            <div className="flex items-center gap-1.5 flex-wrap">
              <CategoryBadge category={listing.category} />
              <SellerBadge sellerType={listing.seller_type} />
              <VettingBadge tier={devTier} compact />
            </div>
          </div>
          <span className="font-mono text-sm font-medium text-amber-400 tabular-nums whitespace-nowrap flex-shrink-0">
            {fmtUSD(listing.price_cents)}
          </span>
        </div>

        {/* Description — 2-line clamp with tap-to-expand hint */}
        <div>
          <p className="text-xs text-zinc-400 leading-relaxed line-clamp-2">
            {listing.description}
          </p>
          {listing.description.length > 100 && (
            <button
              onClick={() => setShowDetail(true)}
              className="text-[10px] font-mono text-amber-600 hover:text-amber-400
                         transition-colors mt-0.5"
            >
              read more
            </button>
          )}
        </div>

        <p className="font-mono text-[10px] text-zinc-600 flex items-center gap-1">
          <Hash className="w-3 h-3" />{shortHash(listing.wasm_hash)}
        </p>

        <div className="flex items-center gap-2 pt-1 border-t border-zinc-800">
          <span className="font-mono text-[10px] text-zinc-600 truncate flex-1">
            dev: {listing.developer_id.slice(0, 8)}…
          </span>
          <ShareButton listing={listing} />
          <ActionButton
            listing={listing}
            userTier={userTier}
            profileId={profileId}
            marketView={marketView}
          />
        </div>
      </div>

      {showDetail && (
        <ListingDetailSheet
          listing={listing}
          userTier={userTier}
          profileId={profileId}
          marketView={marketView}
          onClose={() => setShowDetail(false)}
        />
      )}
    </>
  );
}

// ── Desktop table row ──────────────────────────────────────────────────────

function TableRow({ listing, userTier, profileId, marketView, devTierMap, highlighted }: {
  listing:     AgentListing;
  userTier:    string;
  highlighted?: boolean;
  profileId:  string;
  marketView: MarketView;
  devTierMap: Map<string, VettingTier>;
}) {
  const devTier = devTierMap.get(listing.developer_id) ?? DEV_TIERS[listing.developer_id] ?? 0;
  const [showDetail, setShowDetail] = useState(false);

  return (
    <>
      <tr
        id={`listing-${listing.id}`}
        className={`border-b border-zinc-800 hover:bg-zinc-900 transition-colors ${
          highlighted ? "bg-amber-950/20 outline outline-1 outline-amber-700/50" : ""
        }`}
      >
        <td className="px-3 py-2">
          <div className="space-y-1">
            {/* Clickable name → opens detail sheet */}
            <button
              onClick={() => setShowDetail(true)}
              className="font-mono text-xs font-medium text-zinc-200 hover:text-amber-400
                         transition-colors text-left"
            >
              {listing.name}
            </button>
            <p className="font-mono text-[10px] text-zinc-600 flex items-center gap-1">
              <Cpu className="w-2.5 h-2.5" />{shortHash(listing.wasm_hash)}
            </p>
          </div>
        </td>
        <td className="px-3 py-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <CategoryBadge category={listing.category} />
            <SellerBadge sellerType={listing.seller_type} />
            <VettingBadge tier={devTier} compact />
          </div>
        </td>
        {/* Description — 2 lines + "read more" link that opens detail sheet */}
        <td className="px-3 py-2 text-xs text-zinc-400 w-80">
          <p className="line-clamp-2 leading-relaxed">{listing.description}</p>
          {listing.description.length > 80 && (
            <button
              onClick={() => setShowDetail(true)}
              className="text-[10px] font-mono text-amber-600 hover:text-amber-400
                         transition-colors mt-0.5"
            >
              read more
            </button>
          )}
        </td>
        <td className="px-3 py-2 font-mono text-sm font-medium text-amber-400 tabular-nums whitespace-nowrap">
          {fmtUSD(listing.price_cents)}
        </td>
        <td className="px-3 py-2">
          <div className="flex items-center gap-1.5">
            <ShareButton listing={listing} compact />
            <ActionButton
              listing={listing}
              userTier={userTier}
              profileId={profileId}
              marketView={marketView}
              compact
            />
          </div>
        </td>
      </tr>

      {showDetail && (
        <ListingDetailSheet
          listing={listing}
          userTier={userTier}
          profileId={profileId}
          marketView={marketView}
          onClose={() => setShowDetail(false)}
        />
      )}
    </>
  );
}

// ── List Product Panel ─────────────────────────────────────────────────────

function ListProductPanel({ onClose, onCreated, profileId }: {
  onClose:   () => void;
  onCreated: (listing: AgentListing) => void;
  profileId: string;
}) {
  const [name,        setName]        = useState("");
  const [description, setDescription] = useState("");
  const [priceDollars, setPrice]      = useState("");
  const [category,    setCategory]    = useState<ListingCategory>("AiStaff");
  const [sellerType,  setSellerType]  = useState<SellerType>("Freelancer");
  const [allTags,     setAllTags]     = useState<SkillTag[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [tagsLoading, setTagsLoading] = useState(true);
  const [tagsError,   setTagsError]   = useState(false);
  const [submitting,  setSubmitting]  = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/skill-tags")
      .then((r) => r.json())
      .then((d) => setAllTags(d.skill_tags ?? []))
      .catch(() => setTagsError(true))
      .finally(() => setTagsLoading(false));
  }, []);

  function toggleTag(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else if (next.size < 10) next.add(id);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !description.trim() || !priceDollars) return;
    setSubmitting(true);
    setError(null);

    const price_cents = Math.round(parseFloat(priceDollars) * 100);
    const wasm_hash   = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map(b => b.toString(16).padStart(2, "0")).join("");

    let apiListingId: string | null = null;
    try {
      const result = await createListing({
        developer_id: profileId,
        name:         name.trim(),
        description:  description.trim(),
        wasm_hash,
        price_cents,
        category,
        seller_type:  sellerType,
      });
      apiListingId = result?.listing_id ?? null;
      if (apiListingId && selectedIds.size > 0) {
        await fetch(`/api/listings/${apiListingId}/required-skills`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ tag_ids: Array.from(selectedIds) }),
        }).catch(() => {}); // non-blocking — listing already created
      }
    } catch {
      // API down — optimistic local insert
    }

    const newId   = apiListingId ?? crypto.randomUUID();
    const newListing: AgentListing = {
      id:           newId,
      developer_id: profileId,
      name:         name.trim(),
      description:  description.trim(),
      wasm_hash,
      price_cents,
      active:       true,
      category,
      seller_type:  sellerType,
      // Derive a best-effort slug from the name; the real slug is set by the backend.
      slug:         name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || newId.slice(0, 8),
      created_at:   new Date().toISOString(),
      updated_at:   new Date().toISOString(),
    };
    onCreated(newListing);
    setSubmitting(false);
    onClose();
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/60"
        onClick={onClose}
      />

      {/* Panel — bottom sheet on mobile, right side panel on lg+ */}
      <div className="fixed z-50
                      bottom-0 left-0 right-0 rounded-t-sm
                      lg:bottom-auto lg:top-0 lg:right-0 lg:left-auto
                      lg:w-96 lg:h-full lg:rounded-none
                      bg-zinc-950 border-t lg:border-t-0 lg:border-l border-zinc-800
                      flex flex-col">
        {/* Panel header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <span className="font-mono text-xs text-zinc-300 uppercase tracking-widest">List Product</span>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">

          {/* Category selector */}
          <div className="space-y-1.5">
            <label className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">Category</label>
            <div className="grid grid-cols-3 gap-1.5">
              {(["AiTalent", "AiStaff", "AiRobot"] as ListingCategory[]).map((cat) => {
                const { icon: Icon, label, color } = CATEGORY_META[cat];
                const active = category === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategory(cat)}
                    className={`flex flex-col items-center gap-1 py-2.5 rounded-sm border font-mono text-[10px] uppercase tracking-widest transition-colors ${
                      active
                        ? `${color} bg-zinc-900`
                        : "border-zinc-800 text-zinc-600 hover:border-zinc-700 hover:text-zinc-400"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Seller type toggle */}
          <div className="space-y-1.5">
            <label className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">Seller Type</label>
            <div className="grid grid-cols-2 gap-1.5">
              {(["Agency", "Freelancer"] as SellerType[]).map((st) => {
                const { icon: Icon, label } = SELLER_META[st];
                const active = sellerType === st;
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setSellerType(st)}
                    className={`flex items-center justify-center gap-2 h-10 rounded-sm border font-mono text-xs transition-colors ${
                      active
                        ? "border-zinc-500 text-zinc-100 bg-zinc-800"
                        : "border-zinc-800 text-zinc-600 hover:border-zinc-700 hover:text-zinc-400"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Name */}
          <div className="space-y-1.5">
            <label className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
              Product Name
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. DataSync Agent v2"
              required
              className="w-full h-9 px-3 bg-zinc-900 border border-zinc-800 rounded-sm
                         font-mono text-xs text-zinc-200 placeholder-zinc-600
                         focus:outline-none focus:border-zinc-600 transition-colors"
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
              Description
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What does this product do?"
              required
              rows={3}
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-sm
                         font-mono text-xs text-zinc-200 placeholder-zinc-600
                         focus:outline-none focus:border-zinc-600 transition-colors resize-none"
            />
          </div>

          {/* Price */}
          <div className="space-y-1.5">
            <label className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
              Price (USD)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-xs text-zinc-500">$</span>
              <input
                type="number"
                value={priceDollars}
                onChange={e => setPrice(e.target.value)}
                placeholder="1999"
                min="1"
                step="1"
                required
                className="w-full h-9 pl-7 pr-3 bg-zinc-900 border border-zinc-800 rounded-sm
                           font-mono text-xs text-zinc-200 placeholder-zinc-600
                           focus:outline-none focus:border-zinc-600 transition-colors"
              />
            </div>
          </div>

          {/* Installer skills */}
          <div className="space-y-1.5">
            <label className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
              Installer skills{" "}
              <span className="text-zinc-600 normal-case font-sans">
                (optional — {selectedIds.size}/10)
              </span>
            </label>
            <p className="font-mono text-[10px] text-zinc-600 leading-relaxed">
              Tag the skills a freelancer needs to deploy this product.
            </p>
            {tagsLoading ? (
              <div className="h-8 rounded-sm bg-zinc-800 animate-pulse" />
            ) : tagsError ? (
              <p className="font-mono text-xs text-zinc-500">
                Skills unavailable — describe requirements in the description.
              </p>
            ) : (
              Object.entries(
                allTags.reduce<Record<string, SkillTag[]>>((acc, t) => {
                  (acc[t.domain] ??= []).push(t);
                  return acc;
                }, {}),
              ).map(([domain, tags]) => (
                <div key={domain} className="mb-2">
                  <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest mb-1">
                    {domain}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => toggleTag(t.id)}
                        aria-pressed={selectedIds.has(t.id)}
                        className={`h-6 px-2 rounded-sm border font-mono text-[11px] transition-all ${
                          selectedIds.has(t.id)
                            ? "border-amber-400/60 bg-amber-400/10 text-amber-400"
                            : "border-zinc-800 bg-zinc-900/60 text-zinc-500 hover:border-zinc-700 hover:text-zinc-400"
                        }`}
                      >
                        {t.tag}
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>

          {error && (
            <p className="font-mono text-[10px] text-red-400 border border-red-900 bg-red-950/30 px-2 py-1 rounded-sm">
              {error}
            </p>
          )}

          {/* Summary preview */}
          {name && priceDollars && (
            <div className="border border-zinc-800 rounded-sm p-3 space-y-2 bg-zinc-900">
              <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">Preview</p>
              <div className="flex items-center justify-between">
                <p className="font-mono text-xs text-zinc-200 truncate">{name}</p>
                <span className="font-mono text-xs text-amber-400 tabular-nums">
                  ${parseFloat(priceDollars || "0").toLocaleString()}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <CategoryBadge category={category} />
                <SellerBadge sellerType={sellerType} />
              </div>
            </div>
          )}
        </form>

        {/* Submit */}
        <div className="px-4 py-3 border-t border-zinc-800">
          <button
            form="list-form"
            onClick={handleSubmit}
            disabled={submitting || !name.trim() || !description.trim() || !priceDollars}
            className="w-full h-12 lg:h-10 rounded-sm border border-amber-900 bg-amber-950
                       text-amber-400 font-mono text-xs uppercase tracking-widest
                       hover:border-amber-700 active:scale-[0.98] transition-all
                       disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {submitting ? "Listing…" : "Publish Listing"}
          </button>
        </div>
      </div>
    </>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function MarketplacePage() {
  const { data: session } = useSession();
  const userTier  = session?.user?.identityTier ?? "UNVERIFIED";
  const profileId = session?.user?.profileId ?? "00000000-0000-0000-0000-000000000000";
  // Session role: "talent" | "client" | "agent-owner" | null
  const sessionRole = (session?.user as { role?: string | null })?.role ?? null;

  const [allListings,   setAllListings]   = useState<AgentListing[]>(DEMO_LISTINGS);
  const [status,        setStatus]        = useState<"live" | "demo" | "loading">("loading");
  const [catFilter,     setCatFilter]     = useState<CategoryFilter>("All");
  const [sellerFilter,  setSellerFilter]  = useState<SellerFilter>("All");
  const [showPanel,     setShowPanel]     = useState(false);
  const [devTierMap,    setDevTierMap]    = useState<Map<string, VettingTier>>(new Map());
  const [highlightId,   setHighlightId]  = useState<string | null>(null);
  const [marketView,    setMarketView]    = useState<MarketView>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("market_view") as MarketView) ?? "client";
    }
    return "client";
  });

  // Once session loads, seed the view from the user's role — but only if
  // they haven't manually toggled it in this browser (localStorage wins).
  useEffect(() => {
    if (!sessionRole) return;
    if (typeof window !== "undefined" && localStorage.getItem("market_view")) return;
    // talent → freelancer installer view; client / agent-owner → buyer view
    if (sessionRole === "talent") {
      setMarketView("freelancer");
    }
  }, [sessionRole]);

  useEffect(() => {
    fetchListings()
      .then(async ({ listings }) => {
        if (listings.length > 0) {
          setAllListings(listings);
          setStatus("live");
          // Fetch live trust tiers for all unique developers in parallel
          const uniqueDevIds = [...new Set(listings.map((l) => l.developer_id))];
          const profiles = await Promise.allSettled(
            uniqueDevIds.map((id) => fetchPublicProfile(id)),
          );
          const tierMap = new Map<string, VettingTier>();
          profiles.forEach((res, i) => {
            if (res.status === "fulfilled") {
              tierMap.set(uniqueDevIds[i], tierStringToNum(res.value.identity_tier));
            }
          });
          setDevTierMap(tierMap);
        } else {
          setStatus("demo");
        }
      })
      .catch(() => setStatus("demo"));
  }, []);

  // ── Deep-link: ?listing=<uuid-or-slug> ────────────────────────────────────
  // Resolves the ?listing= param to a UUID, handling three cases:
  //   1. Param is already a UUID (normal path when backend is fully deployed).
  //   2. Param is a slug (fallback when backend returns null on /listings/by-slug).
  //   3. Listings load after the initial render (API call takes > 400 ms).
  const hasScrolled = useRef(false);
  useEffect(() => {
    const params    = new URLSearchParams(window.location.search);
    const idOrSlug  = params.get("listing");
    if (!idOrSlug || hasScrolled.current || allListings.length === 0) return;

    // Resolve slug → UUID so the element ID lookup and highlight comparison work.
    const matched    = allListings.find(l => l.id === idOrSlug || l.slug === idOrSlug);
    const resolvedId = matched?.id ?? idOrSlug;

    setHighlightId(resolvedId);

    const t = setTimeout(() => {
      const el = document.getElementById(`listing-${resolvedId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        hasScrolled.current = true;
      }
    }, 300);

    // Clear the amber highlight ring after 5 seconds
    const clear = setTimeout(() => setHighlightId(null), 5300);
    return () => { clearTimeout(t); clearTimeout(clear); };
  }, [allListings]); // re-run when listings load from API

  const visible = allListings.filter(l =>
    (catFilter    === "All" || l.category    === catFilter) &&
    (sellerFilter === "All" || l.seller_type === sellerFilter),
  );

  const counts: Record<CategoryFilter, number> = {
    All:      allListings.length,
    AiTalent: allListings.filter(l => l.category === "AiTalent").length,
    AiStaff:  allListings.filter(l => l.category === "AiStaff").length,
    AiRobot:  allListings.filter(l => l.category === "AiRobot").length,
  };

  return (
    <div className="flex flex-col lg:flex-row min-h-screen">
      {/* Shared sidebar — active state driven by usePathname() */}
      <AppSidebar status={status} />

      {/* Main */}
      <main className="flex-1 p-4 pb-20 lg:pb-4 space-y-4 max-w-5xl mx-auto w-full">

        {/* Header */}
        <div className="flex items-center gap-3 flex-wrap">
          <Package className="w-4 h-4 text-amber-400" />
          <h1 className="font-mono text-sm font-medium text-zinc-300 uppercase tracking-widest">
            Marketplace
          </h1>

          {/* View toggle */}
          <div className="flex items-center rounded-sm border border-zinc-700 overflow-hidden">
            {(["client", "freelancer"] as MarketView[]).map((v) => (
              <button
                key={v}
                onClick={() => {
                  setMarketView(v);
                  localStorage.setItem("market_view", v);
                }}
                className={`h-7 px-3 font-mono text-xs transition-colors capitalize ${
                  marketView === v
                    ? v === "freelancer"
                      ? "bg-sky-900 text-sky-300"
                      : "bg-zinc-700 text-zinc-100"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {v}
              </button>
            ))}
          </div>

          <span className="font-mono text-xs text-zinc-600 ml-auto">
            {visible.length} / {allListings.length}
          </span>
          <button
            onClick={() => setShowPanel(true)}
            className="flex items-center gap-1.5 px-3 h-7 rounded-sm border border-zinc-700
                       text-zinc-400 font-mono text-xs uppercase tracking-widest
                       hover:border-zinc-500 hover:text-zinc-200 transition-colors"
          >
            <Plus className="w-3 h-3" />
            List Product
          </button>
        </div>

        {/* Freelancer context strip */}
        {marketView === "freelancer" && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-sm border border-sky-900 bg-sky-950/40">
            <Handshake className="w-3.5 h-3.5 text-sky-400 shrink-0" aria-hidden="true" />
            <p className="font-mono text-xs text-sky-300">
              Installer view — click <span className="text-sky-200 font-semibold">Apply</span> on any listing to express interest in deploying that agent.
            </p>
          </div>
        )}

        {/* Category tabs */}
        <div className="flex flex-wrap items-center gap-1 w-full">
          {(["All", "AiTalent", "AiStaff", "AiRobot"] as CategoryFilter[]).map((cat) => {
            const meta = cat === "All" ? null : CATEGORY_META[cat];
            const Icon = meta?.icon;
            const active = catFilter === cat;
            return (
              <button
                key={cat}
                onClick={() => setCatFilter(cat)}
                className={`flex items-center gap-1.5 px-3 h-8 rounded-sm border font-mono text-xs transition-colors ${
                  active
                    ? cat === "All"
                      ? "border-zinc-600 text-zinc-100 bg-zinc-800"
                      : `${meta!.color} bg-zinc-900`
                    : "border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-400"
                }`}
              >
                {Icon && <Icon className="w-3 h-3" />}
                {cat}
                <span className={`font-mono text-[10px] px-1 rounded-sm ${active ? "bg-zinc-700 text-zinc-300" : "text-zinc-600"}`}>
                  {counts[cat]}
                </span>
              </button>
            );
          })}

          {/* Seller type filter — right-aligned */}
          <div className="ml-auto flex items-center gap-1">
            {(["All", "Agency"] as (SellerFilter)[]).map((st) => {
              const meta = st !== "All" ? SELLER_META[st as SellerType] : null;
              const Icon = meta?.icon;
              const active = sellerFilter === st;
              return (
                <button
                  key={st}
                  onClick={() => setSellerFilter(st)}
                  className={`flex items-center gap-1 px-2.5 h-7 rounded-sm border font-mono text-[10px] uppercase tracking-widest transition-colors ${
                    active
                      ? "border-zinc-600 text-zinc-200 bg-zinc-800"
                      : "border-zinc-800 text-zinc-600 hover:border-zinc-700 hover:text-zinc-400"
                  }`}
                >
                  {Icon && <Icon className="w-3 h-3" />}
                  {st}
                </button>
              );
            })}
          </div>
        </div>

        {/* Empty state */}
        {visible.length === 0 && (
          <div className="border border-zinc-800 rounded-sm p-8 text-center">
            <p className="font-mono text-xs text-zinc-600">No listings match the selected filters.</p>
          </div>
        )}

        {/* Desktop table */}
        {visible.length > 0 && (
          <div className="hidden sm:block border border-zinc-800 rounded-sm overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-950">
                  {["Agent", "Type", "Description", "Price", ""].map((h) => (
                    <th
                      key={h}
                      className="px-3 py-2 font-mono text-xs text-zinc-500 uppercase tracking-widest font-medium"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((l) => <TableRow key={l.id} listing={l} userTier={userTier} profileId={profileId} marketView={marketView} devTierMap={devTierMap} highlighted={highlightId === l.id} />)}
              </tbody>
            </table>
          </div>
        )}

        {/* Mobile cards */}
        {visible.length > 0 && (
          <div className="sm:hidden space-y-2">
            {visible.map((l) => <ListingCard key={l.id} listing={l} userTier={userTier} profileId={profileId} marketView={marketView} devTierMap={devTierMap} highlighted={highlightId === l.id} />)}
          </div>
        )}

        {/* Escrow panel */}
        <div className="border border-zinc-800 rounded-sm p-3">
          <p className="font-mono text-xs text-zinc-500 uppercase tracking-widest mb-2">Escrow Split</p>
          <div className="grid grid-cols-3 gap-3 text-xs font-mono">
            <div>
              <p className="text-zinc-600">Developer</p>
              <p className="text-zinc-300">70%</p>
            </div>
            <div>
              <p className="text-zinc-600">AiTalent</p>
              <p className="text-zinc-300">30%</p>
            </div>
            <div>
              <p className="text-zinc-600">Veto window</p>
              <p className="text-zinc-300">30 s</p>
            </div>
          </div>
        </div>
      </main>

      {/* List Product panel */}
      {showPanel && (
        <ListProductPanel
          onClose={() => setShowPanel(false)}
          onCreated={(listing) => setAllListings(prev => [listing, ...prev])}
          profileId={profileId}
        />
      )}

      {/* Mobile bottom nav — shared, active state from usePathname() */}
      <AppMobileNav />
    </div>
  );
}
