"use client";

import { Suspense, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Bot, ArrowRight, Loader2, AlertCircle, User } from "lucide-react";

// ── Demo accounts ─────────────────────────────────────────────────────────────

const DEMO_ACCOUNTS = [
  { label: "Client",             email: "client@demo.com", desc: "Tier 1 · Browse & Deploy"                  },
  { label: "Talent",             email: "talent@demo.com", desc: "Tier 2 · ZK Biometric Verified"            },
  { label: "Developer + Talent", email: "dev@demo.com",    desc: "Tier 2 · Publishes & installs own agents"  },
];

// ── Inner form — uses useSearchParams so must be inside <Suspense> ────────────

function LoginForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const next         = searchParams.get("next") ?? "/dashboard";

  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [pending,  startTransition] = useTransition();

  function quickFill(acc: typeof DEMO_ACCOUNTS[number]) {
    setEmail(acc.email);
    setPassword("demo");
    setError("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    startTransition(async () => {
      const res = await fetch("/api/auth/login", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      if (res.ok) {
        router.push(next);
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Sign in failed.");
      }
    });
  }

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 backdrop-blur-sm p-6 space-y-5">
      <div>
        <h1 className="font-semibold text-zinc-100 text-lg">Sign in</h1>
        <p className="font-mono text-xs text-zinc-500 mt-0.5">
          Use a demo account to explore the platform.
        </p>
      </div>

      {/* Quick-fill chips */}
      <div className="space-y-1.5">
        <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest">Quick fill</p>
        <div className="flex flex-col gap-2">
          {DEMO_ACCOUNTS.map((acc) => (
            <button
              key={acc.email}
              type="button"
              onClick={() => quickFill(acc)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-sm border text-left
                          transition-all active:scale-[0.98]
                          ${email === acc.email
                            ? "border-amber-700 bg-amber-500/8 text-amber-300"
                            : "border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:border-zinc-600 hover:bg-zinc-800/50"
                          }`}
            >
              <User className="w-3.5 h-3.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-mono text-xs font-medium leading-none mb-0.5">{acc.label}</p>
                <p className="font-mono text-[10px] text-zinc-500 truncate">{acc.desc}</p>
              </div>
              <span className="font-mono text-[10px] text-zinc-600 flex-shrink-0">
                {acc.email.split("@")[0]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Divider */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-px bg-zinc-800" />
        <span className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest">or enter manually</span>
        <div className="flex-1 h-px bg-zinc-800" />
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="space-y-1">
          <label className="font-mono text-xs text-zinc-400">Email</label>
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(""); }}
            placeholder="you@example.com"
            className="w-full h-10 px-3 rounded-sm border border-zinc-700 bg-zinc-800/50
                       font-mono text-sm text-zinc-100 placeholder:text-zinc-600
                       focus:outline-none focus:border-amber-600 transition-colors"
          />
        </div>

        <div className="space-y-1">
          <label className="font-mono text-xs text-zinc-400">Password</label>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(""); }}
            placeholder="••••••••"
            className="w-full h-10 px-3 rounded-sm border border-zinc-700 bg-zinc-800/50
                       font-mono text-sm text-zinc-100 placeholder:text-zinc-600
                       focus:outline-none focus:border-amber-600 transition-colors"
          />
        </div>

        {error && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-sm border border-red-900 bg-red-950/40">
            <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
            <p className="font-mono text-xs text-red-400">{error}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full h-11 flex items-center justify-center gap-2 mt-1 rounded-sm
                     bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed
                     text-zinc-950 font-mono font-medium text-sm uppercase tracking-widest
                     transition-all active:scale-[0.98] shadow-md shadow-amber-500/20"
        >
          {pending
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <><span>Sign in</span><ArrowRight className="w-4 h-4" /></>
          }
        </button>
      </form>

      <p className="font-mono text-[10px] text-zinc-600 text-center">
        Demo password for all accounts:{" "}
        <span className="text-zinc-400 font-medium">demo</span>
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

        {/* Form wrapped in Suspense (useSearchParams requirement) */}
        <Suspense fallback={
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-6 flex items-center justify-center h-40">
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
