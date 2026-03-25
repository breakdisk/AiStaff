"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  updateProfile, createAgency, fetchSkillTags, updateTalentSkills,
} from "@/lib/api";
import type { SkillTag } from "@/lib/api";
import { getMyOrg, updateOrg, inviteMember } from "@/lib/enterpriseApi";
import {
  Bot, Github, Linkedin, Briefcase, Code2, Building2,
  CheckCircle, ChevronRight, ArrowRight, Zap, Shield,
  Clock, Users, Check, Star, Send, SkipForward,
  Info, X, AlertCircle,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Role      = "freelancer" | "client" | "agency";
type PlanTier  = "GROWTH" | "ENTERPRISE" | "PLATINUM";
type Avail     = "available" | "busy" | "not-available";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UpdateFn  = (data?: any) => Promise<unknown>;

function toBackendRole(r: Role): "talent" | "client" | "agent-owner" {
  if (r === "freelancer") return "talent";
  if (r === "client")     return "client";
  return "agent-owner";
}

// localStorage keys
const LS = {
  step:   "ob_step",
  role:   "ob_role",
  done:   "onboarding_done",
  uRole:  "user_role",
};

function ls(key: string): string {
  return typeof window !== "undefined" ? (localStorage.getItem(key) ?? "") : "";
}

// ── Step indicator ─────────────────────────────────────────────────────────────

function Steps({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2 justify-center mb-6">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className={`h-1 rounded-full transition-all duration-300 ${
          i < current  ? "w-8 bg-amber-400"     :
          i === current ? "w-8 bg-amber-400/60" :
          "w-4 bg-zinc-700"
        }`} />
      ))}
    </div>
  );
}

// ── Shared primitives ─────────────────────────────────────────────────────────

function PrimaryBtn({ label, onClick, loading, disabled }: {
  label:    React.ReactNode;
  onClick?: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading || disabled}
      className="w-full h-11 flex items-center justify-center gap-2 rounded-sm
                 bg-amber-400 hover:bg-amber-300 text-zinc-950 font-mono text-sm
                 font-medium transition-all active:scale-[0.98]
                 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {loading ? <span className="w-4 h-4 border-2 border-zinc-900 border-t-transparent rounded-full animate-spin" />
               : label}
    </button>
  );
}

function SkipBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-center font-mono text-xs text-zinc-500
                 hover:text-zinc-400 transition-colors py-1"
    >
      {label}
    </button>
  );
}

function ErrorBox({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return (
    <p className="font-mono text-[10px] text-red-400 border border-red-900
                  bg-red-950/30 px-2 py-1.5 rounded-sm">
      {msg}
    </p>
  );
}

// ── STEP 0 — Welcome ──────────────────────────────────────────────────────────

function StepWelcome({
  name,
  onNext,
  isLinkedAccount,
  linkedEmail,
  linkedProvider,
}: {
  name:             string | null;
  onNext:           () => void;
  isLinkedAccount?: boolean;
  linkedEmail?:     string;
  linkedProvider?:  string;
}) {
  const [bannerDismissed, setBannerDismissed] = useState(false);

  return (
    <div className="space-y-6">
      {isLinkedAccount && !bannerDismissed && (
        <div className="flex items-start gap-3 p-3 rounded-sm border-l-2 border-amber-400
                        bg-zinc-900 text-zinc-50">
          <Info className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-zinc-100">
              {linkedProvider
                ? `${linkedProvider} linked to your existing account`
                : "New login method linked to your existing account"}
            </p>
            {linkedEmail && (
              <p className="font-mono text-xs text-zinc-400 mt-0.5">{linkedEmail}</p>
            )}
            <p className="font-mono text-xs text-zinc-500 mt-0.5">
              Your trust score has been updated.
            </p>
          </div>
          <button
            onClick={() => setBannerDismissed(true)}
            className="text-zinc-500 hover:text-zinc-300 transition-colors"
            aria-label="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      <div className="text-center space-y-2">
        <div className="w-12 h-12 rounded-sm bg-amber-400/10 border border-amber-400/30
                        flex items-center justify-center mx-auto">
          <Bot className="w-6 h-6 text-amber-400" />
        </div>
        <h1 className="text-xl font-semibold text-zinc-100">
          Welcome{name ? `, ${name.split(" ")[0]}` : ""}
        </h1>
        <p className="font-mono text-xs text-zinc-500">Set up your account in under 3 minutes.</p>
      </div>

      <div className="space-y-2">
        {[
          { icon: Shield,       label: "ZK-verified identity",     desc: "No raw biometrics stored — ever" },
          { icon: Clock,        label: "Veto-first escrow",         desc: "30s human approval before any payout" },
          { icon: CheckCircle,  label: "7-day warranty",            desc: "Fix-or-refund on every deployment" },
        ].map(({ icon: Icon, label, desc }) => (
          <div key={label}
               className="flex items-start gap-3 p-3 rounded-sm border border-zinc-800 bg-zinc-900/60">
            <Icon className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-zinc-200">{label}</p>
              <p className="font-mono text-xs text-zinc-500">{desc}</p>
            </div>
          </div>
        ))}
      </div>

      <PrimaryBtn label={<>Get started <ArrowRight className="w-4 h-4" /></>} onClick={onNext} />
    </div>
  );
}

// ── STEP 1 — Role selection ───────────────────────────────────────────────────

function StepRole({ onNext }: { onNext: (role: Role) => void }) {
  const options: { role: Role; icon: typeof Code2; title: string; desc: string }[] = [
    {
      role:  "freelancer",
      icon:  Code2,
      title: "Freelancer / Installer",
      desc:  "Install & maintain AI agents — earn escrow-backed payments",
    },
    {
      role:  "client",
      icon:  Briefcase,
      title: "Client / Buyer",
      desc:  "Deploy AI agents & hire vetted talent for your business",
    },
    {
      role:  "agency",
      icon:  Building2,
      title: "Agency / Agent Owner",
      desc:  "List AI agents & manage a team under an org account",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="text-center space-y-1">
        <h2 className="text-lg font-semibold text-zinc-100">How will you use AiStaff?</h2>
        <p className="font-mono text-xs text-zinc-500">
          Pick one — you can update this from your profile later.
        </p>
      </div>

      <div className="space-y-3">
        {options.map(({ role, icon: Icon, title, desc }) => (
          <button
            key={role}
            onClick={() => onNext(role)}
            className="w-full p-4 rounded-sm border border-zinc-700 bg-zinc-900/60
                       hover:border-amber-400/50 hover:bg-zinc-800 transition-all
                       active:scale-[0.98] text-left group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-sm bg-zinc-800 border border-zinc-700
                              group-hover:border-amber-400/40 flex items-center justify-center shrink-0">
                <Icon className="w-5 h-5 text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-zinc-100 text-sm">{title}</p>
                <p className="font-mono text-xs text-zinc-500 mt-0.5">{desc}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-amber-400
                                       shrink-0 transition-colors" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── STEP 2a — Freelancer: connect social ──────────────────────────────────────

function StepFreelancerConnect({ onNext }: { onNext: () => void }) {
  function connect(provider: "github" | "linkedin") {
    // Full browser navigation avoids PKCE cookie race condition on mobile.
    // Returns to /onboarding so the wizard resumes after OAuth.
    const url = `/api/auth/login?provider=${provider}&callbackUrl=${encodeURIComponent("/onboarding")}`;
    window.location.href = url;
  }

  return (
    <div className="space-y-6">
      <div className="text-center space-y-1">
        <h2 className="text-lg font-semibold text-zinc-100">Verify your identity</h2>
        <p className="font-mono text-xs text-zinc-500">
          GitHub or LinkedIn upgrades you to Tier 1 — required to receive job matches and escrow.
        </p>
      </div>

      <div className="space-y-2 text-xs font-mono">
        {[
          { tier: "T0", label: "Google / Facebook", desc: "Browse listings only",            highlight: false },
          { tier: "T1", label: "GitHub / LinkedIn",  desc: "Receive jobs + escrow payments",  highlight: true  },
          { tier: "T2", label: "Biometric ZK",       desc: "High-value contracts",            highlight: false },
        ].map(({ tier, label, desc, highlight }) => (
          <div key={tier}
               className={`flex items-center gap-3 p-2.5 rounded-sm border
                           ${highlight ? "border-amber-400/40 bg-amber-400/5"
                                       : "border-zinc-800 bg-zinc-900/40"}`}>
            <span className={`w-8 shrink-0 font-medium ${highlight ? "text-amber-400" : "text-zinc-600"}`}>
              {tier}
            </span>
            <span className={highlight ? "text-zinc-200" : "text-zinc-500"}>{label}</span>
            <span className="text-zinc-600 ml-auto text-right">{desc}</span>
          </div>
        ))}
      </div>

      <div className="space-y-2.5">
        <button
          onClick={() => connect("github")}
          className="w-full h-11 flex items-center gap-3 px-4 rounded-sm border border-zinc-700
                     bg-zinc-900 hover:bg-zinc-800 hover:border-zinc-600 text-zinc-200
                     font-mono text-sm transition-all active:scale-[0.98]"
        >
          <Github className="w-4 h-4 text-zinc-400" />
          <span className="flex-1 text-left">Connect GitHub</span>
          <span className="text-[10px] text-amber-400">up to +30 pts</span>
        </button>

        <button
          onClick={() => connect("linkedin")}
          className="w-full h-11 flex items-center gap-3 px-4 rounded-sm border border-zinc-700
                     bg-zinc-900 hover:bg-zinc-800 hover:border-zinc-600 text-zinc-200
                     font-mono text-sm transition-all active:scale-[0.98]"
        >
          <Linkedin className="w-4 h-4 text-zinc-400" />
          <span className="flex-1 text-left">Connect LinkedIn</span>
          <span className="text-[10px] text-amber-400">+15 pts</span>
        </button>
      </div>

      <SkipBtn label="Skip for now — I'll do this later" onClick={onNext} />
    </div>
  );
}

// ── STEP 3a — Freelancer: skills picker ───────────────────────────────────────

function StepFreelancerSkills({
  profileId,
  onNext,
}: {
  profileId: string;
  onNext:    () => void;
}) {
  const [tags,     setTags]     = useState<SkillTag[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [loaded,   setLoaded]   = useState(false);

  useEffect(() => {
    fetchSkillTags()
      .then(r => { setTags(r.skill_tags); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, []);

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleDomain(ids: string[]) {
    setSelected(prev => {
      const next      = new Set(prev);
      const allChosen = ids.every(id => next.has(id));
      ids.forEach(id => allChosen ? next.delete(id) : next.add(id));
      return next;
    });
  }

  // Group by domain
  const byDomain = tags.reduce<Record<string, SkillTag[]>>((acc, t) => {
    (acc[t.domain] ??= []).push(t);
    return acc;
  }, {});

  async function handleContinue() {
    if (selected.size === 0) { setError("Select at least one skill."); return; }
    setSaving(true);
    setError(null);
    try {
      const skills = Array.from(selected).map(tag_id => ({ tag_id, proficiency: 3 }));
      await updateTalentSkills(profileId, skills);
      onNext();
    } catch {
      setError("Failed to save skills — please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="text-center space-y-1">
        <h2 className="text-lg font-semibold text-zinc-100">What are your skills?</h2>
        <p className="font-mono text-xs text-zinc-500">
          These power your job match score. Select all that apply.
        </p>
      </div>

      {!loaded ? (
        <div className="flex justify-center py-6">
          <div className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-4 max-h-64 overflow-y-auto pr-1 scrollbar-thin">
          {Object.entries(byDomain).sort(([a], [b]) => a.localeCompare(b)).map(([domain, domainTags]) => {
            const ids      = domainTags.map(t => t.id);
            const allChosen = ids.every(id => selected.has(id));
            return (
              <div key={domain} className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
                    {domain}
                  </p>
                  <button
                    onClick={() => toggleDomain(ids)}
                    className="font-mono text-[9px] text-amber-400 hover:text-amber-300
                               transition-colors px-1.5 py-0.5 border border-amber-400/20
                               rounded-sm hover:border-amber-400/40"
                  >
                    {allChosen ? "Deselect all" : "Select all"}
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {domainTags.map(t => {
                    const on = selected.has(t.id);
                    return (
                      <button
                        key={t.id}
                        onClick={() => toggle(t.id)}
                        className={`px-2.5 py-1 rounded-sm border font-mono text-xs
                                    transition-all active:scale-[0.97] ${
                          on ? "border-amber-400/60 bg-amber-400/10 text-amber-300"
                             : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-600"
                        }`}
                      >
                        {on && <Check className="w-2.5 h-2.5 inline mr-1" />}
                        {t.tag}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selected.size > 0 && (
        <p className="font-mono text-[10px] text-zinc-500 text-center">
          {selected.size} skill{selected.size !== 1 ? "s" : ""} selected
        </p>
      )}

      <ErrorBox msg={error} />

      <PrimaryBtn
        label={<>Continue <ArrowRight className="w-4 h-4" /></>}
        onClick={handleContinue}
        loading={saving}
        disabled={!loaded}
      />
      <SkipBtn label="Skip — I'll add skills from my profile" onClick={onNext} />
    </div>
  );
}

// ── STEP 4a — Freelancer: rate + availability + bio ───────────────────────────

function StepFreelancerProfile({
  profileId,
  onDone,
}: {
  profileId: string;
  onDone:    () => void;
}) {
  const [rate,   setRate]   = useState("");
  const [avail,  setAvail]  = useState<Avail>("available");
  const [bio,    setBio]    = useState("");
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  const AVAIL: { value: Avail; label: string }[] = [
    { value: "available",     label: "Available" },
    { value: "busy",          label: "Busy" },
    { value: "not-available", label: "Not available" },
  ];

  async function handleContinue() {
    const rateNum = parseFloat(rate);
    if (rate && (isNaN(rateNum) || rateNum <= 0)) {
      setError("Enter a valid hourly rate.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateProfile(profileId, {
        availability:      avail,
        bio:               bio.trim() || undefined,
        hourly_rate_cents: rate ? Math.round(rateNum * 100) : undefined,
      });
      onDone();
    } catch {
      setError("Failed to save profile — please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="text-center space-y-1">
        <h2 className="text-lg font-semibold text-zinc-100">Your profile</h2>
        <p className="font-mono text-xs text-zinc-500">
          Clients see this when evaluating your proposals.
        </p>
      </div>

      {/* Availability */}
      <div className="space-y-1.5">
        <label className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
          Availability
        </label>
        <div className="grid grid-cols-3 gap-1.5">
          {AVAIL.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setAvail(value)}
              className={`h-9 rounded-sm border font-mono text-xs transition-all ${
                avail === value
                  ? "border-amber-400/60 bg-amber-400/10 text-amber-300"
                  : "border-zinc-700 bg-zinc-900 text-zinc-500 hover:border-zinc-600"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Hourly rate */}
      <div className="space-y-1.5">
        <label className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
          Hourly Rate (USD) — optional
        </label>
        <div className="flex items-center h-10 bg-zinc-900 border border-zinc-800 rounded-sm
                        focus-within:border-zinc-600 overflow-hidden transition-colors">
          <span className="px-3 font-mono text-xs text-zinc-600 border-r border-zinc-800 select-none">
            $
          </span>
          <input
            type="number"
            min="0"
            step="5"
            value={rate}
            onChange={e => { setRate(e.target.value); setError(null); }}
            placeholder="e.g. 75"
            className="flex-1 h-full bg-transparent font-mono text-sm text-zinc-200
                       placeholder-zinc-600 focus:outline-none px-3"
          />
          <span className="px-3 font-mono text-xs text-zinc-600 border-l border-zinc-800 select-none">
            /hr
          </span>
        </div>
      </div>

      {/* Bio */}
      <div className="space-y-1.5">
        <label className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
          Bio — optional
        </label>
        <textarea
          value={bio}
          onChange={e => setBio(e.target.value.slice(0, 280))}
          rows={3}
          placeholder="2–3 sentences: what you specialise in, what you've built, your stack."
          className="w-full bg-zinc-900 border border-zinc-800 rounded-sm px-3 py-2
                     font-mono text-sm text-zinc-200 placeholder-zinc-600
                     focus:outline-none focus:border-zinc-600 resize-none transition-colors"
        />
        <p className="font-mono text-[9px] text-zinc-600 text-right">{bio.length}/280</p>
      </div>

      <ErrorBox msg={error} />

      <PrimaryBtn
        label={<>Finish setup <CheckCircle className="w-4 h-4" /></>}
        onClick={handleContinue}
        loading={saving}
      />
      <SkipBtn label="Skip — complete profile later" onClick={onDone} />
    </div>
  );
}

