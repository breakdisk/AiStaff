"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Building2, ChevronRight, Loader2 } from "lucide-react";
import { createOrg } from "@/lib/enterpriseApi";

const PLAN_TIERS = [
  {
    id: "GROWTH",
    label: "Growth",
    features: ["Up to 5 seats", "Standard veto window (30s)", "Email support", "Basic analytics"],
  },
  {
    id: "ENTERPRISE",
    label: "Enterprise",
    features: ["Up to 25 seats", "Configurable veto window", "Dedicated CSM", "Full analytics + ROI"],
    highlight: true,
  },
  {
    id: "PLATINUM",
    label: "Platinum",
    features: ["Unlimited seats", "Custom escrow splits", "★ Platinum SLA (< 1 hr)", "MCP API access"],
  },
];

export default function EnterpriseSetup() {
  const { data: session } = useSession();
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [tier, setTier] = useState("ENTERPRISE");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const profileId = (session?.user as { profileId?: string })?.profileId;

  async function handleCreate() {
    if (!profileId || !name.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await createOrg(profileId, name.trim(), tier);
      router.push("/enterprise");
    } catch {
      setError("Failed to create organisation. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="w-full max-w-2xl space-y-6">
        <div className="flex items-center gap-3">
          <Building2 className="text-amber-400" size={20} />
          <h1 className="text-base font-semibold text-zinc-50">Set up your organisation</h1>
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-sm p-4 space-y-3">
              <label className="block text-xs text-zinc-400">Organisation name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Acme Financial Group"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-sm px-3 py-2 text-sm text-zinc-50 placeholder:text-zinc-600 focus:outline-none focus:border-amber-400"
              />
            </div>
            <button
              onClick={() => name.trim() && setStep(2)}
              disabled={!name.trim()}
              className="w-full flex items-center justify-center gap-2 bg-amber-400 text-zinc-950 text-sm font-medium px-4 py-2.5 rounded-sm hover:bg-amber-300 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Continue <ChevronRight size={14} />
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <p className="text-xs text-zinc-400">Select a plan tier — all pricing is custom.</p>
            <div className="grid gap-3">
              {PLAN_TIERS.map(pt => (
                <button
                  key={pt.id}
                  onClick={() => setTier(pt.id)}
                  className={`w-full text-left p-4 border rounded-sm space-y-2 transition-colors ${
                    tier === pt.id
                      ? "border-amber-400 bg-amber-950/20"
                      : "border-zinc-800 bg-zinc-900 hover:border-zinc-700"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-zinc-50">{pt.label}</span>
                    {pt.highlight && (
                      <span className="font-mono text-[10px] px-2 py-0.5 rounded-sm border border-amber-700 text-amber-400 bg-amber-950/30">
                        RECOMMENDED
                      </span>
                    )}
                  </div>
                  <ul className="space-y-1">
                    {pt.features.map(f => (
                      <li key={f} className="text-xs text-zinc-400 flex items-center gap-1.5">
                        <span className="text-emerald-500">✓</span> {f}
                      </li>
                    ))}
                  </ul>
                </button>
              ))}
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <div className="flex gap-3">
              <button
                onClick={() => setStep(1)}
                className="flex-1 border border-zinc-700 text-zinc-400 text-sm px-4 py-2.5 rounded-sm hover:border-zinc-500"
              >
                Back
              </button>
              <button
                onClick={handleCreate}
                disabled={loading}
                className="flex-1 flex items-center justify-center gap-2 bg-amber-400 text-zinc-950 text-sm font-medium px-4 py-2.5 rounded-sm hover:bg-amber-300 disabled:opacity-60"
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : null}
                Create organisation
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
