"use client";

import { useState } from "react";
import { Globe, Check, Star, Info, ChevronDown } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type LangCode   = "en" | "es" | "pt" | "fr" | "sw";
type RegionKey  = "africa" | "latam" | "sea" | "mena" | "eastern-eu";
type CurrCode   = "USD" | "EUR" | "GBP" | "NGN" | "BRL" | "KES";

// ── Constants ─────────────────────────────────────────────────────────────────

const LANGUAGES: { code: LangCode; flag: string; label: string; nativeName: string }[] = [
  { code: "en", flag: "🇬🇧", label: "English",    nativeName: "English"    },
  { code: "es", flag: "🇪🇸", label: "Spanish",    nativeName: "Español"    },
  { code: "pt", flag: "🇧🇷", label: "Portuguese", nativeName: "Português"  },
  { code: "fr", flag: "🇫🇷", label: "French",     nativeName: "Français"   },
  { code: "sw", flag: "🇰🇪", label: "Swahili",    nativeName: "Kiswahili"  },
];

const REGIONS: {
  key:         RegionKey;
  label:       string;
  flags:       string;
  rails:       string[];
  taxNote:     string;
  trustSignal: string;
}[] = [
  {
    key:    "africa",
    label:  "Africa",
    flags:  "🇳🇬🇰🇪🇬🇭🇿🇦🇪🇹",
    rails:  ["M-Pesa", "Flutterwave", "Paystack"],
    taxNote:"VAT varies by country; Nigeria 7.5% · Kenya 16% · Ghana 15%",
    trustSignal: "National ID + NIN verification supported",
  },
  {
    key:   "latam",
    label: "LATAM",
    flags: "🇧🇷🇲🇽🇨🇴🇦🇷🇨🇱",
    rails: ["PIX (Brazil)", "SPEI (Mexico)", "PayU"],
    taxNote: "Brazil: 15% IRRF · Mexico: 10% ISR · Colombia: 19% IVA",
    trustSignal: "CPF (Brazil) + CURP (Mexico) identity verification",
  },
  {
    key:   "sea",
    label: "Southeast Asia",
    flags: "🇵🇭🇮🇩🇻🇳🇹🇭🇸🇬",
    rails: ["GCash", "GoPay", "PromptPay", "PayNow"],
    taxNote: "Philippines: 8% IT · Indonesia: 5% PPh · Singapore: 9% GST",
    trustSignal: "PhilSys ID + KTP (Indonesia) verification",
  },
  {
    key:   "mena",
    label: "MENA",
    flags: "🇦🇪🇸🇦🇪🇬🇲🇦🇯🇴",
    rails: ["UAE FAST", "Saudi SARIE", "InstaPay (Egypt)"],
    taxNote: "UAE: 9% corporate tax · Saudi: 15% VAT · Egypt: 14% VAT",
    trustSignal: "Emirates ID + Iqama residency verification",
  },
  {
    key:   "eastern-eu",
    label: "Eastern Europe",
    flags: "🇵🇱🇷🇴🇺🇦🇨🇿🇭🇺",
    rails: ["BLIK (Poland)", "FPS (Romania)", "Faster Payments"],
    taxNote: "Poland: 23% VAT · Romania: 19% VAT · Ukraine: 20% VAT",
    trustSignal: "PESEL (Poland) + CNP (Romania) identity verification",
  },
];

const INCENTIVE_PROGRAMS: { region: string; fee: string; standardFee: string; start: string; expiry: string }[] = [
  { region: "Africa (all countries)",  fee: "5%",  standardFee: "15%", start: "2026-01-01", expiry: "2026-12-31" },
  { region: "LATAM (excl. Brazil)",   fee: "7%",  standardFee: "15%", start: "2026-02-01", expiry: "2026-12-31" },
  { region: "Southeast Asia",         fee: "6%",  standardFee: "15%", start: "2026-03-01", expiry: "2026-09-30" },
];

const ELIGIBLE_COUNTRIES = new Set([
  "nigeria","kenya","ghana","south africa","ethiopia","uganda","tanzania",
  "colombia","peru","chile","argentina","ecuador","bolivia","paraguay",
  "philippines","indonesia","vietnam","thailand","cambodia","myanmar",
]);

const CURRENCIES: { code: CurrCode; label: string; symbol: string; rate: number }[] = [
  { code: "USD", label: "US Dollar",     symbol: "$",   rate: 1       },
  { code: "EUR", label: "Euro",          symbol: "€",   rate: 0.92    },
  { code: "GBP", label: "British Pound", symbol: "£",   rate: 0.79    },
  { code: "NGN", label: "Nigerian Naira",symbol: "₦",   rate: 1608    },
  { code: "BRL", label: "Brazilian Real",symbol: "R$",  rate: 5.05    },
  { code: "KES", label: "Kenyan Shilling",symbol: "Ksh",rate: 130     },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ label, sub }: { label: string; sub?: string }) {
  return (
    <div className="border-b border-zinc-800 pb-1.5 mb-3">
      <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">{label}</p>
      {sub && <p className="font-mono text-[10px] text-zinc-600 mt-0.5">{sub}</p>}
    </div>
  );
}

