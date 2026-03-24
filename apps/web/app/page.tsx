"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Bot, Users, Zap, Shield, ShieldCheck, ArrowRight, Check, Star,
  ChevronLeft, ChevronRight, Menu, X, Github, Twitter, Linkedin,
  Globe, Lock, BarChart3, Clock, Layers, Cpu, Fingerprint,
} from "lucide-react";

// ── Data ─────────────────────────────────────────────────────────────────────

const CATEGORIES = [
  {
    id: "AiTalent",
    icon: Users,
    label: "AiTalent",
    tagline: "Remote AI Specialists",
    description: "Vetted freelancers who install, configure, and maintain AI agents on your infrastructure.",
    benefits: ["ZK-verified identity", "Escrow-backed work", "7-day warranty"],
    gradient: "from-sky-500/15 to-sky-900/5",
    border: "border-sky-800/50 hover:border-sky-700",
    glow: "hover:shadow-sky-500/10",
    badge: "bg-sky-500/10 text-sky-400 border-sky-800",
  },
  {
    id: "AiStaff",
    icon: Bot,
    label: "AiStaff",
    tagline: "Enterprise AI Agents",
    description: "Wasm-sandboxed AI software bundles for finance, legal, HR, and operations.",
    benefits: ["Jurisdiction-locked licenses", "Deterministic audit trail", "Drift detection"],
    gradient: "from-amber-500/15 to-amber-900/5",
    border: "border-amber-800/50 hover:border-amber-700",
    glow: "hover:shadow-amber-500/10",
    badge: "bg-amber-500/10 text-amber-400 border-amber-800",
  },
  {
    id: "AiRobot",
    icon: Zap,
    label: "AiRobot",
    tagline: "Physical AI Systems",
    description: "Autonomous robotic agents for manufacturing, logistics, and inspection workflows.",
    benefits: ["Real-time telemetry", "Remote veto control", "Hardware-in-loop testing"],
    gradient: "from-violet-500/15 to-violet-900/5",
    border: "border-violet-800/50 hover:border-violet-700",
    glow: "hover:shadow-violet-500/10",
    badge: "bg-violet-500/10 text-violet-400 border-violet-800",
  },
];

const FEATURES = [
  { icon: Lock,         title: "Zero-Knowledge Identity",   desc: "Biometric verification without storing raw data — only cryptographic commitments persisted." },
  { icon: ShieldCheck,  title: "Veto-First Escrow",         desc: "30-second silent approval window before any payout. Human always in the loop." },
  { icon: BarChart3,    title: "Portable Reputation",       desc: "On-chain W3C VC credentials you can export to any platform. Trust travels with you." },
  { icon: Cpu,          title: "Wasm Sandbox Isolation",    desc: "Every agent runs in a Wasmtime sandbox — no host escape, no credential leakage." },
  { icon: Globe,        title: "Jurisdiction Locking",      desc: "License keys scoped to ISO country codes. Compliance built directly into the protocol." },
  { icon: Clock,        title: "7-Day Mechanic's Warranty", desc: "Artifact hash drift triggers automatic escrow hold. Fix-or-refund guaranteed by design." },
];

const STEPS = [
  { n: "01", title: "Browse & Match",   desc: "Post your requirements. Our Skill Graph surfaces top-ranked talent and agents for your stack." },
  { n: "02", title: "Fund Escrow",      desc: "Lock funds with a signed SOW. 70% held for the developer, 30% for the installer — released together." },
  { n: "03", title: "Deploy & Verify",  desc: "ZK-verified installation runs. Review, veto if needed, sign off with biometric confirmation." },
];

const TESTIMONIALS = [
  {
    name:   "Sarah K.",
    role:   "CTO, FinTech Scale-up",
    avatar: "SK",
    rating: 5,
    text:   "The escrow model changed how we procure AI tooling. We had a drift incident on day 4 — the warranty claim resolved in 2 hours. Nothing like it on the market.",
  },
  {
    name:   "Marcus T.",
    role:   "AI Infrastructure Lead",
    avatar: "MT",
    rating: 5,
    text:   "As an AiTalent installer, the ZK identity tier system makes clients trust me more. I closed 3 contracts in my first week that would have taken months of back-and-forth.",
  },
  {
    name:   "Priya N.",
    role:   "Head of Automation, Logistics Co.",
    avatar: "PN",
    rating: 5,
    text:   "AiRobot category is a game-changer. Real-time telemetry and the remote veto button gave our ops team confidence to deploy autonomous systems we'd been holding back.",
  },
  {
    name:   "Daniel R.",
    role:   "Independent AI Developer",
    avatar: "DR",
    rating: 5,
    text:   "The deterministic trust score is the best marketing I've ever had. Buyers can verify everything — no pitch decks, just cryptographic proof.",
  },
];

