"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Github, Loader2, Linkedin, Mail, CheckCircle2 } from "lucide-react";

// ── Google icon (Lucide does not include it) ──────────────────────────────────

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="#1877F2">
      <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.269h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/>
    </svg>
  );
}

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

function MicrosoftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path d="M11.4 2H2v9.4h9.4V2z" fill="#F25022"/>
      <path d="M22 2h-9.4v9.4H22V2z" fill="#7FBA00"/>
      <path d="M11.4 12.6H2V22h9.4v-9.4z" fill="#00A4EF"/>
      <path d="M22 12.6h-9.4V22H22v-9.4z" fill="#FFB900"/>
    </svg>
  );
}

// ── OAuth button ──────────────────────────────────────────────────────────────

function OAuthButton({
  provider,
  label,
  icon,
  callbackUrl,
}: {
  provider:    "github" | "google" | "linkedin" | "facebook" | "microsoft-entra-id";
  label:       string;
  icon:        React.ReactNode;
  callbackUrl: string;
}) {
  function handleClick() {
    // Use a full browser navigation to /api/auth/login instead of fetch()-based
    // signIn(). This eliminates the mobile race condition where window.location.href
    // can start before the browser stores the Set-Cookie from the fetch response,
    // causing the PKCE cookie to be missing on the OAuth callback → InvalidCheck.
    const url = `/api/auth/login?provider=${provider}&callbackUrl=${encodeURIComponent(callbackUrl)}`;
    window.location.href = url;
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="w-full h-11 flex items-center gap-3 px-4 rounded-sm
                 border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 hover:border-zinc-600
                 text-zinc-200 font-mono text-sm transition-all active:scale-[0.98]"
    >
      {icon}
      <span className="flex-1 text-left">{label}</span>
    </button>
  );
}

// ── Magic link form ───────────────────────────────────────────────────────────

function MagicLinkForm({ callbackUrl }: { callbackUrl: string }) {
  const [email, setEmail]   = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent]     = useState(false);
  const [error, setError]   = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError(null);

    try {
      // Fetch CSRF token first — same pattern as /api/auth/login route.
      const csrfRes = await fetch("/api/auth/csrf", { cache: "no-store" });
      const { csrfToken } = (await csrfRes.json()) as { csrfToken?: string };

      // Build and auto-submit a hidden form so the browser handles Set-Cookie
      // before following the redirect — avoids fetch() race condition.
      const form = document.createElement("form");
      form.method = "POST";
      form.action = `/api/auth/signin/nodemailer`;

      const addField = (name: string, value: string) => {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = name;
        input.value = value;
        form.appendChild(input);
      };

      addField("csrfToken",   csrfToken ?? "");
      addField("email",       email.trim());
      addField("callbackUrl", callbackUrl);
      addField("redirect",    "false");

      document.body.appendChild(form);

      // Submit via fetch to check the response — nodemailer provider returns
      // a redirect to /auth/verify-request on success (status 200 with URL).
      const submitRes = await fetch(`/api/auth/signin/nodemailer`, {
        method:  "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          csrfToken:   csrfToken ?? "",
          email:       email.trim(),
          callbackUrl: callbackUrl,
          redirect:    "false",
        }),
        redirect: "follow",
      });

      document.body.removeChild(form);

      if (submitRes.ok || submitRes.status === 200) {
        setSent(true);
      } else {
        setError("Could not send sign-in link. Please try again.");
      }
    } catch {
      setError("Network error — please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="flex items-center gap-2.5 px-4 py-3 rounded-sm border border-emerald-800/60 bg-emerald-950/40">
        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
        <p className="font-mono text-xs text-emerald-300">
          Sign-in link sent — check your inbox. Expires in 10 minutes.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="flex gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="flex-1 h-11 px-3 rounded-sm border border-zinc-700 bg-zinc-900
                     text-zinc-200 font-mono text-sm placeholder:text-zinc-600
                     focus:outline-none focus:border-amber-400/60 focus:ring-0
                     transition-colors"
        />
        <button
          type="submit"
          disabled={loading || !email.trim()}
          className="h-11 px-4 rounded-sm bg-amber-400 hover:bg-amber-300
                     text-zinc-950 font-mono text-sm font-semibold
                     disabled:opacity-40 disabled:cursor-not-allowed
                     transition-all active:scale-[0.98] shrink-0"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send link"}
        </button>
      </div>
      {error && (
        <p className="font-mono text-[11px] text-red-400">{error}</p>
      )}
    </form>
  );
}

// ── Inner form (useSearchParams requires Suspense boundary) ───────────────────

