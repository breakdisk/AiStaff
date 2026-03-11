"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  ArrowLeft, Building2, Globe, CheckCircle,
  Loader2, AlertTriangle,
} from "lucide-react";
import { createAgency, updateProfile } from "@/lib/api";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UpdateFn = (data?: any) => Promise<unknown>;

// ── Page ───────────────────────────────────────────────────────────────────────

export default function AgencyRegisterPage() {
  const router = useRouter();
  const { data: session, status, update } = useSession() as
    ReturnType<typeof useSession> & { update: UpdateFn };

  // Pre-fill from onboarding localStorage
  const [name,        setName]        = useState("");
  const [handle,      setHandle]      = useState("");
  const [description, setDescription] = useState("");
  const [websiteUrl,  setWebsiteUrl]  = useState("");

  const [submitting, setSubmitting]   = useState(false);
  const [error,      setError]        = useState<string | null>(null);
  const [success,    setSuccess]      = useState(false);
  const [agencyHandle, setAgencyHandle] = useState("");

  // Pull onboarding values from localStorage on first render
  useEffect(() => {
    const storedName   = localStorage.getItem("org_name")   ?? "";
    const storedHandle = localStorage.getItem("org_handle") ?? "";
    if (storedName)   setName(storedName);
    if (storedHandle) setHandle(storedHandle);
  }, []);

  const profileId = (session?.user as { profileId?: string })?.profileId;

  // ── Validation ──────────────────────────────────────────────────────────────

  function validate(): string | null {
    if (!name.trim())    return "Organisation name is required.";
    if (handle.length < 3) return "Handle must be at least 3 characters.";
    if (handle.length > 40) return "Handle must be at most 40 characters.";
    if (!/^[a-z0-9-]+$/.test(handle)) {
      return "Handle: lowercase letters, numbers, hyphens only.";
    }
    if (websiteUrl && !/^https?:\/\/.+/.test(websiteUrl)) {
      return "Website must start with https:// or http://";
    }
    return null;
  }

  // ── Submit ──────────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const validationError = validate();
    if (validationError) { setError(validationError); return; }

    if (!profileId) {
      setError("Session not loaded — please refresh the page.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await createAgency({
        owner_id:    profileId,
        name:        name.trim(),
        handle,
        description: description.trim() || undefined,
        website_url: websiteUrl.trim()  || undefined,
      });
      // Persist role to DB (backend also does this atomically, but belt-and-suspenders).
      updateProfile(profileId, { role: "agent-owner" }).catch(() => {});
      // Patch the current JWT so middleware + session.user.role are correct
      // immediately — without this, role stays null until the next full sign-in.
      await update({ role: "agent-owner", accountType: "agency" }).catch(() => {});
      // Clear onboarding hints
      localStorage.removeItem("org_name");
      localStorage.removeItem("org_handle");
      setAgencyHandle(res.handle);
      setSuccess(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("409") || msg.toLowerCase().includes("handle already taken")) {
        setError("That handle is already taken. Choose another.");
      } else {
        setError(msg || "Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  // ── Success state ───────────────────────────────────────────────────────────

  if (success) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-6 text-center">
          <div className="w-16 h-16 rounded-sm bg-emerald-950 border border-emerald-800
                          flex items-center justify-center mx-auto">
            <CheckCircle className="w-8 h-8 text-emerald-400" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <h1 className="text-xl font-semibold text-zinc-100">Agency created</h1>
            <p className="font-mono text-sm text-zinc-400">
              @{agencyHandle} is live on AiStaff.
            </p>
          </div>
          <button
            onClick={() => router.push("/dashboard")}
            className="w-full h-12 lg:h-10 flex items-center justify-center gap-2 rounded-sm
                       bg-amber-400 hover:bg-amber-300 text-zinc-950 font-mono text-sm
                       font-medium transition-all active:scale-[0.98]"
          >
            Go to Dashboard
          </button>
          <button
            onClick={() => router.push("/marketplace")}
            className="w-full text-center font-mono text-xs text-zinc-500 hover:text-zinc-400 transition-colors"
          >
            Browse marketplace
          </button>
        </div>
      </div>
    );
  }

  // ── Form ────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm space-y-6">

        {/* Back link */}
        <Link
          href="/onboarding"
          className="inline-flex items-center gap-1.5 font-mono text-xs text-zinc-500
                     hover:text-zinc-300 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to onboarding
        </Link>

        {/* Header */}
        <div className="space-y-1">
          <h1 className="text-xl font-semibold text-zinc-100">Register your agency</h1>
          <p className="font-mono text-xs text-zinc-500">
            All fields except description and website are required.
          </p>
        </div>

        {/* Unauthenticated warning */}
        {status === "authenticated" && !profileId && (
          <div className="flex items-start gap-2 p-3 rounded-sm border border-amber-800
                          bg-amber-950/40 text-amber-300">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            <p className="font-mono text-xs">
              Session profile ID is missing. Try signing out and back in.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5" noValidate>

          {/* ── Identity section ────────────────────────────────────────────── */}
          <div className="rounded-sm border border-zinc-800 bg-zinc-900/60 p-4 space-y-4">
            <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
              Identity
            </p>

            {/* Org name */}
            <div className="space-y-1.5">
              <label
                htmlFor="agency-name"
                className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest"
              >
                Organisation Name <span className="text-red-500" aria-hidden="true">*</span>
              </label>
              <input
                id="agency-name"
                type="text"
                required
                value={name}
                onChange={e => { setName(e.target.value); setError(null); }}
                placeholder="Acme AI Labs"
                className="w-full h-12 lg:h-10 px-3 bg-zinc-950 border border-zinc-800 rounded-sm
                           font-mono text-sm text-zinc-200 placeholder-zinc-600
                           focus:outline-none focus:border-zinc-600 transition-colors"
              />
            </div>

            {/* Handle */}
            <div className="space-y-1.5">
              <label
                htmlFor="agency-handle"
                className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest"
              >
                Handle <span className="text-red-500" aria-hidden="true">*</span>
              </label>
              <div className="flex items-center h-12 lg:h-10 bg-zinc-950 border border-zinc-800
                              rounded-sm focus-within:border-zinc-600 overflow-hidden transition-colors">
                <span className="px-3 font-mono text-xs text-zinc-600 border-r border-zinc-800 select-none h-full
                                 flex items-center">
                  @
                </span>
                <input
                  id="agency-handle"
                  type="text"
                  required
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
                Lowercase letters, numbers, hyphens only. 3–40 chars.
              </p>
            </div>
          </div>

          {/* ── Optional section ─────────────────────────────────────────────── */}
          <div className="rounded-sm border border-zinc-800 bg-zinc-900/60 p-4 space-y-4">
            <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
              Optional
            </p>

            {/* Description */}
            <div className="space-y-1.5">
              <label
                htmlFor="agency-description"
                className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest"
              >
                Description
              </label>
              <textarea
                id="agency-description"
                rows={3}
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="We deploy AI agents for mid-market SaaS companies."
                className="w-full px-3 py-2.5 bg-zinc-950 border border-zinc-800 rounded-sm
                           font-mono text-sm text-zinc-200 placeholder-zinc-600 resize-none
                           focus:outline-none focus:border-zinc-600 transition-colors"
              />
            </div>

            {/* Website */}
            <div className="space-y-1.5">
              <label
                htmlFor="agency-website"
                className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest"
              >
                Website
              </label>
              <div className="flex items-center h-12 lg:h-10 bg-zinc-950 border border-zinc-800
                              rounded-sm focus-within:border-zinc-600 overflow-hidden transition-colors">
                <Globe className="w-4 h-4 text-zinc-600 mx-3 shrink-0" aria-hidden="true" />
                <input
                  id="agency-website"
                  type="url"
                  value={websiteUrl}
                  onChange={e => { setWebsiteUrl(e.target.value); setError(null); }}
                  placeholder="https://acme.ai"
                  className="flex-1 h-full bg-transparent font-mono text-sm text-zinc-200
                             placeholder-zinc-600 focus:outline-none pr-3"
                />
              </div>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-sm border border-red-900
                            bg-red-950/30">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" aria-hidden="true" />
              <p className="font-mono text-xs text-red-400">{error}</p>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting || !profileId}
            className="w-full h-12 lg:h-10 flex items-center justify-center gap-2 rounded-sm
                       bg-amber-400 hover:bg-amber-300 text-zinc-950 font-mono text-sm font-medium
                       transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                Creating…
              </>
            ) : (
              <>
                <Building2 className="w-4 h-4" aria-hidden="true" />
                Create Agency
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