const PRICING = {
  monthly: [
    { name: "Starter", label: "Free",  sub: "",     desc: "For individuals exploring.",              highlight: false, features: ["Browse listings", "Tier 0 identity", "5 matches/mo", "Community support"],                                               cta: "Get started"    },
    { name: "Pro",     label: "$49",   sub: "/mo",  desc: "For active talent and small agencies.",   highlight: true,  features: ["All in Starter", "Tier 1 identity", "Unlimited matches", "Escrow access", "Priority support"],                          cta: "Start free trial" },
    { name: "Scale",   label: "$199",  sub: "/mo",  desc: "For enterprises and agencies.",           highlight: false, features: ["All in Pro", "Tier 2 ZK biometric", "Multi-seat licenses", "Dedicated CSM", "SLA guarantee", "Audit log export"],       cta: "Contact sales"  },
  ],
  pertask: [
    { name: "Starter", label: "Free",  sub: "",         desc: "For individuals exploring.",              highlight: false, features: ["Browse listings", "Tier 0 identity", "5 matches/mo", "Community support"],                                           cta: "Get started"    },
    { name: "Pro",     label: "$4.9",  sub: "/task",    desc: "Per successful deployment, no monthly.",  highlight: true,  features: ["All in Starter", "Tier 1 identity", "Unlimited matches", "Escrow access", "Priority support"],                      cta: "Pay as you go"  },
    { name: "Scale",   label: "Custom", sub: "",        desc: "Volume pricing for high-throughput teams.", highlight: false, features: ["All in Pro", "Tier 2 ZK biometric", "Multi-seat licenses", "Dedicated CSM", "SLA guarantee", "Audit log export"], cta: "Contact sales"  },
  ],
};

// ── Nav ───────────────────────────────────────────────────────────────────────

