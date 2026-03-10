"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { Bot, Github, Loader2, Linkedin } from "lucide-react";

// ── Google icon (Lucide does not include it) ──────────────────────────────────

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

// ── OAuth button ──────────────────────────────────────────────────────────────

function OAuthButton({
  provider,
  label,
  icon,
  callbackUrl,
}: {
  provider: "github" | "google" | "linkedin";
  label: string;
  icon: React.ReactNode;
  callbackUrl: string;
}) {
  return (
    <button
      type="button"
      onClick={() => signIn(provider, { callbackUrl })}
      className="w-full h-11 flex items-center gap-3 px-4 rounded-sm
                 border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 hover:border-zinc-600
                 text-zinc-200 font-mono text-sm transition-all active:scale-[0.98]"
    >
      {icon}
      <span className="flex-1 text-left">{label}</span>
    </button>
  );
}

// ── Inner form (useSearchParams requires Suspense boundary) ───────────────────

function LoginForm() {
  const searchParams = useSearchParams();
  const callbackUrl  = searchParams.get("next") ?? "/dashboard";

  return (
    <div className="rounded-sm border border-zinc-800 bg-zinc-900/60 backdrop-blur-sm p-6 space-y-4">
      <div>
        <h1 className="font-semibold text-zinc-100 text-lg">Sign in</h1>
        <p className="font-mono text-xs text-zinc-500 mt-0.5">
          Connect your account to get started.
        </p>
      </div>

      <div className="space-y-2.5">
        <OAuthButton
          provider="github"
          label="Continue with GitHub"
          callbackUrl={callbackUrl}
          icon={<Github className="w-4 h-4 text-zinc-400" />}
        />
        <OAuthButton
          provider="google"
          label="Continue with Google"
          callbackUrl={callbackUrl}
          icon={<GoogleIcon className="w-4 h-4" />}
        />
        <OAuthButton
          provider="linkedin"
          label="Continue with LinkedIn"
          callbackUrl={callbackUrl}
          icon={<Linkedin className="w-4 h-4 text-zinc-400" />}
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
      </p>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LoginPage() {
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
          <Link href="/" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-sm bg-gradient-to-br from-amber-400 to-amber-600
                            flex items-center justify-center shadow-lg shadow-amber-500/20">
              <Bot className="w-5 h-5 text-zinc-950" />
            </div>
            <span className="font-mono text-base font-medium text-zinc-100">
              AiStaff<span className="text-amber-400">App</span>
            </span>
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
          <LoginForm />
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
