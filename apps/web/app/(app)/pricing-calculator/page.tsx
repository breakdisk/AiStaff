"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Calculator, ChevronRight, CheckCircle2, Info } from "lucide-react";
import { AppSidebar, AppMobileNav } from "@/components/AppSidebar";

// ── Constants ─────────────────────────────────────────────────────────────────

const PLAN_FEES: Record<string, { subscription: number; escrow_pct: number; payout_pct: number; label: string }> = {
  starter:    { subscription: 0,    escrow_pct: 1.5, payout_pct: 0.25, label: "Starter (Free)"       },
  pro:        { subscription: 4900, escrow_pct: 0.8, payout_pct: 0.25, label: "Pro ($49/mo)"         },
  enterprise: { subscription: 19900,escrow_pct: 0.5, payout_pct: 0.10, label: "Enterprise ($199/mo)" },
};

const PREMIUM_SUPPORT_CENTS = 9900; // $99/mo


// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtUSD(cents: number, decimals = 0) {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", minimumFractionDigits: decimals, maximumFractionDigits: decimals,
  }).format(cents / 100);
}

// ── BreakdownRow ──────────────────────────────────────────────────────────────

function BreakdownRow({
  label, amount, sub, highlight = false, dimmed = false,
}: { label: string; amount: number; sub?: string; highlight?: boolean; dimmed?: boolean }) {
  return (
    <div className={`flex items-start justify-between py-2 border-b border-zinc-800/60 ${dimmed ? "opacity-40" : ""}`}>
      <div>
        <p className={`font-mono text-xs ${highlight ? "text-zinc-100 font-medium" : "text-zinc-400"}`}>{label}</p>
        {sub && <p className="font-mono text-[9px] text-zinc-600 mt-0.5">{sub}</p>}
      </div>
      <p className={`font-mono text-sm tabular-nums font-medium ${
        highlight ? "text-amber-400" : "text-zinc-300"
      }`}>
        {amount === 0 ? <span className="text-zinc-600">$0</span> : fmtUSD(amount)}
      </p>
    </div>
  );
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

function Tooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative inline-block ml-1">
      <Info
        className="w-3 h-3 text-zinc-600 inline cursor-pointer"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
      />
      {show && (
        <span className="absolute left-4 bottom-0 z-30 w-48 font-mono text-[9px] text-zinc-400 bg-zinc-900 border border-zinc-700 rounded-sm p-2 leading-relaxed">
          {text}
        </span>
      )}
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PricingCalculatorPage() {
  // ── Inputs ──────────────────────────────────────────────────────────────────
  const [engagementCents,  setEngagementCents]  = useState(500000);   // $5000
  const [durationWeeks,    setDurationWeeks]    = useState(4);
  const [plan,             setPlan]             = useState<"starter" | "pro" | "enterprise">("starter");
  const [premiumSupport,   setPremiumSupport]   = useState(false);
  const [successFeeCents,  setSuccessFeeCents]  = useState(0);
  const [payoutRailFee,    setPayoutRailFee]    = useState<"stripe" | "wise" | "paypal" | "payoneer">("stripe");
  const [escrowEnabled,    setEscrowEnabled]    = useState(true);

  const PAYOUT_FEES = { stripe: 25, wise: 41, paypal: 150, payoneer: 200 }; // basis pts × 10 → actual pct * 100

  // ── Calculations ─────────────────────────────────────────────────────────────
  const calc = useMemo(() => {
    const p = PLAN_FEES[plan];
    const railPct = PAYOUT_FEES[payoutRailFee] / 10000;  // e.g. 25 → 0.0025

    const escrowFee  = escrowEnabled ? Math.round(engagementCents * (p.escrow_pct / 100)) : 0;
    const payoutFee  = Math.round((engagementCents + successFeeCents) * railPct);
    const subFee     = p.subscription;
    const supportFee = premiumSupport ? PREMIUM_SUPPORT_CENTS : 0;

    const totalClientPays = engagementCents + escrowFee;
    const totalTalentGets = engagementCents + successFeeCents - payoutFee;
    const platformRevenue = subFee + supportFee + escrowFee;

    return {
      escrowFee, payoutFee, subFee, supportFee,
      totalClientPays, totalTalentGets, platformRevenue,
      effectivePlatformPct: platformRevenue > 0
        ? ((platformRevenue / engagementCents) * 100).toFixed(1)
        : "0",
    };
  }, [engagementCents, plan, premiumSupport, successFeeCents, payoutRailFee, escrowEnabled]);

  // ── Input helpers ─────────────────────────────────────────────────────────────
  function SliderRow({ label, value, min, max, step, onChange, fmt }: {
    label: string; value: number; min: number; max: number; step: number;
    onChange: (v: number) => void; fmt: (v: number) => string;
  }) {
    return (
      <div className="space-y-1.5">
        <div className="flex justify-between">
          <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">{label}</span>
          <span className="font-mono text-[10px] text-zinc-200 tabular-nums">{fmt(value)}</span>
        </div>
        <input
          type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="w-full h-1 accent-amber-500 cursor-pointer"
        />
        <div className="flex justify-between">
          <span className="font-mono text-[9px] text-zinc-700">{fmt(min)}</span>
          <span className="font-mono text-[9px] text-zinc-700">{fmt(max)}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row min-h-screen">
      <AppSidebar />

      {/* Main */}
      <main className="flex-1 p-4 pb-20 lg:pb-4 max-w-4xl mx-auto w-full space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-mono text-sm font-medium text-zinc-300 uppercase tracking-widest">Pricing Calculator</h1>
            <p className="font-mono text-[10px] text-zinc-600 mt-0.5">See exactly what you pay — no surprises at checkout</p>
          </div>
          <Calculator className="w-5 h-5 text-amber-500" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Left: Inputs */}
          <div className="space-y-4">
            {/* Engagement value */}
            <div className="border border-zinc-800 rounded-sm p-3 space-y-3">
              <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest">Engagement</p>
              <SliderRow
                label="Engagement value"
                value={engagementCents} min={50000} max={2000000} step={10000}
                onChange={setEngagementCents}
                fmt={v => fmtUSD(v)}
              />
              <SliderRow
                label="Duration (weeks)"
                value={durationWeeks} min={1} max={52} step={1}
                onChange={setDurationWeeks}
                fmt={v => `${v}w`}
              />
              <SliderRow
                label="Success / bonus fee"
                value={successFeeCents} min={0} max={200000} step={5000}
                onChange={setSuccessFeeCents}
                fmt={v => v === 0 ? "None" : fmtUSD(v)}
              />
            </div>

            {/* Plan selector */}
            <div className="border border-zinc-800 rounded-sm p-3 space-y-2">
              <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest">Subscription Plan</p>
              <div className="space-y-1.5">
                {(["starter", "pro", "enterprise"] as const).map(p => (
                  <button
                    key={p}
                    onClick={() => setPlan(p)}
                    className={`w-full flex items-center justify-between h-9 px-3 rounded-sm border font-mono text-xs transition-colors ${
                      plan === p
                        ? "border-amber-700 bg-amber-950/30 text-amber-400"
                        : "border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
                    }`}
                  >
                    <span>{PLAN_FEES[p].label}</span>
                    <span className="text-[10px] text-zinc-600">
                      escrow {PLAN_FEES[p].escrow_pct}%
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Options */}
            <div className="border border-zinc-800 rounded-sm p-3 space-y-3">
              <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest">Options</p>

              {/* Payout rail */}
              <div>
                <p className="font-mono text-[10px] text-zinc-500 mb-1.5">Payout rail</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {(["stripe", "wise", "paypal", "payoneer"] as const).map(r => (
                    <button
                      key={r}
                      onClick={() => setPayoutRailFee(r)}
                      className={`h-8 rounded-sm border font-mono text-[10px] transition-colors flex items-center justify-between px-2 ${
                        payoutRailFee === r
                          ? "border-amber-700 bg-amber-950/30 text-amber-400"
                          : "border-zinc-800 text-zinc-500 hover:border-zinc-700"
                      }`}
                    >
                      <span className="capitalize">{r}</span>
                      <span className="text-zinc-600">{(PAYOUT_FEES[r] / 100).toFixed(2)}%</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Toggles */}
              <div className="space-y-2">
                {[
                  {
                    label: "Milestone Escrow",
                    sub: "Funds held until milestone approved",
                    value: escrowEnabled,
                    set: setEscrowEnabled,
                  },
                  {
                    label: "Premium Support",
                    sub: `4h SLA — ${fmtUSD(PREMIUM_SUPPORT_CENTS)}/mo`,
                    value: premiumSupport,
                    set: setPremiumSupport,
                  },
                ].map(({ label, sub, value, set }) => (
                  <div key={label} className="flex items-center justify-between">
                    <div>
                      <p className="font-mono text-[10px] text-zinc-300">{label}</p>
                      <p className="font-mono text-[9px] text-zinc-600">{sub}</p>
                    </div>
                    <button
                      onClick={() => set(v => !v)}
                      className={`relative w-10 h-5 rounded-full border transition-colors ${
                        value ? "border-amber-700 bg-amber-950/40" : "border-zinc-700 bg-zinc-800"
                      }`}
                    >
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${
                        value ? "left-5 bg-amber-400" : "left-0.5 bg-zinc-400"
                      }`} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Breakdown */}
          <div className="space-y-4">
            {/* Client view */}
            <div className="border border-zinc-800 rounded-sm p-3">
              <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest mb-2">Client Pays</p>
              <BreakdownRow
                label="Engagement value"
                sub="Base fee for the work"
                amount={engagementCents}
              />
              <BreakdownRow
                label={`Escrow fee (${PLAN_FEES[plan].escrow_pct}%)`}
                sub="Neutral hold — returned if disputed"
                amount={calc.escrowFee}
                dimmed={!escrowEnabled}
              />
              <BreakdownRow
                label="Subscription"
                sub={PLAN_FEES[plan].label}
                amount={calc.subFee}
                dimmed={calc.subFee === 0}
              />
              {premiumSupport && (
                <BreakdownRow label="Premium Support" sub="4h SLA add-on" amount={PREMIUM_SUPPORT_CENTS} />
              )}
              <div className="mt-2 pt-2 flex justify-between">
                <p className="font-mono text-xs font-medium text-zinc-200">Total</p>
                <p className="font-mono text-lg font-medium text-amber-400 tabular-nums">{fmtUSD(calc.totalClientPays)}</p>
              </div>
            </div>

            {/* Talent view */}
            <div className="border border-zinc-800 rounded-sm p-3">
              <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest mb-2">Talent Receives</p>
              <BreakdownRow
                label="Engagement value"
                amount={engagementCents}
              />
              {successFeeCents > 0 && (
                <BreakdownRow label="Success fee" sub="Released on SLA met" amount={successFeeCents} />
              )}
              <BreakdownRow
                label={`Payout fee (${(PAYOUT_FEES[payoutRailFee] / 100).toFixed(2)}%)`}
                sub={`via ${payoutRailFee.charAt(0).toUpperCase() + payoutRailFee.slice(1)}`}
                amount={calc.payoutFee}
              />
              <div className="mt-2 pt-2 flex justify-between">
                <p className="font-mono text-xs font-medium text-zinc-200">Net payout</p>
                <p className="font-mono text-lg font-medium text-green-400 tabular-nums">{fmtUSD(calc.totalTalentGets)}</p>
              </div>
            </div>

            {/* Platform revenue breakdown */}
            <div className="border border-zinc-800 rounded-sm p-3">
              <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest mb-2">Platform Revenue</p>
              <div className="flex items-center justify-between">
                <p className="font-mono text-xs text-zinc-400">Total platform earn</p>
                <p className="font-mono text-sm font-medium text-zinc-300 tabular-nums">{fmtUSD(calc.platformRevenue)}</p>
              </div>
              <div className="flex items-center justify-between mt-1">
                <p className="font-mono text-[10px] text-zinc-600">Effective rate
                  <Tooltip text="Platform revenue as % of engagement value — compares favourably to 10–20% on traditional platforms." />
                </p>
                <p className={`font-mono text-sm font-medium tabular-nums ${
                  parseFloat(calc.effectivePlatformPct) < 3 ? "text-green-400" : "text-amber-400"
                }`}>{calc.effectivePlatformPct}%</p>
              </div>
              <div className="mt-3 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-500 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, parseFloat(calc.effectivePlatformPct) * 5)}%` }}
                />
              </div>
              <div className="flex justify-between mt-1">
                <span className="font-mono text-[9px] text-zinc-700">0%</span>
                <span className="font-mono text-[9px] text-zinc-700">AiStaffApp avg ~1.2%</span>
                <span className="font-mono text-[9px] text-zinc-700">Upwork 20%</span>
              </div>
            </div>

            {/* CTA */}
            <button className="w-full h-10 rounded-sm border border-amber-800 bg-amber-950/30 text-amber-400
                               font-mono text-xs uppercase tracking-widest hover:border-amber-600 transition-colors
                               flex items-center justify-center gap-2">
              Start Engagement at These Terms
              <ChevronRight className="w-3.5 h-3.5" />
            </button>

            {/* Comparison callout */}
            <div className="border border-green-900/50 bg-green-950/10 rounded-sm p-3">
              <p className="font-mono text-[10px] text-green-500 uppercase tracking-widest mb-1.5">vs Traditional Platforms</p>
              <div className="space-y-1">
                {[
                  { platform: "Upwork",   pct: 20 },
                  { platform: "Toptal",   pct: 15 },
                  { platform: "Fiverr",   pct: 20 },
                ].map(({ platform, pct }) => {
                  const savedCents = Math.round(engagementCents * (pct / 100)) - calc.platformRevenue;
                  return (
                    <div key={platform} className="flex items-center justify-between">
                      <span className="font-mono text-[10px] text-zinc-500">{platform} ({pct}%)</span>
                      <span className="font-mono text-[10px] text-green-400">
                        Save {fmtUSD(Math.max(0, savedCents))}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </main>

      <AppMobileNav />
    </div>
  );
}
