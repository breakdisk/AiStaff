"use client";

import { useEffect, useState } from "react";
import { useSession, signIn } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import { CheckCircle2, XCircle, Loader2, Building2 } from "lucide-react";
interface TokenPayload {
  type?:   string;
  org_id?: string;
  email?:  string;
  exp?:    number;
}

function decodeJwtPayload(token: string): TokenPayload {
  try {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64)) as TokenPayload;
  } catch {
    return {};
  }
}

export default function JoinPortalPage() {
  const { token } = useParams<{ token: string }>();
  const { data: session, status } = useSession();
  const router = useRouter();

  const [state, setState] = useState<"loading" | "expired" | "ready" | "accepting" | "done" | "error">("loading");
  const [orgName, setOrgName] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // Decode token client-side to check expiry + get org info (no secret needed for display)
  useEffect(() => {
    if (!token) { setState("expired"); return; }
    try {
      const payload = decodeJwtPayload(token);
      if (!payload.exp || payload.exp * 1000 < Date.now()) {
        setState("expired");
        return;
      }
      setState("ready");
    } catch {
      setState("expired");
    }
  }, [token]);

  // Once authenticated, auto-accept
  useEffect(() => {
    if (status !== "authenticated" || state !== "ready") return;
    accept();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, state]);

  async function accept() {
    setState("accepting");
    try {
      const r = await fetch(`/api/portal/join/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const d = await r.json();
      if (!r.ok) {
        // Already accepted is fine — just redirect
        if (r.status === 409) {
          setState("done");
          setTimeout(() => router.push("/marketplace"), 1500);
          return;
        }
        setErrorMsg(d.error ?? "Something went wrong");
        setState("error");
        return;
      }
      setState("done");
      const handle = d.org_handle;
      setTimeout(() => router.push(handle ? `/portal/${handle}` : "/marketplace"), 1500);
    } catch (e) {
      setErrorMsg("Network error — please try again");
      setState("error");
    }
  }

  function handleSignIn() {
    signIn(undefined, { callbackUrl: `/portal/join/${token}` });
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm border border-zinc-800 rounded-sm bg-zinc-900 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-amber-400" />
          <p className="font-mono text-xs text-amber-400 uppercase tracking-widest">Agency Invite</p>
        </div>

        {state === "loading" && (
          <div className="flex items-center gap-2 py-4">
            <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />
            <p className="font-mono text-xs text-zinc-500">Verifying invite…</p>
          </div>
        )}

        {state === "expired" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <XCircle className="w-4 h-4 text-red-500" />
              <p className="font-mono text-sm text-zinc-200 font-medium">Link expired</p>
            </div>
            <p className="font-mono text-xs text-zinc-500">
              This invite link has expired or is invalid. Contact the agency to request a new one.
            </p>
          </div>
        )}

        {state === "ready" && status === "unauthenticated" && (
          <div className="space-y-4">
            <div>
              <p className="font-mono text-sm text-zinc-200 font-medium">You&apos;ve been invited</p>
              <p className="font-mono text-xs text-zinc-500 mt-1">
                Sign in to accept this invitation and link your account to the agency.
              </p>
            </div>
            <button
              onClick={handleSignIn}
              className="w-full h-9 rounded-sm bg-amber-400 text-zinc-900 font-mono text-xs font-bold
                         uppercase tracking-widest hover:bg-amber-300 transition-colors"
            >
              Sign in to accept →
            </button>
          </div>
        )}

        {(state === "ready" && status === "authenticated") || state === "accepting" ? (
          <div className="flex items-center gap-2 py-4">
            <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
            <p className="font-mono text-xs text-zinc-400">Linking your account…</p>
          </div>
        ) : null}

        {state === "done" && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <p className="font-mono text-sm text-zinc-200 font-medium">Invite accepted!</p>
            </div>
            <p className="font-mono text-xs text-zinc-500">Redirecting to agency portal…</p>
          </div>
        )}

        {state === "error" && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <XCircle className="w-4 h-4 text-red-500" />
              <p className="font-mono text-sm text-zinc-200 font-medium">Error</p>
            </div>
            <p className="font-mono text-xs text-zinc-500">{errorMsg}</p>
            <button onClick={accept} className="font-mono text-xs text-amber-400 hover:text-amber-300 transition-colors">
              Try again →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
