"use client";

import { useState } from "react";
import { Heart } from "lucide-react";

interface Props {
  userId:    string;
  onSubmit:  (data: { mood_score: number; energy_score: number; stress_score: number; notes?: string }) => Promise<void>;
  loading?:  boolean;
}

function ScoreSlider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-[10px] text-zinc-400">
        <span>{label}</span>
        <span className="font-semibold text-zinc-200">{value} / 10</span>
      </div>
      <input
        type="range"
        min={1}
        max={10}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer
                   bg-zinc-700 [&::-webkit-slider-thumb]:appearance-none
                   [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                   [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-amber-400"
      />
    </div>
  );
}

export default function WellbeingCheckin({ userId, onSubmit, loading }: Props) {
  const [mood,   setMood]   = useState(7);
  const [energy, setEnergy] = useState(7);
  const [stress, setStress] = useState(3);
  const [notes,  setNotes]  = useState("");
  const [done,   setDone]   = useState(false);

  const handleSubmit = async () => {
    await onSubmit({ mood_score: mood, energy_score: energy, stress_score: stress, notes: notes || undefined });
    setDone(true);
  };

  if (done) {
    return (
      <div className="rounded-sm border border-zinc-800 bg-zinc-900 p-4 flex items-center gap-2">
        <Heart size={14} className="text-emerald-400 fill-emerald-400" />
        <span className="text-xs text-emerald-400 font-medium">Check-in recorded. Keep going!</span>
      </div>
    );
  }

  return (
    <div className="rounded-sm border border-zinc-800 bg-zinc-900 p-4 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Heart size={14} className="text-amber-400" />
        <span className="text-xs font-semibold text-zinc-200">Daily Well-Being Check-in</span>
      </div>

      <div className="flex flex-col gap-3">
        <ScoreSlider label="Mood"   value={mood}   onChange={setMood} />
        <ScoreSlider label="Energy" value={energy} onChange={setEnergy} />
        <ScoreSlider label="Stress" value={stress} onChange={setStress} />
      </div>

      <textarea
        placeholder="Optional notes…"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
        className="w-full rounded-sm border border-zinc-700 bg-zinc-800 px-2 py-1.5
                   text-xs text-zinc-200 placeholder-zinc-500 resize-none focus:outline-none
                   focus:border-amber-400/50"
      />

      <button
        onClick={handleSubmit}
        disabled={loading}
        className="w-full py-2 text-xs font-semibold bg-amber-400 text-zinc-950
                   rounded-sm hover:bg-amber-300 disabled:opacity-50 transition-colors"
      >
        {loading ? "Submitting…" : "Submit Check-in"}
      </button>
    </div>
  );
}