// ── STEP 2b — Client: escrow explainer + goal ─────────────────────────────────

function StepClientGoal({
  onDone,
  profileId,
}: {
  onDone:    (dest: string) => void;
  profileId: string;
}) {
  const [tosChecked,  setTosChecked]  = useState(false);
  const [tosLoading,  setTosLoading]  = useState(false);
  const [tosError,    setTosError]    = useState<string | null>(null);
  const [pendingDest, setPendingDest] = useState<string | null>(null);

  function handleGoalClick(dest: string) {
    if (!tosChecked) {
      setPendingDest(dest);
      setTosError("Please accept the Terms of Service before continuing.");
      return;
    }
    onDone(dest);
  }

  async function handleTosCheck(checked: boolean) {
    if (!checked) { setTosChecked(false); return; }
    setTosLoading(true);
    setTosError(null);
    try {
      await updateProfile(profileId, { tos_accepted: true });
      setTosChecked(true);
      if (pendingDest) onDone(pendingDest);
    } catch {
      setTosError("Could not record your acceptance — please try again.");
      setTosChecked(false);
    } finally {
      setTosLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="text-center space-y-1">
        <h2 className="text-lg font-semibold text-zinc-100">How it works</h2>
        <p className="font-mono text-xs text-zinc-500">
          AiStaff protects every engagement with escrow + a human veto window.
        </p>
      </div>

      {/* Escrow trust strip */}
      <div className="space-y-1.5">
        {[
          { icon: Clock,       label: "30-second veto window",     desc: "You approve every payout before it moves" },
          { icon: Shield,      label: "7-day warranty",            desc: "Full fix or refund if deliverables fail" },
          { icon: CheckCircle, label: "Definition-of-Done gates",  desc: "Money releases only when checklist passes" },
        ].map(({ icon: Icon, label, desc }) => (
          <div key={label}
               className="flex items-center gap-3 p-2.5 rounded-sm border border-zinc-800 bg-zinc-900/40">
            <Icon className="w-4 h-4 text-amber-400 shrink-0" />
            <div>
              <p className="text-xs font-medium text-zinc-200">{label}</p>
              <p className="font-mono text-[10px] text-zinc-500">{desc}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-1">
        <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest text-center">
          What do you need?
        </p>
      </div>

      <div className="space-y-2.5">
        <button
          onClick={() => handleGoalClick("/marketplace")}
          className="w-full p-4 rounded-sm border border-amber-400/40 bg-amber-400/5
                     hover:bg-amber-400/10 transition-all active:scale-[0.98] text-left group"
        >
          <div className="flex items-center gap-3">
            <Zap className="w-5 h-5 text-amber-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-zinc-100 text-sm">Deploy an AI Agent</p>
              <p className="font-mono text-xs text-zinc-500 mt-0.5">
                Pick from ready-to-deploy agents in the marketplace
              </p>
            </div>
            <ArrowRight className="w-4 h-4 text-amber-400 shrink-0" />
          </div>
        </button>

        <button
          onClick={() => handleGoalClick("/scoping")}
          className="w-full p-4 rounded-sm border border-zinc-700 bg-zinc-900/60
                     hover:border-zinc-600 hover:bg-zinc-800 transition-all
                     active:scale-[0.98] text-left group"
        >
          <div className="flex items-center gap-3">
            <Bot className="w-5 h-5 text-zinc-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-zinc-100 text-sm">Hire AI Talent</p>
              <p className="font-mono text-xs text-zinc-500 mt-0.5">
                Scope a job with our AI PM — auto-matches vetted installers
              </p>
            </div>
            <ArrowRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400
                                   shrink-0 transition-colors" />
          </div>
        </button>

        <button
          onClick={() => handleGoalClick("/marketplace")}
          className="w-full p-4 rounded-sm border border-zinc-700 bg-zinc-900/60
                     hover:border-zinc-600 hover:bg-zinc-800 transition-all
                     active:scale-[0.98] text-left group"
        >
          <div className="flex items-center gap-3">
            <Briefcase className="w-5 h-5 text-zinc-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-zinc-100 text-sm">Both</p>
              <p className="font-mono text-xs text-zinc-500 mt-0.5">
                Explore the full marketplace — agents and talent
              </p>
            </div>
            <ArrowRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400
                                   shrink-0 transition-colors" />
          </div>
        </button>
      </div>

      {/* ToS acceptance */}
      <div className="space-y-1.5">
        <label className="flex items-start gap-2.5 cursor-pointer group">
          <input
            type="checkbox"
            checked={tosChecked}
            disabled={tosLoading}
            onChange={(e) => handleTosCheck(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded-sm accent-amber-400 cursor-pointer"
            aria-label="Accept Terms of Service and Privacy Policy"
          />
          <span className="font-mono text-xs text-zinc-400 leading-relaxed">
            I agree to the{" "}
            <a href="/terms"   target="_blank" rel="noopener noreferrer"
               className="text-amber-400 hover:text-amber-300 underline underline-offset-2">
              Terms of Service
            </a>
            {" "}and{" "}
            <a href="/privacy" target="_blank" rel="noopener noreferrer"
               className="text-amber-400 hover:text-amber-300 underline underline-offset-2">
              Privacy Policy
            </a>
            {tosLoading && <span className="text-zinc-500 ml-1">saving…</span>}
          </span>
        </label>
        {tosError && (
          <p className="font-mono text-xs text-red-500 flex items-center gap-1">
            <AlertCircle className="w-3 h-3 shrink-0" />
            {tosError}
          </p>
        )}
      </div>
    </div>
  );
}

// ── STEP 2c — Agency: name + handle ──────────────────────────────────────────

function StepAgencyDetails({
  onNext,
  saving,
  externalError,
}: {
  onNext:        (name: string, handle: string) => void;
  saving:        boolean;
  externalError: string | null;
}) {
  const [orgName, setOrgName] = useState("");
  const [handle,  setHandle]  = useState("");
  const [error,   setError]   = useState<string | null>(null);

  function validate(): boolean {
    if (!orgName.trim())            { setError("Organisation name is required.");                      return false; }
    if (handle.length < 3)          { setError("Handle must be at least 3 characters.");               return false; }
    if (!/^[a-z0-9-]+$/.test(handle)) { setError("Handle: lowercase letters, numbers, hyphens only."); return false; }
    return true;
  }

  return (
    <div className="space-y-6">
      <div className="text-center space-y-1">
        <h2 className="text-lg font-semibold text-zinc-100">Name your agency</h2>
        <p className="font-mono text-xs text-zinc-500">You can update this later from settings.</p>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
            Organisation Name
          </label>
          <input
            type="text"
            value={orgName}
            onChange={e => { setOrgName(e.target.value); setError(null); }}
            placeholder="Acme AI Labs"
            className="w-full h-10 px-3 bg-zinc-900 border border-zinc-800 rounded-sm
                       font-mono text-sm text-zinc-200 placeholder-zinc-600
                       focus:outline-none focus:border-zinc-600 transition-colors"
          />
        </div>

        <div className="space-y-1.5">
          <label className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
            Handle
          </label>
          <div className="flex items-center h-10 bg-zinc-900 border border-zinc-800 rounded-sm
                          focus-within:border-zinc-600 overflow-hidden transition-colors">
            <span className="px-3 font-mono text-xs text-zinc-600 border-r border-zinc-800 select-none">@</span>
            <input
              type="text"
              value={handle}
              maxLength={40}
              onChange={e => { setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")); setError(null); }}
              placeholder="acme-ai"
              className="flex-1 h-full bg-transparent font-mono text-sm text-zinc-200
                         placeholder-zinc-600 focus:outline-none px-3"
            />
          </div>
          <p className="font-mono text-[10px] text-zinc-600">Lowercase · numbers · hyphens · min 3 chars</p>
        </div>

        <ErrorBox msg={error ?? externalError} />
      </div>

      <PrimaryBtn
        label={saving ? "Creating…" : <>Continue <ArrowRight className="w-4 h-4" /></>}
        onClick={() => { if (validate()) onNext(orgName.trim(), handle); }}
        loading={saving}
      />
    </div>
  );
}

// ── STEP 3c — Agency: plan tier ───────────────────────────────────────────────

function StepAgencyPlan({
  orgId,
  onNext,
}: {
  orgId:  string;
  onNext: () => void;
}) {
  const [chosen,  setChosen]  = useState<PlanTier>("GROWTH");
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const plans: {
    tier:     PlanTier;
    label:    string;
    price:    string;
    features: string[];
  }[] = [
    {
      tier:  "GROWTH",
      label: "Growth",
      price: "Free to start",
      features: [
        "30% platform fee",
        "30s veto window",
        "Up to 10 team members",
        "Standard matching",
      ],
    },
    {
      tier:  "ENTERPRISE",
      label: "Enterprise",
      price: "Custom pricing",
      features: [
        "Reduced platform fee",
        "Configurable veto window",
        "Unlimited team members",
        "Priority matching + CSM",
      ],
    },
    {
      tier:  "PLATINUM",
      label: "Platinum",
      price: "Contact us",
      features: [
        "Lowest platform fee",
        "White-label option",
        "Dedicated support",
        "SLA-backed uptime",
      ],
    },
  ];

  async function handleContinue() {
    setSaving(true);
    setError(null);
    try {
      await updateOrg(orgId, { plan_tier: chosen });
      onNext();
    } catch {
      setError("Failed to save plan — you can change this from your enterprise settings.");
      // Non-fatal — advance anyway after a moment
      setTimeout(onNext, 1200);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="text-center space-y-1">
        <h2 className="text-lg font-semibold text-zinc-100">Choose a plan</h2>
        <p className="font-mono text-xs text-zinc-500">
          Start with Growth — upgrade anytime from your enterprise settings.
        </p>
      </div>

      <div className="space-y-2">
        {plans.map(({ tier, label, price, features }) => {
          const on = chosen === tier;
          return (
            <button
              key={tier}
              onClick={() => setChosen(tier)}
              className={`w-full p-3.5 rounded-sm border text-left transition-all ${
                on ? "border-amber-400/60 bg-amber-400/5"
                   : "border-zinc-700 bg-zinc-900/60 hover:border-zinc-600"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-zinc-100 text-sm">{label}</p>
                    {tier === "GROWTH" && (
                      <span className="font-mono text-[9px] px-1.5 py-0.5 rounded-sm
                                       border border-emerald-800 bg-emerald-950/40 text-emerald-400">
                        Default
                      </span>
                    )}
                  </div>
                  <p className={`font-mono text-xs mt-0.5 ${on ? "text-amber-400" : "text-zinc-500"}`}>
                    {price}
                  </p>
                </div>
                <div className={`w-4 h-4 rounded-sm border mt-0.5 flex items-center justify-center flex-shrink-0 ${
                  on ? "border-amber-400 bg-amber-400" : "border-zinc-600"
                }`}>
                  {on && <Check className="w-3 h-3 text-zinc-950" />}
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5">
                {features.map(f => (
                  <span key={f} className="font-mono text-[9px] text-zinc-500 flex items-center gap-1">
                    <Star className="w-2 h-2 text-zinc-600" />{f}
                  </span>
                ))}
              </div>
            </button>
          );
        })}
      </div>

      <ErrorBox msg={error} />

      <PrimaryBtn
        label={<>Continue <ArrowRight className="w-4 h-4" /></>}
        onClick={handleContinue}
        loading={saving}
      />
    </div>
  );
}

// ── STEP 4c — Agency: invite first team member ────────────────────────────────

function StepAgencyInvite({
  orgId,
  profileId,
  onDone,
}: {
  orgId:     string;
  profileId: string;
  onDone:    () => void;
}) {
  const [email,   setEmail]   = useState("");
  const [sent,    setSent]    = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  async function handleInvite() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("Enter a valid email address.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await inviteMember(orgId, trimmed, profileId);
      setSent(true);
    } catch {
      setError("Failed to send invitation — you can invite members from the Enterprise tab.");
    } finally {
      setSaving(false);
    }
  }

  if (sent) {
    return (
      <div className="space-y-6 text-center">
        <div className="w-12 h-12 rounded-sm bg-emerald-950/40 border border-emerald-800
                        flex items-center justify-center mx-auto">
          <CheckCircle className="w-6 h-6 text-emerald-400" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-zinc-100">Invite sent</h2>
          <p className="font-mono text-xs text-zinc-500">
            {email} will receive a link to join your agency.
          </p>
        </div>
        <PrimaryBtn
          label={<>Go to dashboard <ArrowRight className="w-4 h-4" /></>}
          onClick={onDone}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="text-center space-y-1">
        <h2 className="text-lg font-semibold text-zinc-100">Invite your first teammate</h2>
        <p className="font-mono text-xs text-zinc-500">
          Send an invite link — they join with a single click.
        </p>
      </div>

      <div className="flex items-center gap-2 p-3 rounded-sm border border-zinc-800 bg-zinc-900/40">
        <Users className="w-4 h-4 text-zinc-500 shrink-0" />
        <p className="font-mono text-xs text-zinc-500">
          Invitees join at Tier 1 minimum — verified identities only.
        </p>
      </div>

      <div className="space-y-1.5">
        <label className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
          Email address
        </label>
        <input
          type="email"
          value={email}
          onChange={e => { setEmail(e.target.value); setError(null); }}
          onKeyDown={e => { if (e.key === "Enter") handleInvite(); }}
          placeholder="teammate@company.com"
          className="w-full h-10 px-3 bg-zinc-900 border border-zinc-800 rounded-sm
                     font-mono text-sm text-zinc-200 placeholder-zinc-600
                     focus:outline-none focus:border-zinc-600 transition-colors"
        />
      </div>

      <ErrorBox msg={error} />

      <PrimaryBtn
        label={<><Send className="w-4 h-4" /> Send invitation</>}
        onClick={handleInvite}
        loading={saving}
      />
      <SkipBtn label="Skip — invite from Enterprise settings" onClick={onDone} />
    </div>
  );
}

// ── Page orchestrator ─────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router  = useRouter();
  const { data: session, update } = useSession() as
    ReturnType<typeof useSession> & { update: UpdateFn };

  const profileId = (session?.user as { profileId?: string })?.profileId ?? "";

  // Restore state from localStorage so OAuth redirects don't lose progress
  const [step,     setStep]     = useState(0);
  const [role,     setRole]     = useState<Role | null>(null);
  const [orgName,  setOrgName]  = useState("");
  const [orgId,    setOrgId]    = useState("");   // org id after createAgency
  const [saving,   setSaving]   = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // Hydrate from localStorage after mount (SSR safe)
  useEffect(() => {
    const savedRole = ls(LS.role) as Role | "";
    const savedStep = parseInt(ls(LS.step) || "0");
    if (savedRole) { setRole(savedRole); setStep(savedStep || 0); }
  }, []);

  // Persist step + role to localStorage whenever they change
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(LS.step, String(step));
    if (role) localStorage.setItem(LS.role, role);
  }, [step, role]);

  // ── Step totals ────────────────────────────────────────────────────────────
  // freelancer: 0=Welcome 1=Role 2=Connect 3=Skills 4=Profile  → 5 steps
  // client:     0=Welcome 1=Role 2=Goal                         → 3 steps
  // agency:     0=Welcome 1=Role 2=Details 3=Plan 4=Invite      → 5 steps
  const totalSteps = role === "client" ? 3 : 5;

  // ── Completion ─────────────────────────────────────────────────────────────
  const markDone = useCallback(async (destination?: string) => {
    // Client path: send audit batch + welcome email (non-blocking, allSettled).
    // ToS guard enforced at button level via handleGoalClick — only reaches here after tosChecked === true.
    if (role === "client") {
      const provider = (session?.user as { provider?: string })?.provider ?? "unknown";
      await Promise.allSettled([
        fetch("/api/onboarding/audit-events", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            events: [
              { event_type: "ROLE_SELECTED",       event_data: { role: "client" } },
              { event_type: "TOS_ACCEPTED",        event_data: { tos_version: "1.0" } },
              { event_type: "ONBOARDING_COMPLETE", event_data: { role: "client", provider } },
            ],
          }),
        }).catch((e: unknown) => console.error("[onboarding] audit-events failed:", e)),
        fetch("/api/onboarding/welcome-email", { method: "POST" })
          .catch((e: unknown) => console.error("[onboarding] welcome-email failed:", e)),
      ]);
    }

    if (typeof window !== "undefined") {
      localStorage.setItem(LS.done,  "1");
      if (role) localStorage.setItem(LS.uRole, role);
      localStorage.removeItem(LS.step);
      localStorage.removeItem(LS.role);
    }
    if (profileId && role && role !== "agency") {
      updateProfile(profileId, { role: toBackendRole(role) }).catch(() => {});
    }
    if (role) {
      await update({
        role:        toBackendRole(role),
        accountType: role === "agency" ? "agency" : "individual",
      }).catch(() => {});
    }
    router.push(destination ?? (role === "client" ? "/marketplace" : "/dashboard"));
  }, [role, profileId, session, update, router]);

  // ── Role selection ─────────────────────────────────────────────────────────
  function chooseRole(r: Role) {
    setRole(r);
    if (typeof window !== "undefined") localStorage.setItem(LS.role, r);
    if (profileId && r !== "agency") {
      updateProfile(profileId, { role: toBackendRole(r) }).catch(() => {});
    }
    setStep(2);
  }

  // ── Agency creation ────────────────────────────────────────────────────────
  async function handleAgencyDetails(name: string, handle: string) {
    setSaving(true);
    setApiError(null);
    try {
      await createAgency({ owner_id: profileId, name, handle });
      await updateProfile(profileId, { role: "agent-owner" });
      // Fetch the org so we have orgId for plan update + invite
      const org = await getMyOrg(profileId);
      setOrgId(org.id);
      setOrgName(name);
      setStep(3);
    } catch (err) {
      setApiError(
        err instanceof Error ? err.message : "Failed to create agency — handle may already be taken."
      );
    } finally {
      setSaving(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const name = (session?.user as { name?: string | null })?.name ?? null;

  function renderStep() {
    switch (step) {
      case 0: return (
        <StepWelcome
          name={name}
          onNext={() => setStep(1)}
          isLinkedAccount={session?.user?.isLinkedAccount}
          linkedEmail={session?.user?.email ?? undefined}
          linkedProvider={session?.user?.provider
            ? session.user.provider.charAt(0).toUpperCase() + session.user.provider.slice(1)
            : undefined}
        />
      );
      case 1: return <StepRole onNext={chooseRole} />;
      case 2:
        if (role === "freelancer") return <StepFreelancerConnect onNext={() => setStep(3)} />;
        if (role === "client")     return <StepClientGoal onDone={markDone} profileId={profileId} />;
        if (role === "agency")     return (
          <StepAgencyDetails onNext={handleAgencyDetails} saving={saving} externalError={apiError} />
        );
        return null;
      case 3:
        if (role === "freelancer") return (
          <StepFreelancerSkills profileId={profileId} onNext={() => setStep(4)} />
        );
        if (role === "agency") return (
          <StepAgencyPlan orgId={orgId} onNext={() => setStep(4)} />
        );
        return null;
      case 4:
        if (role === "freelancer") return (
          <StepFreelancerProfile profileId={profileId} onDone={() => markDone()} />
        );
        if (role === "agency") return (
          <StepAgencyInvite orgId={orgId} profileId={profileId} onDone={() => markDone()} />
        );
        return null;
      default: return null;
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-4">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[400px] h-48
                        bg-amber-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        <Steps current={step} total={totalSteps} />

        <div className="rounded-sm border border-zinc-800 bg-zinc-900/60 backdrop-blur-sm p-6">
          {renderStep()}
        </div>

        {step > 0 && (
          <p className="text-center font-mono text-xs text-zinc-600 mt-4">
            <button
              onClick={() => markDone()}
              className="hover:text-zinc-400 transition-colors flex items-center gap-1 mx-auto"
            >
              <SkipForward className="w-3 h-3" /> Skip setup — go to dashboard
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