function LoginForm({ showMicrosoft }: { showMicrosoft: boolean }) {
  const searchParams = useSearchParams();
  const callbackUrl  = searchParams.get("next") ?? "/dashboard";

  return (
    <div className="rounded-sm border border-zinc-800 bg-zinc-900/60 backdrop-blur-sm p-6 space-y-3">
      <div>
        <h1 className="font-semibold text-zinc-100 text-lg">Sign in</h1>
        <p className="font-mono text-xs text-zinc-500 mt-0.5">
          Connect your account to get started.
        </p>
      </div>

      {/* Magic link — shown first so corporate users see it immediately */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Mail className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
          <p className="font-mono text-xs text-zinc-500">Sign in with email link</p>
        </div>
        <MagicLinkForm callbackUrl={callbackUrl} />
      </div>

      {/* Divider */}
      <div className="flex items-center gap-3">
        <div className="flex-1 border-t border-zinc-800" />
        <span className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest">or continue with</span>
        <div className="flex-1 border-t border-zinc-800" />
      </div>

      <div className="space-y-2">
        {showMicrosoft && (
          <OAuthButton
            provider="microsoft-entra-id"
            label="Continue with Microsoft"
            callbackUrl={callbackUrl}
            icon={<MicrosoftIcon className="w-4 h-4" />}
          />
        )}
        <OAuthButton
          provider="linkedin"
          label="Continue with LinkedIn"
          callbackUrl={callbackUrl}
          icon={<Linkedin className="w-4 h-4 text-zinc-400" />}
        />
        <OAuthButton
          provider="google"
          label="Continue with Google"
          callbackUrl={callbackUrl}
          icon={<GoogleIcon className="w-4 h-4" />}
        />
        <OAuthButton
          provider="facebook"
          label="Continue with Facebook"
          callbackUrl={callbackUrl}
          icon={<FacebookIcon className="w-4 h-4" />}
        />
        <OAuthButton
          provider="github"
          label="Continue with GitHub"
          callbackUrl={callbackUrl}
          icon={<Github className="w-4 h-4 text-zinc-400" />}
        />
      </div>

      {/* Tier info */}
      <div className="pt-1 space-y-1.5 border-t border-zinc-800">
        <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest">
          Verification tiers
        </p>
        <div className="space-y-1">
          {[
            { label: "Google only",       desc: "Browse listings — Tier 0" },
            { label: "GitHub / LinkedIn", desc: "Receive jobs — Tier 1" },
            { label: "Biometric ZK",      desc: "High-value contracts — Tier 2" },
          ].map(({ label, desc }) => (
            <div key={label} className="flex items-baseline gap-2">
              <span className="font-mono text-[10px] text-zinc-400 w-36 shrink-0">{label}</span>
              <span className="font-mono text-[10px] text-zinc-600">{desc}</span>
            </div>
          ))}
        </div>
      </div>

      <p className="font-mono text-[10px] text-zinc-600 text-center pt-1">
        By continuing you agree to our{" "}
        <Link href="/terms" className="text-zinc-400 hover:text-zinc-200 transition-colors">
          Terms of Service
        </Link>
        {" "}and{" "}
        <Link href="/privacy" className="text-zinc-400 hover:text-zinc-200 transition-colors">
          Privacy Policy
        </Link>
      </p>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LoginPage() {
  // Read server-side: only render Microsoft button when credentials are configured.
  // Avoids AADSTS900144 ("client_id is required") when env var is absent.
  const showMicrosoft = !!process.env.AZURE_AD_CLIENT_ID;

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-4">

      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[500px] h-64
                        bg-amber-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-sm space-y-5">

        {/* Logo */}
        <div className="flex flex-col items-center gap-2 mb-1">
          <Link href="/" className="flex items-center">
            <img src="/logo.png" alt="AiStaff" className="h-36 w-auto" />
          </Link>
          <p className="font-mono text-xs text-zinc-500 uppercase tracking-widest">
            Human-on-the-Loop Platform
          </p>
        </div>

        <Suspense fallback={
          <div className="rounded-sm border border-zinc-800 bg-zinc-900/60 p-6 flex items-center justify-center h-40">
            <Loader2 className="w-5 h-5 text-zinc-600 animate-spin" />
          </div>
        }>
          <LoginForm showMicrosoft={showMicrosoft} />
        </Suspense>

        <p className="text-center font-mono text-xs text-zinc-600">
          <Link href="/" className="hover:text-zinc-400 transition-colors">
            ← Back to landing
          </Link>
        </p>
      </div>
    </div>
  );
}