function LanguageCard({
  lang, active, onClick,
}: {
  lang: (typeof LANGUAGES)[number];
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1.5 p-3 rounded-sm border transition-all ${
        active
          ? "border-amber-700 bg-amber-950/30"
          : "border-zinc-800 bg-zinc-900 hover:border-zinc-600"
      }`}
    >
      <span className="text-2xl">{lang.flag}</span>
      <span className={`font-mono text-[10px] font-medium ${active ? "text-amber-400" : "text-zinc-300"}`}>
        {lang.label}
      </span>
      <span className="font-mono text-[9px] text-zinc-600">{lang.nativeName}</span>
      {active && (
        <span className="font-mono text-[8px] px-1 rounded-sm border border-amber-800 text-amber-400">ACTIVE</span>
      )}
    </button>
  );
}

function RegionCard({
  region, active, onClick,
}: {
  region: (typeof REGIONS)[number];
  active: boolean;
  onClick: () => void;
}) {
  return (
    <div className={`border rounded-sm p-3 space-y-2.5 transition-colors ${
      active ? "border-amber-700 bg-amber-950/20" : "border-zinc-800 bg-zinc-900"
    }`}>
      <div className="flex items-start justify-between">
        <div>
          <p className={`font-mono text-xs font-medium ${active ? "text-amber-400" : "text-zinc-200"}`}>
            {region.label}
          </p>
          <p className="text-lg mt-0.5">{region.flags}</p>
        </div>
        {active && (
          <span className="font-mono text-[9px] px-1.5 py-0.5 rounded-sm border border-amber-800 text-amber-400 flex-shrink-0">
            HOME
          </span>
        )}
      </div>

      <div className="space-y-1">
        <p className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest">Payment Rails</p>
        <div className="flex flex-wrap gap-1">
          {region.rails.map((r) => (
            <span key={r} className="font-mono text-[9px] px-1.5 py-0.5 rounded-sm border border-zinc-700 text-zinc-400">{r}</span>
          ))}
        </div>
      </div>

      <p className="font-mono text-[9px] text-zinc-600">{region.taxNote}</p>
      <p className="font-mono text-[9px] text-zinc-500">✓ {region.trustSignal}</p>

      <button
        onClick={onClick}
        className={`w-full h-7 rounded-sm font-mono text-[10px] uppercase tracking-widest border transition-all ${
          active
            ? "border-amber-800 text-amber-400 bg-amber-950/30"
            : "border-zinc-700 text-zinc-500 hover:border-amber-900 hover:text-amber-500"
        }`}
      >
        {active ? "✓ Home Region" : "Set as Home Region"}
      </button>
    </div>
  );
}

function IncentiveFeeBar() {
  return (
    <div className="border border-zinc-800 rounded-sm p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">Standard Platform Fee</p>
          <p className="font-mono text-2xl font-medium text-zinc-400 tabular-nums">15%</p>
        </div>
        <div className="flex items-center gap-2 px-3">
          <div className="h-8 w-px bg-zinc-700" />
          <span className="font-mono text-lg text-zinc-600">→</span>
          <div className="h-8 w-px bg-zinc-700" />
        </div>
        <div className="text-right">
          <p className="font-mono text-[10px] text-amber-500 uppercase tracking-widest">Region Boost Fee</p>
          <p className="font-mono text-2xl font-medium text-amber-400 tabular-nums">5%</p>
        </div>
      </div>
      {/* Bar comparison */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[9px] text-zinc-600 w-24">Standard</span>
          <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
            <div className="h-full bg-zinc-600 w-full" />
          </div>
          <span className="font-mono text-[9px] text-zinc-500 w-6 text-right">15%</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[9px] text-amber-500 w-24">Region Boost</span>
          <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
            <div className="h-full bg-amber-500 rounded-full" style={{ width: "33%" }} />
          </div>
          <span className="font-mono text-[9px] text-amber-400 w-6 text-right">5%</span>
        </div>
      </div>
      {/* Badge preview */}
      <div className="flex items-center gap-2 border border-amber-900 bg-amber-950/30 rounded-sm px-3 py-2">
        <Star className="w-3.5 h-3.5 text-amber-400" />
        <span className="font-mono text-xs text-amber-300 font-medium">Region Boost</span>
        <span className="font-mono text-[9px] text-amber-600 ml-auto">Shown on your talent listing</span>
      </div>
    </div>
  );
}

function EligibilityChecker() {
  const [country, setCountry] = useState("");
  const [result,  setResult]  = useState<"eligible" | "ineligible" | null>(null);

  function check() {
    if (!country.trim()) return;
    const lower = country.trim().toLowerCase();
    setResult(ELIGIBLE_COUNTRIES.has(lower) ? "eligible" : "ineligible");
  }

  return (
    <div className="space-y-2">
      <p className="font-mono text-[10px] text-zinc-600">Check your country&apos;s eligibility for Region Boost</p>
      <div className="flex gap-2">
        <input
          className="flex-1 bg-zinc-900 border border-zinc-700 rounded-sm px-2.5 py-1.5 font-mono text-xs text-zinc-200 focus:outline-none focus:border-amber-700 placeholder-zinc-700"
          placeholder="e.g. Nigeria, Colombia, Philippines"
          value={country}
          onChange={(e) => { setCountry(e.target.value); setResult(null); }}
          onKeyDown={(e) => e.key === "Enter" && check()}
        />
        <button
          onClick={check}
          className="h-8 px-3 rounded-sm border border-amber-800 bg-amber-950 text-amber-400 font-mono text-xs hover:bg-amber-900 transition-colors"
        >
          Check
        </button>
      </div>
      {result === "eligible" && (
        <div className="flex items-center gap-2 border border-green-800 bg-green-950/30 rounded-sm px-3 py-2">
          <Check className="w-3.5 h-3.5 text-green-400" />
          <span className="font-mono text-xs text-green-300">
            <span className="capitalize">{country}</span> is eligible for Region Boost (5% fee)
          </span>
        </div>
      )}
      {result === "ineligible" && (
        <div className="flex items-center gap-2 border border-zinc-700 bg-zinc-900 rounded-sm px-3 py-2">
          <Info className="w-3.5 h-3.5 text-zinc-500" />
          <span className="font-mono text-xs text-zinc-400">
            <span className="capitalize">{country}</span> uses standard platform fee (15%)
          </span>
        </div>
      )}
    </div>
  );
}

function CurrencyButton({
  curr, active, onClick,
}: {
  curr: (typeof CURRENCIES)[number];
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-start px-3 py-2.5 rounded-sm border transition-colors ${
        active
          ? "border-amber-700 bg-amber-950/30"
          : "border-zinc-800 bg-zinc-900 hover:border-zinc-600"
      }`}
    >
      <div className="flex items-center justify-between w-full">
        <span className={`font-mono text-sm font-medium ${active ? "text-amber-400" : "text-zinc-300"}`}>
          {curr.symbol} {curr.code}
        </span>
        {active && <Check className="w-3 h-3 text-amber-400" />}
      </div>
      <span className="font-mono text-[9px] text-zinc-600 mt-0.5">{curr.label}</span>
    </button>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

function Sidebar() {
  return (
    <aside className="hidden lg:flex lg:flex-col w-56 border-r border-zinc-800 bg-zinc-950 p-4 gap-6">
      <span className="font-mono text-xs text-zinc-500 uppercase tracking-widest">AiStaffApp</span>
      <nav className="flex flex-col gap-1">
        {[
          { label: "Dashboard",   href: "/dashboard"   },
          { label: "Marketplace", href: "/marketplace" },
          { label: "Leaderboard", href: "/leaderboard" },
          { label: "Matching",    href: "/matching"    },
          { label: "Profile",     href: "/profile"     },
        ].map(({ label, href }) => (
          <a key={label} href={href}
            className="px-3 py-2 rounded-sm font-mono text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 transition-colors"
          >{label}</a>
        ))}
      </nav>
      {[
        { label: "Payments",      items: [["Escrow","/escrow"],["Payouts","/payouts"],["Billing","/billing"],["Smart Contracts","/smart-contracts"],["Outcome Listings","/outcome-listings"],["Pricing Calculator","/pricing-calculator"]] },
        { label: "Workspace",     items: [["Work Diaries","/work-diaries"],["Async Collab","/async-collab"],["Collaboration","/collab"],["Success Layer","/success-layer"],["Quality Gate","/quality-gate"]] },
        { label: "Legal",         items: [["Legal Toolkit","/legal-toolkit"],["Tax Engine","/tax-engine"],["Reputation","/reputation-export"],["Transparency","/transparency"]] },
        { label: "Notifications", items: [["Alerts","/notifications"],["Reminders","/reminders"],["Settings","/notification-settings"]] },
        { label: "Enterprise",    items: [["Industry Suites","/vertical"],["Enterprise Hub","/enterprise"],["Talent Pools","/enterprise/talent-pools"],["SLA Dashboard","/enterprise/sla"],["Global & Access","/global"]] },
      ].map(({ label, items }) => (
        <div key={label} className="space-y-1">
          <p className="font-mono text-[10px] text-zinc-700 uppercase tracking-widest px-3">{label}</p>
          {items.map(([lbl, href]) => (
            <a key={lbl} href={href}
              className={`block px-3 py-1.5 rounded-sm font-mono text-xs transition-colors ${
                lbl === "Global & Access"
                  ? "text-zinc-100 bg-zinc-800"
                  : "text-zinc-600 hover:text-zinc-300 hover:bg-zinc-900"
              }`}
            >{lbl}</a>
          ))}
        </div>
      ))}
    </aside>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function GlobalPage() {
  const [lang,     setLang]     = useState<LangCode>("en");
  const [region,   setRegion]   = useState<RegionKey | null>(null);
  const [currency, setCurrency] = useState<CurrCode>("USD");
  const [langFlash,setLangFlash]= useState(false);

  function handleLang(code: LangCode) {
    setLang(code);
    setLangFlash(true);
    setTimeout(() => setLangFlash(false), 1500);
  }

  return (
    <div className="flex flex-col lg:flex-row min-h-screen">
      <Sidebar />

      <main className="flex-1 p-4 pb-20 lg:pb-4 space-y-6 max-w-3xl mx-auto w-full">
        {/* Header */}
        <div className="flex items-center gap-2.5">
          <Globe className="w-4 h-4 text-amber-400" />
          <h1 className="font-mono text-sm font-medium text-zinc-300 uppercase tracking-widest">
            Global & Inclusion
          </h1>
        </div>

        {/* ── Section A: Language ── */}
        <section>
          <SectionHeader
            label="Language & Locale"
            sub="Contract templates and UI labels will use the selected language"
          />
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {LANGUAGES.map((l) => (
              <LanguageCard key={l.code} lang={l} active={lang === l.code} onClick={() => handleLang(l.code)} />
            ))}
          </div>
          {langFlash && (
            <div className="mt-2 flex items-center gap-2 border border-green-800 bg-green-950/30 rounded-sm px-3 py-2">
              <Check className="w-3.5 h-3.5 text-green-400" />
              <span className="font-mono text-xs text-green-300">
                Language set to {LANGUAGES.find((l) => l.code === lang)?.label}. Templates will update on next generation.
              </span>
            </div>
          )}
        </section>

        {/* ── Section B: Regional Onboarding ── */}
        <section>
          <SectionHeader
            label="Regional Onboarding"
            sub="Set your home region for local payment rails, tax guidance, and trust signals"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {REGIONS.map((r) => (
              <RegionCard
                key={r.key}
                region={r}
                active={region === r.key}
                onClick={() => setRegion(region === r.key ? null : r.key)}
              />
            ))}
          </div>
        </section>

        {/* ── Section C: Incentive Programs ── */}
        <section>
          <SectionHeader
            label="Underrepresented Region Incentives"
            sub="Priority regions receive reduced platform fees to boost global talent supply"
          />
          <div className="space-y-3">
            <IncentiveFeeBar />
            <EligibilityChecker />

            {/* Active incentive table */}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[400px]">
                <thead>
                  <tr className="border-b border-zinc-800">
                    {["Region", "Fee", "Standard", "Start", "Expiry"].map((h) => (
                      <th key={h} className="text-left pb-2 font-mono text-[9px] text-zinc-600 uppercase tracking-widest pr-3">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {INCENTIVE_PROGRAMS.map((p) => (
                    <tr key={p.region} className="border-b border-zinc-900 hover:bg-zinc-900/30 transition-colors">
                      <td className="py-2.5 pr-3 font-mono text-xs text-zinc-300">{p.region}</td>
                      <td className="py-2.5 pr-3 font-mono text-xs text-amber-400 font-medium">{p.fee}</td>
                      <td className="py-2.5 pr-3 font-mono text-xs text-zinc-600 line-through">{p.standardFee}</td>
                      <td className="py-2.5 pr-3 font-mono text-[10px] text-zinc-500">{p.start}</td>
                      <td className="py-2.5 font-mono text-[10px] text-zinc-500">{p.expiry}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ── Section D: Currency Display ── */}
        <section>
          <SectionHeader
            label="Currency Display"
            sub="Frontend display only — all transactions are settled in USD"
          />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {CURRENCIES.map((c) => (
              <CurrencyButton key={c.code} curr={c} active={currency === c.code} onClick={() => setCurrency(c.code)} />
            ))}
          </div>
          {currency !== "USD" && (
            <div className="mt-2 flex items-center gap-2 border border-zinc-700 rounded-sm px-3 py-2">
              <Info className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
              <p className="font-mono text-[10px] text-zinc-500">
                Displaying in {CURRENCIES.find((c) => c.code === currency)?.label} at approx.
                rate 1 USD = {CURRENCIES.find((c) => c.code === currency)?.rate} {currency}.
                Rates are indicative only — all payouts settled in USD.
              </p>
            </div>
          )}
        </section>

      </main>
    </div>
  );
}
