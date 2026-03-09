import { Shield, ShieldCheck, ShieldAlert } from "lucide-react";

interface TrustScoreBadgeProps {
  score:             number;  // 0–100
  biometricVerified: boolean;
}

export function TrustScoreBadge({ score, biometricVerified }: TrustScoreBadgeProps) {
  const tier =
    score >= 70 ? "high" :
    score >= 40 ? "medium" :
    "low";

  const colors = {
    high:   "border-green-800 text-green-400",
    medium: "border-amber-800 text-amber-400",
    low:    "border-red-900  text-red-400",
  }[tier];

  const Icon = biometricVerified
    ? ShieldCheck
    : score >= 40
    ? Shield
    : ShieldAlert;

  return (
    <span className={`trust-badge ${colors}`}>
      <Icon className="w-3 h-3" />
      <span className="tabular-nums">{score}</span>
      {biometricVerified && (
        <span className="text-zinc-500">·BIO</span>
      )}
    </span>
  );
}
