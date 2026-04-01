"use client";

import { useState } from "react";
import Link from "next/link";
import { ShieldCheck, ArrowRight } from "lucide-react";

const CIRCUMFERENCE = 2 * Math.PI * 52; // r=52 → 326.726...

function getTierLabel(total: number) {
  if (total >= 70) return "Biometric Verified";
  if (total >= 40) return "Social Verified";
  return "Unverified";
}

function getTierColor(total: number) {
  if (total >= 70) return "text-emerald-400";
  if (total >= 40) return "text-blue-400";
  return "text-zinc-400";
}

function getTierBg(total: number) {
  if (total >= 70) return "bg-emerald-400/10 border-emerald-400/30 text-emerald-400";
  if (total >= 40) return "bg-blue-400/10 border-blue-400/30 text-blue-400";
  return "bg-zinc-800 border-zinc-700 text-zinc-400";
}

function getStrokeColor(biometric: number) {
  return biometric === 40 ? "#10b981" : "#fbbf24"; // emerald-500 or amber-400
}

export default function TrustScoreClient() {
  const [github,    setGithub]    = useState(0);
  const [linkedin,  setLinkedin]  = useState(0);
  const [biometric, setBiometric] = useState<0 | 40>(0);

  const total      = github + linkedin + biometric;
  const dashArray  = `${(total / 100) * CIRCUMFERENCE} ${CIRCUMFERENCE}`;
  const dashOffset = -(CIRCUMFERENCE * 0.25); // start from top

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 font-mono">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">

        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-9 h-9 rounded-sm bg-amber-400/10 border border-amber-400/30 flex items-center justify-center">
            <ShieldCheck className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <h1 className="text-lg font-mono text-zinc-50">Trust Score Explainer</h1>
            <p className="text-xs text-zinc-400">
              GitHub 30% + LinkedIn 30% + ZK Biometric 40% = 100
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* ── Left: Gauge + Tier ─────────────────────────────────────────── */}
          <div className="space-y-4">

            {/* SVG Gauge */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-sm p-6 flex flex-col items-center">
              <svg viewBox="0 0 120 120" width="160" height="160" className="mb-4">
                {/* Background ring */}
                <circle
                  cx="60" cy="60" r="52"
                  fill="none"
                  stroke="#27272a"
                  strokeWidth="10"
                />
                {/* Foreground arc */}
                <circle
                  cx="60" cy="60" r="52"
                  fill="none"
                  stroke={getStrokeColor(biometric)}
                  strokeWidth="10"
                  strokeLinecap="butt"
                  strokeDasharray={dashArray}
                  strokeDashoffset={dashOffset}
                  style={{ transition: "stroke-dasharray 0.4s ease, stroke 0.3s ease" }}
                  transform="rotate(-90 60 60)"
                />
                {/* Center text */}
                <text
                  x="60" y="56"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="font-mono"
                  fill="#fafafa"
                  fontSize="18"
                  fontWeight="600"
                >
                  {total}
                </text>
                <text
                  x="60" y="72"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="#a1a1aa"
                  fontSize="10"
                >
                  / 100
                </text>
              </svg>

              {/* Tier badge */}
              <span className={`text-xs px-3 py-1 rounded-sm border font-mono ${getTierBg(total)}`}>
                {getTierLabel(total)}
              </span>
            </div>

            {/* Threshold bar */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-sm p-4">
              <p className="text-xs text-zinc-400 mb-3">Identity Tier Thresholds</p>
              <div className="relative h-3 bg-zinc-800 rounded-sm overflow-visible">
                {/* Tier fill */}
                <div
                  className="h-full rounded-sm transition-all duration-300"
                  style={{
                    width: `${total}%`,
                    background: total >= 70 ? "#10b981" : total >= 40 ? "#60a5fa" : "#fbbf24",
                  }}
                />
                {/* Marker at 40 */}
                <div className="absolute top-0 h-full w-px bg-zinc-600" style={{ left: "40%" }} />
                {/* Marker at 70 */}
                <div className="absolute top-0 h-full w-px bg-zinc-600" style={{ left: "70%" }} />
                {/* Current dot */}
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-amber-400 border-2 border-zinc-950 transition-all duration-300"
                  style={{ left: `calc(${total}% - 6px)` }}
                />
              </div>
              <div className="flex justify-between text-xs text-zinc-600 mt-2">
                <span>0 — Unverified</span>
                <span>40 — Social</span>
                <span>70 — Biometric</span>
                <span>100</span>
              </div>
            </div>
          </div>

          {/* ── Right: Signal cards ────────────────────────────────────────── */}
          <div className="space-y-4">

            {/* GitHub */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-sm p-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm text-zinc-50">GitHub</p>
                <span className="text-xs text-amber-400">{github} / 30 pts</span>
              </div>
              <p className="text-xs text-zinc-500 mb-3">
                Earn: Connect GitHub OAuth. Account age + public repos scored automatically.
              </p>
              <input
                type="range"
                min={0}
                max={30}
                step={5}
                value={github}
                onChange={(e) => setGithub(Number(e.target.value))}
                className="w-full accent-amber-400 cursor-pointer"
              />
              <div className="flex justify-between text-xs text-zinc-600 mt-1">
                <span>0</span>
                <span>30</span>
              </div>
            </div>

            {/* LinkedIn */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-sm p-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm text-zinc-50">LinkedIn</p>
                <span className="text-xs text-amber-400">{linkedin} / 30 pts</span>
              </div>
              <p className="text-xs text-zinc-500 mb-3">
                Earn: Connect LinkedIn OAuth. Profile completeness scored automatically.
              </p>
              <input
                type="range"
                min={0}
                max={30}
                step={5}
                value={linkedin}
                onChange={(e) => setLinkedin(Number(e.target.value))}
                className="w-full accent-amber-400 cursor-pointer"
              />
              <div className="flex justify-between text-xs text-zinc-600 mt-1">
                <span>0</span>
                <span>30</span>
              </div>
            </div>

            {/* ZK Biometric */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-sm p-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm text-zinc-50">ZK Biometric</p>
                <span className={`text-xs ${biometric === 40 ? "text-emerald-400" : "text-zinc-400"}`}>
                  {biometric} / 40 pts
                </span>
              </div>
              <p className="text-xs text-zinc-500 mb-3">
                Earn: Complete biometric verification using Groth16 ZK proof over BN254. Raw
                biometric data is never stored — only a Blake3 commitment is persisted.
              </p>
              <button
                onClick={() => setBiometric(biometric === 0 ? 40 : 0)}
                className={`w-full h-9 rounded-sm border text-xs font-mono transition-colors ${
                  biometric === 40
                    ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/20"
                    : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
                }`}
              >
                {biometric === 40 ? "Verified (+40)" : "Not verified — click to simulate"}
              </button>
            </div>

            {/* CTA */}
            <Link
              href="/profile"
              className="flex items-center justify-center gap-2 h-10 w-full bg-amber-400 text-zinc-950 text-sm font-mono rounded-sm hover:bg-amber-300 transition-colors"
            >
              Verify your identity
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* FAQ section */}
        <div className="mt-10 border-t border-zinc-800 pt-8">
          <h2 className="text-sm text-zinc-50 mb-4">Frequently Asked Questions</h2>
          <div className="space-y-4">
            {[
              {
                q: "What is an AiStaff trust score?",
                a: "A 0–100 score combining GitHub activity (30%), LinkedIn profile (30%), and Zero-Knowledge biometric verification (40%). It determines identity tier and marketplace visibility.",
              },
              {
                q: "What is biometric verification on AiStaff?",
                a: "AiStaff uses Groth16 ZK proofs over the BN254 curve. Raw biometric data is never stored — only a Blake3 cryptographic commitment is persisted server-side.",
              },
              {
                q: "What are the identity tiers?",
                a: "Unverified (0–39): limited marketplace access. SocialVerified (40–69): can submit proposals and receive escrow. BiometricVerified (70–100): full platform access including payout release.",
              },
            ].map(({ q, a }) => (
              <div key={q} className="bg-zinc-900 border border-zinc-800 rounded-sm p-4">
                <p className={`text-sm mb-2 ${getTierColor(0)}`}>{q}</p>
                <p className="text-xs text-zinc-400 leading-relaxed">{a}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
