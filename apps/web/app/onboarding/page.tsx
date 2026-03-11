"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession, signIn } from "next-auth/react";
// update() is available on the useSession return value (NextAuth v5)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UpdateFn = (data?: any) => Promise<unknown>;
import { updateProfile, createAgency } from "@/lib/api";
import {
  Bot, Github, Linkedin, Briefcase, Code2, Building2,
  CheckCircle, ChevronRight, ArrowRight, Zap,
} from "lucide-react";

// ── Step indicator ─────────────────────────────────────────────────────────────

function Steps({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2 justify-center mb-6">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`h-1 rounded-full transition-all ${
            i < current
              ? "w-8 bg-amber-400"
              : i === current
              ? "w-8 bg-amber-400/60"
              : "w-4 bg-zinc-700"
          }`}
        />
      ))}
    </div>
  );
}

// ── Step 1: Welcome ────────────────────────────────────────────────────────────

function StepWelcome({ name, onNext }: { name: string | null; onNext: () => void }) {
  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="w-12 h-12 rounded-sm bg-gradient-to-br from-amber-400 to-amber-600
                        flex items-center justify-center mx-auto shadow-lg shadow-amber-500/20">
          <Bot className="w-6 h-6 text-zinc-950" />
        </div>
        <h1 className="text-xl font-semibold text-zinc-100">
          Welcome{name ? `, ${name.split(" ")[0]}` : ""}
        </h1>
        <p className="font-mono text-xs text-zinc-500">
          You&apos;re in. Let&apos;s get you set up in 2 minutes.
        </p>
      </div>

      <div className="space-y-2">
        {[
          { icon: Zap,          label: "ZK-verified identity",    desc: "No raw biometrics stored — ever" },
          { icon: CheckCircle,  label: "Veto-first escrow",       desc: "30s window before any payout moves" },
          { icon: Briefcase,    label: "7-day mechanic's warranty",desc: "Fix-or-refund on every deployment" },
        ].map(({ icon: Icon, label, desc }) => (
          <div key={label} className="flex items-start gap-3 p-3 rounded-sm border border-zinc-800 bg-zinc-900/60">
            <Icon className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-zinc-200">{label}</p>
              <p className="font-mono text-xs text-zinc-500">{desc}</p>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={onNext}
        className="w-full h-11 flex items-center justify-center gap-2 rounded-sm
                   bg-amber-400 hover:bg-amber-300 text-zinc-950 font-mono text-sm font-medium
                   transition-all active:scale-[0.98]"
      >
        Get started <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
}

// ── Step 2: Role ───────────────────────────────────────────────────────────────

type Role = "freelancer" | "client" | "agency";

function StepRole({ onNext }: { onNext: (role: Role) => void }) {
  return (
    <div className="space-y-6">
      <div className="text-center space-y-1">
        <h2 className="text-lg font-semibold text-zinc-100">How will you use AiStaff?</h2>
        <p className="font-mono text-xs text-zinc-500">Pick one — you can switch later from your profile.</p>
      </div>

      <div className="space-y-3">
        <button
          onClick={() => onNext("freelancer")}
          className="w-full p-4 rounded-sm border border-zinc-700 bg-zinc-900/60 hover:border-amber-400/50
                     hover:bg-zinc-800 transition-all active:scale-[0.98] text-left group"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-sm bg-zinc-800 border border-zinc-700
                            group-hover:border-amber-400/40 flex items-center justify-center shrink-0">
              <Code2 className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <p className="font-medium text-zinc-100 text-sm">I&apos;m a Freelancer / Installer</p>
              <p className="font-mono text-xs text-zinc-500 mt-0.5">
                Install &amp; maintain AI agents — earn escrow-backed payments
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-amber-400 ml-auto shrink-0 transition-colors" />
          </div>
        </button>

        <button
          onClick={() => onNext("client")}
          className="w-full p-4 rounded-sm border border-zinc-700 bg-zinc-900/60 hover:border-amber-400/50
                     hover:bg-zinc-800 transition-all active:scale-[0.98] text-left group"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-sm bg-zinc-800 border border-zinc-700
                            group-hover:border-amber-400/40 flex items-center justify-center shrink-0">
              <Briefcase className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <p className="font-medium text-zinc-100 text-sm">I&apos;m a Client / Buyer</p>
              <p className="font-mono text-xs text-zinc-500 mt-0.5">
                Deploy AI agents &amp; hire vetted installers for my business
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-amber-400 ml-auto shrink-0 transition-colors" />
          </div>
        </button>

        <button
          onClick={() => onNext("agency")}
          className="w-full p-4 rounded-sm border border-zinc-700 bg-zinc-900/60 hover:border-amber-400/50
                     hover:bg-zinc-800 transition-all active:scale-[0.98] text-left group"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-sm bg-zinc-800 border border-zinc-700
                            group-hover:border-amber-400/40 flex items-center justify-center shrink-0">
              <Building2 className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <p className="font-medium text-zinc-100 text-sm">I run an Agency</p>
              <p className="font-mono text-xs text-zinc-500 mt-0.5">
                List agents &amp; manage team listings under an org account
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-amber-400 ml-auto shrink-0 transition-colors" />
          </div>
        </button>
      </div>
    </div>
  );
}

// ── Step 3a: Freelancer — upgrade tier ────────────────────────────────────────

function StepFreelancer({ onDone }: { onDone: () => void }) {
  return (
    <div className="space-y-6">
      <div className="text-center space-y-1">
        <h2 className="text-lg font-semibold text-zinc-100">Connect to receive jobs</h2>
        <p className="font-mono text-xs text-zinc-500">
          GitHub or LinkedIn upgrades you to Tier 1 — required to receive job matches.
        </p>
      </div>

      {/* Tier ladder */}
      <div className="space-y-2 text-xs font-mono">
        {[
          { tier: "Tier 0", label: "Google only",        desc: "Browse listings",               active: false },
          { tier: "Tier 1", label: "GitHub / LinkedIn",  desc: "Receive job matches + escrow",  active: true  },
          { tier: "Tier 2", label: "Biometric ZK",       desc: "High-value contracts",           active: false },
        ].map(({ tier, label, desc, active }) => (
          <div key={tier} className={`flex items-center gap-3 p-2.5 rounded-sm border
            ${active ? "border-amber-400/40 bg-amber-400/5" : "border-zinc-800 bg-zinc-900/40"}`}>
            <span className={`w-12 shrink-0 ${active ? "text-amber-400" : "text-zinc-600"}`}>{tier}</span>
            <span className={active ? "text-zinc-200" : "text-zinc-500"}>{label}</span>
            <span className="text-zinc-600 ml-auto">{desc}</span>
          </div>
        ))}
      </div>

      <div className="space-y-2.5">
        <button
          onClick={() => signIn("github", { callbackUrl: "/dashboard" })}
          className="w-full h-11 flex items-center gap-3 px-4 rounded-sm
                     border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 hover:border-zinc-600
                     text-zinc-200 font-mono text-sm transition-all active:scale-[0.98]"
        >
          <Github className="w-4 h-4 text-zinc-400" />
          <span className="flex-1 text-left">Connect GitHub</span>
          <span className="text-[10px] text-amber-400">+30 pts trust</span>
        </button>

        <button
          onClick={() => signIn("linkedin", { callbackUrl: "/dashboard" })}
          className="w-full h-11 flex items-center gap-3 px-4 rounded-sm
                     border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 hover:border-zinc-600
                     text-zinc-200 font-mono text-sm transition-all active:scale-[0.98]"
        >
          <Linkedin className="w-4 h-4 text-zinc-400" />
          <span className="flex-1 text-left">Connect LinkedIn</span>
          <span className="text-[10px] text-amber-400">+15 pts trust</span>
        </button>
      </div>

      <button
        onClick={onDone}
        className="w-full text-center font-mono text-xs text-zinc-500 hover:text-zinc-400 transition-colors"
      >
        Skip for now — I&apos;ll do this later
      </button>
    </div>
  );
}

// ── Step 3b: Client — post a job ───────────────────────────────────────────────

function StepClient({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  return (
    <div className="space-y-6">
      <div className="text-center space-y-1">
        <h2 className="text-lg font-semibold text-zinc-100">You&apos;re ready to hire</h2>
        <p className="font-mono text-xs text-zinc-500">
          Browse the marketplace or use our AI PM to scope your first job.
        </p>
      </div>

      <div className="space-y-3">
        <button
          onClick={() => { onDone(); router.push("/post-job"); }}
          className="w-full p-4 rounded-sm border border-amber-400/40 bg-amber-400/5
                     hover:bg-amber-400/10 transition-all active:scale-[0.98] text-left group"
        >
          <div className="flex items-center gap-3">
            <Bot className="w-5 h-5 text-amber-400 shrink-0" />
            <div>
              <p className="font-medium text-zinc-100 text-sm">Post a job with AI PM</p>
              <p className="font-mono text-xs text-zinc-500 mt-0.5">
                Chat with our PM agent — it scopes your SOW automatically
              </p>
            </div>
            <ArrowRight className="w-4 h-4 text-amber-400 ml-auto shrink-0" />
          </div>
        </button>

        <button
          onClick={() => { onDone(); router.push("/marketplace"); }}
          className="w-full p-4 rounded-sm border border-zinc-700 bg-zinc-900/60
                     hover:border-zinc-600 hover:bg-zinc-800 transition-all active:scale-[0.98] text-left group"
        >
          <div className="flex items-center gap-3">
            <Zap className="w-5 h-5 text-zinc-400 shrink-0" />
            <div>
              <p className="font-medium text-zinc-100 text-sm">Browse agent listings</p>
              <p className="font-mono text-xs text-zinc-500 mt-0.5">
                Pick from ready-to-deploy AI agents in the marketplace
              </p>
            </div>
            <ArrowRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 ml-auto shrink-0 transition-colors" />
          </div>
        </button>
      </div>

      <button
        onClick={onDone}
        className="w-full text-center font-mono text-xs text-zinc-500 hover:text-zinc-400 transition-colors"
      >
        Go to dashboard
      </button>
    </div>
  );
}

// ── Step 3c: Agency — org name + handle ───────────────────────────────────────

function StepAgency({
  onNext,
  saving,
  externalError,
}: {
  onNext:        (orgName: string, handle: string) => void;
  saving:        boolean;
  externalError: string | null;
}) {
  const [orgName, setOrgName] = useState("");
  const [handle,  setHandle]  = useState("");
  const [error,   setError]   = useState<string | null>(null);

  function validate(): boolean {
    if (!orgName.trim()) {
      setError("Organisation name is required.");
      return false;
    }
    if (handle.length < 3) {
      setError("Handle must be at least 3 characters.");
      return false;
    }
    if (!/^[a-z0-9-]+$/.test(handle)) {
      setError("Handle: lowercase letters, numbers, hyphens only.");
      return false;
    }
    return true;
  }

  return (
    <div className="space-y-6">
      <div className="text-center space-y-1">
        <h2 className="text-lg font-semibold text-zinc-100">Name your agency</h2>
        <p className="font-mono text-xs text-zinc-500">You can update this later from your profile.</p>
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
            <span className="px-3 font-mono text-xs text-zinc-600 border-r border-zinc-800 select-none">
              @
            </span>
            <input
              type="text"
              value={handle}
              maxLength={40}
              onChange={e => {
                setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
                setError(null);
              }}
              placeholder="acme-ai"
              className="flex-1 h-full bg-transparent font-mono text-sm text-zinc-200
                         placeholder-zinc-600 focus:outline-none px-3"
            />
          </div>
          <p className="font-mono text-[10px] text-zinc-600">
            Lowercase letters, numbers, hyphens. Min 3 chars.
          </p>
        </div>

        {(error || externalError) && (
          <p className="font-mono text-[10px] text-red-400 border border-red-900
                        bg-red-950/30 px-2 py-1.5 rounded-sm">
            {error ?? externalError}
          </p>
        )}
      </div>

      <button
        disabled={saving}
        onClick={() => { if (validate()) onNext(orgName.trim(), handle); }}
        className="w-full h-11 flex items-center justify-center gap-2 rounded-sm
                   bg-amber-400 hover:bg-amber-300 text-zinc-950 font-mono text-sm
                   font-medium transition-all active:scale-[0.98] disabled:opacity-50
                   disabled:cursor-not-allowed"
      >
        {saving ? "Creating agency…" : <>Continue <ArrowRight className="w-4 h-4" /></>}
      </button>
    </div>
  );
}

// ── Step 4: Agency done ────────────────────────────────────────────────────────

function StepAgencyDone({ orgName, onDone }: { orgName: string; onDone: () => void }) {
  const router = useRouter();
  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="w-12 h-12 rounded-sm bg-zinc-800 border border-zinc-700
                        flex items-center justify-center mx-auto">
          <Building2 className="w-6 h-6 text-amber-400" />
        </div>
        <h2 className="text-lg font-semibold text-zinc-100">{orgName}</h2>
        <p className="font-mono text-xs text-zinc-500">Your agency account is ready to configure.</p>
      </div>

      <button
        onClick={() => { onDone(); router.push("/agency/register"); }}
        className="w-full p-4 rounded-sm border border-amber-400/40 bg-amber-400/5
                   hover:bg-amber-400/10 transition-all active:scale-[0.98] text-left"
      >
        <div className="flex items-center gap-3">
          <Building2 className="w-5 h-5 text-amber-400 shrink-0" />
          <div>
            <p className="font-medium text-zinc-100 text-sm">Complete agency setup</p>
            <p className="font-mono text-xs text-zinc-500 mt-0.5">
              Add description, website and publish your first listing
            </p>
          </div>
          <ArrowRight className="w-4 h-4 text-amber-400 ml-auto shrink-0" />
        </div>
      </button>

      <button
        onClick={onDone}
        className="w-full text-center font-mono text-xs text-zinc-500 hover:text-zinc-400 transition-colors"
      >
        Go to dashboard
      </button>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

// Map onboarding Role → identity_service role string
function toBackendRole(r: Role): "talent" | "client" | "agent-owner" {
  if (r === "freelancer") return "talent";
  if (r === "client")     return "client";
  return "agent-owner";
}

export default function OnboardingPage() {
  const router   = useRouter();
  const { data: session, update } = useSession() as
    ReturnType<typeof useSession> & { update: UpdateFn };
  const [step,     setStep]     = useState(0);
  const [role,     setRole]     = useState<Role | null>(null);
  const [orgName,  setOrgName]  = useState(
    () => typeof window !== "undefined" ? localStorage.getItem("org_name") ?? "" : ""
  );
  const [handle,   setHandle]   = useState(
    () => typeof window !== "undefined" ? localStorage.getItem("org_handle") ?? "" : ""
  );
  const [saving,   setSaving]   = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const totalSteps = role === "agency" ? 4 : 3;
  const profileId  = session?.user?.profileId;

  async function markDone() {
    if (typeof window !== "undefined") {
      localStorage.setItem("onboarding_done", "1");
      if (role) localStorage.setItem("user_role", role);
      if (role === "agency") {
        localStorage.removeItem("org_name");
        localStorage.removeItem("org_handle");
      }
    }
    // Safety-net write: persist role for freelancer/client in case the
    // chooseRole fire-and-forget failed (agency role already written during agency creation)
    if (profileId && role && role !== "agency") {
      updateProfile(profileId, { role: toBackendRole(role) }).catch(() => {/* non-fatal */});
    }
    // Refresh the JWT so the middleware sees the new role immediately —
    // without this, the JWT still has role=null until the next full sign-in.
    if (role) {
      await update({
        role:        toBackendRole(role),
        accountType: role === "agency" ? "agency" : "individual",
      }).catch(() => {/* non-fatal if session update fails */});
    }
    // Route by role — same table as middleware
    router.push(role === "client" ? "/marketplace" : "/dashboard");
  }

  function chooseRole(r: Role) {
    setRole(r);
    if (typeof window !== "undefined") localStorage.setItem("user_role", r);
    // Optimistic write to backend — non-blocking so UI moves instantly.
    // For agency we defer until createAgency succeeds.
    if (profileId && r !== "agency") {
      updateProfile(profileId, { role: toBackendRole(r) }).catch(() => {/* non-fatal */});
    }
    setStep(2);
  }

  async function handleAgencyDetails(name: string, h: string) {
    setOrgName(name);
    setHandle(h);
    setSaving(true);
    setApiError(null);
    try {
      if (profileId) {
        await createAgency({ owner_id: profileId, name, handle: h });
        await updateProfile(profileId, { role: "agent-owner" });
      }
      if (typeof window !== "undefined") {
        localStorage.setItem("org_name",   name);
        localStorage.setItem("org_handle", h);
      }
      setStep(3);
    } catch (err) {
      setApiError(
        err instanceof Error ? err.message : "Failed to create agency — handle may already be taken."
      );
    } finally {
      setSaving(false);
    }
  }

  // Suppress unused-variable warning — handle is stored in localStorage for /agency/register
  void handle;

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-4">
      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[400px] h-48
                        bg-amber-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        <Steps current={step} total={totalSteps} />

        <div className="rounded-sm border border-zinc-800 bg-zinc-900/60 backdrop-blur-sm p-6">
          {step === 0 && (
            <StepWelcome
              name={session?.user?.name ?? null}
              onNext={() => setStep(1)}
            />
          )}
          {step === 1 && <StepRole onNext={chooseRole} />}
          {step === 2 && role === "freelancer" && <StepFreelancer onDone={markDone} />}
          {step === 2 && role === "client"     && <StepClient     onDone={markDone} />}
          {step === 2 && role === "agency"     && <StepAgency     onNext={handleAgencyDetails} saving={saving} externalError={apiError} />}
          {step === 3 && role === "agency"     && <StepAgencyDone orgName={orgName} onDone={markDone} />}
        </div>

        <p className="text-center font-mono text-xs text-zinc-600 mt-4">
          <button
            onClick={markDone}
            className="hover:text-zinc-400 transition-colors"
          >
            Skip setup — take me to the dashboard
          </button>
        </p>
      </div>
    </div>
  );
}
