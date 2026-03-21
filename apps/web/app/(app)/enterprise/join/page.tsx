"use client";

import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Building2, CheckCircle, AlertTriangle, Loader2 } from "lucide-react";

// ── Inner component — uses useSearchParams, must be inside <Suspense> ────────

function EnterpriseJoinInner() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const token        = searchParams.get("token") ?? "";

  const { data: session } = useSession();
  const profileId = (session?.user as { profileId?: string })?.profileId ?? "";

  const [status,   setStatus]   = useState<"idle" | "joining" | "joined" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleAccept() {
    if (!profileId || !token) return;
    setStatus("joining");
    try {
      const res = await fetch(`/api/enterprise/invites/${token}/accept`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ profile_id: profileId }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Error ${res.status}`);
      }
      setStatus("joined");
      setTimeout(() => router.push("/enterprise"), 2000);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Failed to accept invitation.");
      setStatus("error");
    }
  }

  if (!token) {
    return (
      <div className="max-w-md w-full border border-red-900 rounded-sm p-6 space-y-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400" />
          <span className="font-mono text-sm text-red-400">Invalid Invitation</span>
        </div>
        <p className="font-mono text-xs text-zinc-400">
          This invitation link is missing or invalid. Please ask your organisation admin to resend the invite.
        </p>
      </div>
    );
  }

  if (status === "joined") {
    return (
      <div className="max-w-md w-full border border-emerald-900 rounded-sm p-6 space-y-3">
        <div className="flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-400" />
          <span className="font-mono text-sm text-emerald-400">Welcome aboard!</span>
        </div>
        <p className="font-mono text-xs text-zinc-400">
          You have successfully joined the organisation. Redirecting you to Enterprise Hub…
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-md w-full space-y-4">
      <div className="flex items-center gap-2">
        <Building2 className="w-4 h-4 text-amber-400" />
        <span className="font-mono text-sm text-zinc-300 uppercase tracking-widest">
          Organisation Invitation
        </span>
      </div>

      <div className="border border-zinc-800 rounded-sm p-5 space-y-4">
        <p className="font-mono text-xs text-zinc-400 leading-relaxed">
          You have been invited to join an organisation on AiStaff.
          Click the button below to accept and gain access to the shared Enterprise Hub,
          deployment analytics, and team resources.
        </p>

        {status === "error" && (
          <div className="flex items-center gap-2 bg-red-950/40 border border-red-900 rounded-sm p-3">
            <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
            <p className="font-mono text-[10px] text-red-400">{errorMsg}</p>
          </div>
        )}

        <button
          onClick={handleAccept}
          disabled={status === "joining" || !profileId}
          className="w-full h-10 rounded-sm bg-amber-950 border border-amber-800 text-amber-400
                     font-mono text-xs hover:bg-amber-900 transition-colors disabled:opacity-50
                     flex items-center justify-center gap-2"
        >
          {status === "joining"
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Joining…</>
            : <><Building2 className="w-3.5 h-3.5" /> Accept Invitation</>
          }
        </button>

        <p className="font-mono text-[10px] text-zinc-600">
          Accepting joins you as a member with access to the organisation's shared workspace.
        </p>
      </div>
    </div>
  );
}

// ── Spinner shown while Suspense resolves ────────────────────────────────────

function JoinSkeleton() {
  return (
    <div className="max-w-md w-full border border-zinc-800 rounded-sm p-6 flex items-center justify-center">
      <Loader2 className="w-5 h-5 text-amber-400 animate-spin" />
    </div>
  );
}

// ── Page export — wraps inner in Suspense so useSearchParams() is safe ───────

export default function EnterpriseJoinPage() {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <Suspense fallback={<JoinSkeleton />}>
        <EnterpriseJoinInner />
      </Suspense>
    </div>
  );
}