function Nav() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled]  = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", fn);
    return () => window.removeEventListener("scroll", fn);
  }, []);

  return (
    <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? "bg-zinc-950/90 backdrop-blur-md border-b border-zinc-800/80" : "bg-transparent"}`}>
      <nav className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
        {/* Logo */}
        <Link href="/" className="flex items-center group">
          <img src="/logo.png" alt="AiStaff" className="h-24 w-auto" />
        </Link>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-6">
          {(["AiTalent", "AiStaff", "AiRobot"] as const).map((c) => (
            <Link key={c} href="/marketplace" className="font-mono text-xs text-zinc-400 hover:text-zinc-100 transition-colors uppercase tracking-widest">
              {c}
            </Link>
          ))}
          <Link href="/leaderboard" className="font-mono text-xs text-zinc-400 hover:text-zinc-100 transition-colors uppercase tracking-widest">
            Leaderboard
          </Link>
        </div>

        {/* Desktop CTA */}
        <div className="hidden md:flex items-center gap-2">
          <Link href="/login" className="font-mono text-xs text-zinc-400 hover:text-zinc-100 px-3 py-1.5 transition-colors">
            Sign in
          </Link>
          <Link href="/marketplace"
            className="font-mono text-xs bg-amber-500 hover:bg-amber-400 text-zinc-950 font-medium px-4 py-1.5 rounded-sm transition-colors uppercase tracking-widest shadow-md shadow-amber-500/20">
            Hire Now
          </Link>
        </div>

        {/* Mobile toggle */}
        <button onClick={() => setMenuOpen(!menuOpen)} className="md:hidden p-1.5 text-zinc-400 hover:text-zinc-100 transition-colors">
          {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </nav>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden border-t border-zinc-800 bg-zinc-950/95 backdrop-blur-md">
          <div className="px-4 py-4 space-y-2">
            {["AiTalent", "AiStaff", "AiRobot", "Leaderboard"].map((item) => (
              <Link key={item} href={item === "Leaderboard" ? "/leaderboard" : "/marketplace"}
                onClick={() => setMenuOpen(false)}
                className="block font-mono text-sm text-zinc-300 hover:text-white py-2">
                {item}
              </Link>
            ))}
            <div className="pt-2 flex flex-col gap-2">
              <Link href="/login" className="font-mono text-sm text-zinc-400 py-2.5 text-center border border-zinc-800 rounded-sm hover:border-zinc-600 transition-colors">
                Sign in
              </Link>
              <Link href="/marketplace" className="font-mono text-sm bg-amber-500 text-zinc-950 font-medium py-2.5 text-center rounded-sm uppercase tracking-widest">
                Hire Now
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

// ── Hero ──────────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-16">
      {/* Background glow blobs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-amber-500/6 rounded-full blur-3xl animate-glow-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-sky-500/5 rounded-full blur-3xl animate-glow-pulse" style={{ animationDelay: "1.5s" }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[400px] bg-violet-500/3 rounded-full blur-3xl" />
      </div>

      {/* Dot grid */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ backgroundImage: "radial-gradient(circle, #27272a 1px, transparent 1px)", backgroundSize: "32px 32px", opacity: 0.4 }} />

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-20 w-full">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">

          {/* Left: copy */}
          <div className="space-y-7 animate-fade-up">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-sm border border-amber-800/60 bg-amber-500/5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-glow-pulse" />
              <span className="font-mono text-xs text-amber-400 uppercase tracking-widest">Human-on-the-Loop Platform</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-[56px] font-semibold text-zinc-50 leading-[1.08] tracking-tight">
              AI Agent Marketplace<br />
              for{" "}
              <span className="bg-gradient-to-r from-amber-400 via-amber-300 to-amber-500 bg-clip-text text-transparent animate-gradient-x">
                Business Scaling
              </span>
              {" "}and Automation
            </h1>

            <p className="text-base sm:text-lg text-zinc-400 max-w-lg leading-relaxed">
              Connect vetted AI agents with expert installers. Every deployment is
              cryptographically verified, escrow-backed, and reversible — always with a human in control.
            </p>

            <div className="flex flex-col sm:flex-row gap-3">
              <Link href="/marketplace"
                className="inline-flex items-center justify-center gap-2 h-12 px-7 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-mono font-medium text-sm rounded-sm transition-all uppercase tracking-widest shadow-lg shadow-amber-500/25 active:scale-[0.98]">
                Hire Now
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link href="/login"
                className="inline-flex items-center justify-center gap-2 h-12 px-7 border border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-zinc-100 font-mono text-sm rounded-sm transition-all uppercase tracking-widest">
                View Dashboard
              </Link>
            </div>

            {/* Stat chips */}
            <div className="flex flex-wrap gap-2.5 pt-1">
              {[
                { value: "70/30", label: "Escrow Split"  },
                { value: "30s",   label: "Veto Window"   },
                { value: "ZK",    label: "Biometric ID"  },
                { value: "7-day", label: "Warranty"      },
              ].map((s) => (
                <div key={s.label} className="flex items-center gap-2 px-3 py-1.5 border border-zinc-800 rounded-sm bg-zinc-900/50 backdrop-blur-sm">
                  <span className="font-mono text-sm font-semibold text-amber-400">{s.value}</span>
                  <span className="font-mono text-xs text-zinc-500">{s.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right: floating preview cards */}
          <div className="relative h-[400px] lg:h-[500px] hidden sm:block">
            {/* Central card */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 rounded-lg border border-zinc-700/70 bg-zinc-900/95 backdrop-blur-sm p-4 shadow-2xl z-10">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-sm bg-amber-500/15 border border-amber-800 flex items-center justify-center">
                    <Bot className="w-3.5 h-3.5 text-amber-400" />
                  </div>
                  <span className="font-mono text-xs text-zinc-200">FinanceBot v2.4</span>
                </div>
                <span className="font-mono text-[10px] px-1.5 py-0.5 bg-green-500/10 text-green-400 border border-green-900 rounded-sm">LIVE</span>
              </div>
              <div className="space-y-2">
                {[
                  { k: "Trust Score", v: "87/100",   vc: "text-zinc-200" },
                  { k: "Escrow",      v: "$4,200",   vc: "text-amber-400" },
                  { k: "State",       v: "RELEASED", vc: "text-green-400" },
                ].map(({ k, v, vc }) => (
                  <div key={k} className="flex justify-between items-center">
                    <span className="font-mono text-xs text-zinc-500">{k}</span>
                    <span className={`font-mono text-xs font-medium ${vc}`}>{v}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-full w-[87%] bg-gradient-to-r from-amber-500 to-amber-300 rounded-full" />
              </div>
            </div>

            {/* Biometric card */}
            <div className="absolute top-6 right-6 w-48 rounded-lg border border-zinc-700/50 bg-zinc-900/85 backdrop-blur-sm p-3 shadow-xl animate-float" style={{ animationDelay: "0s" }}>
              <div className="flex items-center gap-2 mb-2">
                <ShieldCheck className="w-3.5 h-3.5 text-green-400" />
                <span className="font-mono text-xs text-zinc-400">Biometric</span>
              </div>
              <p className="font-mono text-xs text-green-400 font-medium">ZK Verified ✓</p>
              <p className="font-mono text-[10px] text-zinc-600 mt-1 truncate">0x4a9f…c7e2</p>
            </div>

            {/* Veto card */}
            <div className="absolute bottom-16 left-0 w-48 rounded-lg border border-zinc-700/50 bg-zinc-900/85 backdrop-blur-sm p-3 shadow-xl animate-float" style={{ animationDelay: "2s" }}>
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <span className="font-mono text-xs text-zinc-400">Veto Window</span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="font-mono text-xl font-semibold text-amber-400 tabular-nums">28s</span>
                <span className="font-mono text-xs text-zinc-500">remaining</span>
              </div>
            </div>

            {/* Talent card */}
            <div className="absolute top-20 left-4 w-44 rounded-lg border border-zinc-700/50 bg-zinc-900/85 backdrop-blur-sm p-3 shadow-xl animate-float" style={{ animationDelay: "1s" }}>
              <div className="flex items-center gap-1.5 mb-2">
                <Users className="w-3.5 h-3.5 text-sky-400" />
                <span className="font-mono text-xs text-zinc-400">AiTalent</span>
              </div>
              <p className="font-mono text-xs text-zinc-200 font-medium">Marcus T.</p>
              <p className="font-mono text-xs text-zinc-500 mt-0.5">Trust: 94 · Tier 2</p>
            </div>

            {/* License card */}
            <div className="absolute bottom-6 right-6 w-44 rounded-lg border border-zinc-700/50 bg-zinc-900/85 backdrop-blur-sm p-3 shadow-xl animate-float" style={{ animationDelay: "3s" }}>
              <div className="flex items-center gap-1.5 mb-2">
                <Lock className="w-3.5 h-3.5 text-violet-400" />
                <span className="font-mono text-xs text-zinc-400">License</span>
              </div>
              <p className="font-mono text-xs text-zinc-200">US · 3 seats</p>
              <p className="font-mono text-xs text-zinc-500 mt-0.5">Exp: 2026-12-01</p>
            </div>
          </div>
        </div>
      </div>

      {/* Scroll hint */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 opacity-40">
        <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">Scroll</span>
        <div className="w-px h-8 bg-gradient-to-b from-zinc-500 to-transparent" />
      </div>
    </section>
  );
}

// ── Categories ────────────────────────────────────────────────────────────────

function Categories() {
  return (
    <section className="py-20 sm:py-28 relative">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-12">
          <p className="font-mono text-xs text-amber-400 uppercase tracking-widest mb-3">What we offer</p>
          <h2 className="text-3xl sm:text-4xl font-semibold text-zinc-50 tracking-tight">Our AI Staffing Solutions</h2>
          <p className="mt-3 text-zinc-400 text-sm sm:text-base max-w-xl mx-auto">
            From human specialists to autonomous systems — one platform, one escrow model, zero trust gaps.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            return (
              <Link key={cat.id} href="/marketplace"
                className={`group relative rounded-lg border ${cat.border} bg-gradient-to-b ${cat.gradient} p-6 overflow-hidden hover:shadow-xl ${cat.glow} transition-all duration-300 hover:-translate-y-1`}>
                <div className={`inline-flex items-center gap-2 px-2 py-1 rounded-sm border text-xs font-mono mb-4 ${cat.badge}`}>
                  <Icon className="w-3.5 h-3.5" />
                  {cat.id}
                </div>

                <h3 className="font-semibold text-zinc-100 text-lg mb-1">{cat.label}</h3>
                <p className="font-mono text-xs text-zinc-500 mb-3">{cat.tagline}</p>
                <p className="text-sm text-zinc-400 leading-relaxed mb-5">{cat.description}</p>

                <ul className="space-y-2 mb-5">
                  {cat.benefits.map((b) => (
                    <li key={b} className="flex items-center gap-2 text-xs font-mono text-zinc-400">
                      <Check className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                      {b}
                    </li>
                  ))}
                </ul>

                <div className="flex items-center gap-1 font-mono text-xs text-zinc-500 group-hover:text-zinc-300 transition-colors">
                  Browse {cat.label}
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ── Features ──────────────────────────────────────────────────────────────────

function Features() {
  return (
    <section className="py-20 sm:py-28 border-t border-zinc-900">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-12">
          <p className="font-mono text-xs text-amber-400 uppercase tracking-widest mb-3">Built different</p>
          <h2 className="text-3xl sm:text-4xl font-semibold text-zinc-50 tracking-tight">Platform Features</h2>
          <p className="mt-3 text-zinc-400 text-sm sm:text-base max-w-xl mx-auto">
            Every trust signal is auditable, every payout is reversible, every agent is sandboxed.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.title}
                className="group p-5 rounded-lg border border-zinc-800/60 bg-zinc-900/30 hover:bg-zinc-900/70 hover:border-zinc-700 transition-all duration-200 cursor-default">
                <div className="w-9 h-9 rounded-sm border border-zinc-700 bg-zinc-800 flex items-center justify-center mb-4 group-hover:border-amber-800 group-hover:bg-amber-500/5 transition-all">
                  <Icon className="w-4 h-4 text-zinc-400 group-hover:text-amber-400 transition-colors" />
                </div>
                <h3 className="font-medium text-zinc-100 text-sm mb-2">{f.title}</h3>
                <p className="text-xs text-zinc-500 leading-relaxed">{f.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ── How It Works ──────────────────────────────────────────────────────────────

function HowItWorks() {
  return (
    <section className="py-20 sm:py-28 border-t border-zinc-900">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-14">
          <p className="font-mono text-xs text-amber-400 uppercase tracking-widest mb-3">The process</p>
          <h2 className="text-3xl sm:text-4xl font-semibold text-zinc-50 tracking-tight">How It Works</h2>
          <p className="mt-3 text-zinc-400 text-sm sm:text-base">From hire to deployment in three verifiable steps.</p>
        </div>

        <div className="relative grid sm:grid-cols-3 gap-6 sm:gap-0">
          {/* Connector lines */}
          <div className="hidden sm:block absolute top-10 left-[33%] right-[33%] h-px bg-gradient-to-r from-zinc-800 via-amber-800/40 to-zinc-800" />

          {STEPS.map((step, i) => (
            <div key={step.n} className="flex flex-col items-center text-center px-4 sm:px-6">
              <div className={`relative z-10 w-20 h-20 rounded-full flex items-center justify-center mb-6 border-2 transition-all ${i === 1 ? "border-amber-500 bg-amber-500/10 shadow-lg shadow-amber-500/20" : "border-zinc-700 bg-zinc-900"}`}>
                <span className={`font-mono text-2xl font-semibold ${i === 1 ? "text-amber-400" : "text-zinc-400"}`}>{step.n}</span>
              </div>
              <h3 className="font-semibold text-zinc-100 text-base mb-2">{step.title}</h3>
              <p className="text-sm text-zinc-500 leading-relaxed max-w-xs">{step.desc}</p>
            </div>
          ))}
        </div>

        <div className="mt-14 text-center">
          <Link href="/marketplace"
            className="inline-flex items-center gap-2 h-12 px-8 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-mono font-medium text-sm rounded-sm transition-all uppercase tracking-widest shadow-lg shadow-amber-500/20 active:scale-[0.98]">
            Start Hiring
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

// ── Testimonials ──────────────────────────────────────────────────────────────

function Testimonials() {
  const [idx, setIdx] = useState(0);
  const total = TESTIMONIALS.length;

  const prev = () => setIdx((i) => (i - 1 + total) % total);
  const next = () => setIdx((i) => (i + 1) % total);

  useEffect(() => {
    const id = setInterval(() => setIdx((i) => (i + 1) % total), 5000);
    return () => clearInterval(id);
  }, [total]);

  const t = TESTIMONIALS[idx];

  return (
    <section className="py-20 sm:py-28 border-t border-zinc-900">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-12">
          <p className="font-mono text-xs text-amber-400 uppercase tracking-widest mb-3">Social proof</p>
          <h2 className="text-3xl sm:text-4xl font-semibold text-zinc-50 tracking-tight">Trusted by builders</h2>
        </div>

        <div className="relative max-w-2xl mx-auto">
          <div key={idx} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6 sm:p-8 animate-fade-up">
            <div className="flex gap-0.5 mb-4">
              {Array.from({ length: t.rating }).map((_, i) => (
                <Star key={i} className="w-4 h-4 text-amber-400 fill-amber-400" />
              ))}
            </div>
            <blockquote className="text-zinc-300 text-sm sm:text-base leading-relaxed mb-6">
              &ldquo;{t.text}&rdquo;
            </blockquote>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center flex-shrink-0 shadow-md shadow-amber-500/20">
                <span className="font-mono text-xs text-zinc-950 font-semibold">{t.avatar}</span>
              </div>
              <div>
                <p className="font-medium text-zinc-100 text-sm">{t.name}</p>
                <p className="font-mono text-xs text-zinc-500">{t.role}</p>
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-4 mt-6">
            <button onClick={prev}
              className="w-9 h-9 rounded-sm border border-zinc-800 hover:border-zinc-600 flex items-center justify-center text-zinc-500 hover:text-zinc-300 transition-all">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex gap-1.5">
              {TESTIMONIALS.map((_, i) => (
                <button key={i} onClick={() => setIdx(i)}
                  className={`h-1 rounded-full transition-all duration-300 ${i === idx ? "w-6 bg-amber-400" : "w-1.5 bg-zinc-700 hover:bg-zinc-500"}`} />
              ))}
            </div>
            <button onClick={next}
              className="w-9 h-9 rounded-sm border border-zinc-800 hover:border-zinc-600 flex items-center justify-center text-zinc-500 hover:text-zinc-300 transition-all">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Pricing ───────────────────────────────────────────────────────────────────

function Pricing() {
  const [billing, setBilling] = useState<"monthly" | "pertask">("monthly");
  const plans = PRICING[billing];

  return (
    <section className="py-20 sm:py-28 border-t border-zinc-900">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-10">
          <p className="font-mono text-xs text-amber-400 uppercase tracking-widest mb-3">Pricing</p>
          <h2 className="text-3xl sm:text-4xl font-semibold text-zinc-50 tracking-tight">Simple, transparent pricing</h2>
          <p className="mt-3 text-zinc-400 text-sm sm:text-base">No hidden fees. Escrow costs covered by the 70/30 split.</p>

          {/* Toggle */}
          <div className="inline-flex mt-6 p-0.5 rounded-sm border border-zinc-800 bg-zinc-900">
            {(["monthly", "pertask"] as const).map((mode) => (
              <button key={mode} onClick={() => setBilling(mode)}
                className={`px-5 py-1.5 rounded-sm font-mono text-xs uppercase tracking-widest transition-all ${billing === mode ? "bg-amber-500 text-zinc-950 font-semibold" : "text-zinc-400 hover:text-zinc-200"}`}>
                {mode === "monthly" ? "Monthly" : "Per Task"}
              </button>
            ))}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {plans.map((plan) => (
            <div key={plan.name}
              className={`relative rounded-lg p-6 flex flex-col transition-all duration-200 ${
                plan.highlight
                  ? "border-2 border-amber-500/60 bg-gradient-to-b from-amber-500/5 to-transparent shadow-xl shadow-amber-500/10"
                  : "border border-zinc-800 bg-zinc-900/30 hover:border-zinc-700 hover:bg-zinc-900/50"
              }`}>
              {plan.highlight && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-amber-500 rounded-sm font-mono text-xs text-zinc-950 font-semibold uppercase tracking-widest whitespace-nowrap">
                  Most Popular
                </div>
              )}

              <div className="mb-5">
                <h3 className="font-semibold text-zinc-100 text-base mb-1">{plan.name}</h3>
                <div className="flex items-baseline gap-1 mb-2">
                  <span className="font-mono text-3xl font-semibold text-zinc-50">{plan.label}</span>
                  {plan.sub && <span className="font-mono text-xs text-zinc-500">{plan.sub}</span>}
                </div>
                <p className="text-xs text-zinc-500">{plan.desc}</p>
              </div>

              <ul className="space-y-2.5 flex-1 mb-6">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-xs text-zinc-400">
                    <Check className="w-3.5 h-3.5 text-green-500 flex-shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>

              <Link href="/marketplace"
                className={`w-full h-10 flex items-center justify-center rounded-sm font-mono text-xs font-medium uppercase tracking-widest transition-all ${
                  plan.highlight
                    ? "bg-amber-500 hover:bg-amber-400 text-zinc-950 shadow-md shadow-amber-500/20"
                    : "border border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-zinc-100"
                }`}>
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── CTA Banner ────────────────────────────────────────────────────────────────

function CtaBanner() {
  return (
    <section className="py-20 border-t border-zinc-900">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="relative rounded-lg border border-amber-800/40 bg-gradient-to-b from-amber-500/8 to-transparent p-8 sm:p-14 text-center overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-32 bg-amber-500/10 blur-3xl rounded-full animate-glow-pulse pointer-events-none" />
          <div className="relative z-10 space-y-5">
            <h2 className="text-3xl sm:text-4xl font-semibold text-zinc-50 tracking-tight">
              Ready to deploy with confidence?
            </h2>
            <p className="text-zinc-400 text-sm sm:text-base max-w-xl mx-auto">
              Join thousands of developers, installers, and enterprises who trust AiStaffApp
              for cryptographically verified AI deployments.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
              <Link href="/marketplace"
                className="inline-flex items-center justify-center gap-2 h-12 px-8 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-mono font-medium text-sm rounded-sm transition-all uppercase tracking-widest shadow-lg shadow-amber-500/20 active:scale-[0.98]">
                Hire Now
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link href="/login"
                className="inline-flex items-center justify-center gap-2 h-12 px-8 border border-zinc-700 hover:border-zinc-500 text-zinc-300 font-mono text-sm rounded-sm transition-all uppercase tracking-widest">
                Open Dashboard
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Footer ────────────────────────────────────────────────────────────────────

const FOOTER_LINKS: Record<string, { label: string; href: string }[]> = {
  Platform: [
    { label: "AiTalent",    href: "/marketplace" },
    { label: "AiStaff",     href: "/marketplace" },
    { label: "AiRobot",     href: "/marketplace" },
    { label: "Leaderboard", href: "/leaderboard" },
  ],
  Product: [
    { label: "Dashboard",   href: "/dashboard"   },
    { label: "Marketplace", href: "/marketplace" },
    { label: "Pricing",     href: "#"            },
  ],
  Trust: [
    { label: "Escrow Model",  href: "#" },
    { label: "ZK Identity",   href: "#" },
    { label: "Warranty",      href: "#" },
    { label: "Audit Trail",   href: "#" },
  ],
  Company: [
    { label: "About",   href: "#" },
    { label: "Blog",    href: "#" },
    { label: "Careers", href: "#" },
    { label: "Privacy", href: "#" },
  ],
};

function Footer() {
  return (
    <footer className="border-t border-zinc-900 py-12">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-8 mb-10">
          {/* Brand */}
          <div className="col-span-2 sm:col-span-3 lg:col-span-1">
            <Link href="/" className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-sm bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center">
                <Bot className="w-3.5 h-3.5 text-zinc-950" />
              </div>
              <span className="font-mono text-sm font-medium text-zinc-100">
                AiStaff<span className="text-amber-400">App</span>
              </span>
            </Link>
            <p className="text-xs text-zinc-500 leading-relaxed mb-4">
              Human-on-the-Loop AI deployment marketplace. Trust built in.
            </p>
            <div className="flex gap-2">
              {[Github, Twitter, Linkedin].map((Icon, i) => (
                <a key={i} href="#"
                  className="w-8 h-8 rounded-sm border border-zinc-800 hover:border-zinc-600 flex items-center justify-center text-zinc-500 hover:text-zinc-300 transition-all">
                  <Icon className="w-3.5 h-3.5" />
                </a>
              ))}
            </div>
          </div>

          {/* Links */}
          {Object.entries(FOOTER_LINKS).map(([group, links]) => (
            <div key={group}>
              <p className="font-mono text-xs text-zinc-500 uppercase tracking-widest mb-3">{group}</p>
              <ul className="space-y-2">
                {links.map((l) => (
                  <li key={l.label}>
                    <Link href={l.href} className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom */}
        <div className="border-t border-zinc-900 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="font-mono text-xs text-zinc-600">© 2026 AiStaffApp. All rights reserved.</p>
          <div className="flex items-center gap-4">
            {["Terms", "Privacy", "Security"].map((l) => (
              <a key={l} href="#" className="font-mono text-xs text-zinc-600 hover:text-zinc-400 transition-colors">{l}</a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

// ── JSON-LD ───────────────────────────────────────────────────────────────────

const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      "@id": "https://aistaffglobal.com/#software",
      "name": "AiStaff",
      "url": "https://aistaffglobal.com",
      "description": "AI-native B2B marketplace for AI talent, autonomous AI agents, and AI robotics. Escrow-backed deployments with ZK biometric identity and a 30-second human veto window.",
      "applicationCategory": "BusinessApplication",
      "operatingSystem": "Web",
      "offers": {
        "@type": "AggregateOffer",
        "priceCurrency": "USD",
        "lowPrice": "0",
        "highPrice": "199",
        "offerCount": "3",
      },
    },
    {
      "@type": "OfferCatalog",
      "@id": "https://aistaffglobal.com/#catalog",
      "name": "AiStaff Marketplace Catalog",
      "description": "Three product verticals: AI Talent (vetted engineers), AI Agents (deployable digital workers), AI Robotics (hardware-integrated AI).",
      "itemListElement": [
        {
          "@type": "Offer",
          "name": "AiTalent — Vetted AI Engineers",
          "description": "Hire ZK-verified AI engineers and prompt specialists. Trust score: GitHub 30% + LinkedIn 30% + ZK Biometric 40%. Escrow-backed, 7-day warranty.",
          "url": "https://aistaffglobal.com/marketplace",
          "category": "AI Talent",
        },
        {
          "@type": "Offer",
          "name": "AiStaff — Autonomous AI Agents",
          "description": "Deploy Wasmtime-sandboxed AI agents for finance, legal, HR, and infrastructure. Jurisdiction-locked licenses, deterministic audit trail, drift detection.",
          "url": "https://aistaffglobal.com/marketplace",
          "category": "AI Agents",
        },
        {
          "@type": "Offer",
          "name": "AiRobot — AI Robotics Rental",
          "description": "Rent hardware-integrated AI solutions for manufacturing, logistics, and inspection. Real-time telemetry, remote veto control, hardware-in-loop testing.",
          "url": "https://aistaffglobal.com/marketplace",
          "category": "AI Robotics",
        },
      ],
    },
    {
      "@type": "Organization",
      "@id": "https://aistaffglobal.com/#org",
      "name": "AiStaff",
      "url": "https://aistaffglobal.com",
      "logo": "https://aistaffglobal.com/logo.png",
      "sameAs": [
        "https://github.com/breakdisk/AiStaff",
        "https://www.linkedin.com/company/aistaff",
        "https://twitter.com/aistaff",
      ],
      "description": "AiStaff operates AI Talent, AI Agent, and AI Robotics marketplaces with escrow-backed deployments, ZK biometric identity, and human-in-the-loop veto controls.",
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "How does AiStaff escrow work?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Every deployment on AiStaff uses a 70/30 escrow split: 70% to the developer, 30% to the talent. Funds release only after the DoD checklist is finalized, both parties hold identity tier ≥ 1, and a mandatory 30-second human veto window elapses without cancellation.",
          },
        },
        {
          "@type": "Question",
          "name": "How does AiStaff verify AI talent identity?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "AiStaff uses a three-tier identity system: Unverified, SocialVerified, and BiometricVerified. Trust scores combine GitHub activity (30%), LinkedIn profile (30%), and Zero-Knowledge Proof biometric verification (40%). Biometric data is never stored — only a cryptographic commitment is persisted.",
          },
        },
        {
          "@type": "Question",
          "name": "What is the Mechanic's Warranty on AI agent deployments?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Every AI agent deployment on AiStaff includes a 7-day Mechanic's Warranty. If the deployed agent's artifact hash diverges from its original (artifact drift), a warranty claim is automatically triggered and escrow is frozen until resolution: REMEDIATED, REFUNDED, or REJECTED.",
          },
        },
        {
          "@type": "Question",
          "name": "What is the 30-second veto window?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Before any escrow release, AiStaff enforces a mandatory 30-second pause. A human operator can cancel the payout during this window. This Human-in-the-Loop (HITL) control prevents autonomous AI agents from releasing funds without human oversight.",
          },
        },
      ],
    },
  ],
};

// ── Root Page ─────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-zinc-950 overflow-x-hidden">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />
      <Nav />
      <Hero />
      <Categories />
      <Features />
      <HowItWorks />
      <Testimonials />
      <Pricing />
      <CtaBanner />
      <Footer />
    </main>
  );
}
