"use client";

import { useEffect, useState } from "react";
import {
  submitCheckin,
  fetchCheckins,
  fetchBurnoutSignal,
  fetchCarbonFootprint,
  logCarbonOffset,
  type Checkin,
  type BurnoutSignal,
  type CarbonFootprint,
} from "@/lib/api";
import WellbeingCheckin from "@/components/WellbeingCheckin";
import BurnoutMeter from "@/components/BurnoutMeter";
import CarbonBadge from "@/components/CarbonBadge";
import { Smile, Leaf, AlertTriangle } from "lucide-react";

const DEMO_USER = "demo-user-id";

// Mental health resources (static, curated)
const RESOURCES = [
  { title: "Open Path Collective",   url: "https://openpathcollective.org",   desc: "Affordable therapy for individuals" },
  { title: "Headspace for Work",     url: "https://headspace.com/work",       desc: "Mindfulness for remote teams" },
  { title: "Mind.org.uk",            url: "https://www.mind.org.uk",          desc: "Mental health information & support" },
  { title: "Crisis Text Line",       url: "https://www.crisistextline.org",   desc: "Text HOME to 741741 (US/UK/CA/IE)" },
];

export default function WellbeingPage() {
  const [burnout,   setBurnout]   = useState<BurnoutSignal | null>(null);
  const [checkins,  setCheckins]  = useState<Checkin[]>([]);
  const [footprint, setFootprint] = useState<CarbonFootprint | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showCarbon, setShowCarbon] = useState(false);
  const [offsetKg,   setOffsetKg]  = useState("");

  const reload = () =>
    Promise.all([
      fetchBurnoutSignal(DEMO_USER).catch(() => null),
      fetchCheckins(DEMO_USER).catch(() => ({ checkins: [] })),
      fetchCarbonFootprint(DEMO_USER).catch(() => null),
    ]).then(([b, c, f]) => {
      setBurnout(b);
      setCheckins(c.checkins);
      setFootprint(f);
    }).finally(() => setLoading(false));

  useEffect(() => { reload(); }, []);

  const handleCheckin = async (data: { mood_score: number; energy_score: number; stress_score: number; notes?: string }) => {
    setSubmitting(true);
    try {
      await submitCheckin(DEMO_USER, data);
      await reload();
    } finally {
      setSubmitting(false);
    }
  };

  const handleOffset = async () => {
    const kg = parseFloat(offsetKg);
    if (isNaN(kg) || kg <= 0) return;
    await logCarbonOffset(DEMO_USER, { offset_kg: kg, activity_type: "compute" });
    setOffsetKg("");
    setShowCarbon(false);
    await reload();
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200">
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-lg font-bold text-zinc-100">Well-Being</h1>
          <p className="text-xs text-zinc-500 mt-0.5">Burnout tracking, mental health resources, and carbon offsets</p>
        </div>

        {loading ? (
          <p className="text-xs text-zinc-500 text-center py-8">Loading…</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Left column */}
            <div className="flex flex-col gap-4">
              {/* Daily check-in */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Smile size={14} className="text-amber-400" />
                  <h2 className="text-xs font-semibold text-zinc-200">Daily Check-in</h2>
                </div>
                <WellbeingCheckin
                  userId={DEMO_USER}
                  onSubmit={handleCheckin}
                  loading={submitting}
                />
              </div>

              {/* Recent check-ins */}
              {checkins.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-zinc-400 mb-2">Recent Check-ins</h3>
                  <div className="flex flex-col gap-1.5">
                    {checkins.slice(0, 5).map((c) => (
                      <div key={c.id} className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-sm px-3 py-2 text-[11px]">
                        <span className="text-zinc-500">{new Date(c.checked_in_at).toLocaleDateString()}</span>
                        <div className="flex gap-3 text-zinc-400">
                          <span>Mood {c.mood_score}/10</span>
                          <span>Energy {c.energy_score}/10</span>
                          <span>Stress {c.stress_score}/10</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right column */}
            <div className="flex flex-col gap-4">
              {/* Burnout meter */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle size={14} className="text-amber-400" />
                  <h2 className="text-xs font-semibold text-zinc-200">Burnout Risk</h2>
                </div>
                {burnout ? (
                  <BurnoutMeter signal={burnout} />
                ) : (
                  <div className="rounded-sm border border-zinc-800 bg-zinc-900 p-4">
                    <p className="text-xs text-zinc-500">Complete your first check-in to calculate burnout risk.</p>
                  </div>
                )}
              </div>

              {/* Carbon footprint */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Leaf size={14} className="text-emerald-400" />
                    <h2 className="text-xs font-semibold text-zinc-200">Carbon Offset</h2>
                  </div>
                  <button
                    onClick={() => setShowCarbon(!showCarbon)}
                    className="text-[11px] text-amber-400 hover:text-amber-300"
                  >
                    + Log offset
                  </button>
                </div>
                <CarbonBadge footprint={footprint} />
                {showCarbon && (
                  <div className="mt-2 flex gap-2">
                    <input
                      type="number"
                      min="0.001"
                      step="0.1"
                      placeholder="kg CO₂e offset"
                      value={offsetKg}
                      onChange={(e) => setOffsetKg(e.target.value)}
                      className="flex-1 text-xs bg-zinc-800 border border-zinc-700 rounded-sm px-2 py-1.5 text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-amber-400/50"
                    />
                    <button
                      onClick={handleOffset}
                      className="text-xs bg-emerald-500 text-white px-3 py-1 rounded-sm hover:bg-emerald-400"
                    >
                      Log
                    </button>
                  </div>
                )}
              </div>

              {/* Mental health resources */}
              <div>
                <h3 className="text-xs font-semibold text-zinc-400 mb-2">Mental Health Resources</h3>
                <div className="flex flex-col gap-1.5">
                  {RESOURCES.map((r) => (
                    <a
                      key={r.url}
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block border border-zinc-800 bg-zinc-900 rounded-sm px-3 py-2 hover:border-zinc-600 transition-colors"
                    >
                      <p className="text-xs font-medium text-amber-400">{r.title}</p>
                      <p className="text-[10px] text-zinc-500 mt-0.5">{r.desc}</p>
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
