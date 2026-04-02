"use client";

import type { PublicProfile } from "@/lib/api";

interface TalentProfileCompletenessWidgetProps {
  publicProfile: PublicProfile | null;
  sessionName:   string | null | undefined;
  liveSkills:    { id: string }[] | null;
}

interface FieldCheck {
  label:  string;
  done:   boolean;
  weight: number;
}

export default function TalentProfileCompletenessWidget({
  publicProfile,
  sessionName,
  liveSkills,
}: TalentProfileCompletenessWidgetProps) {
  if (!publicProfile) return null;

  const fields: FieldCheck[] = [
    {
      label:  "Add your display name",
      done:   !!(publicProfile.display_name || sessionName),
      weight: 15,
    },
    {
      label:  "Write a short bio",
      done:   !!publicProfile.bio,
      weight: 20,
    },
    {
      label:  "Set your hourly rate",
      done:   (publicProfile.hourly_rate_cents ?? 0) > 0,
      weight: 20,
    },
    {
      label:  "Set your availability",
      done:   !!publicProfile.availability,
      weight: 15,
    },
    {
      label:  "Add at least one skill",
      done:   (liveSkills?.length ?? 0) > 0,
      weight: 20,
    },
    {
      label:  "Connect your GitHub account",
      done:   !!publicProfile.github_connected,
      weight: 10,
    },
  ];

  const score   = fields.filter(f => f.done).reduce((s, f) => s + f.weight, 0);
  const missing = fields.filter(f => !f.done);

  if (score === 100) return null;

  return (
    <div className="border border-zinc-800 rounded-sm p-3 space-y-2">
      {/* Header + score */}
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] text-zinc-300 uppercase tracking-widest">
          Profile Completeness
        </span>
        <span className="font-mono text-[10px] text-amber-400">{score}%</span>
      </div>

      {/* Progress bar */}
      <div className="h-1 w-full bg-zinc-800 rounded-sm overflow-hidden">
        <div
          className="h-full bg-amber-400 rounded-sm transition-all"
          style={{ width: `${score}%` }}
        />
      </div>

      {/* Missing fields */}
      {missing.length > 0 && (
        <ul className="space-y-0.5">
          {missing.map(f => (
            <li key={f.label} className="font-mono text-[9px] text-zinc-500">
              · {f.label}
            </li>
          ))}
        </ul>
      )}

      {/* CTA */}
      <a
        href="/profile"
        className="inline-block font-mono text-[10px] text-amber-400 hover:text-amber-300 border border-amber-900 px-2 py-1 rounded-sm transition-colors"
      >
        Complete Profile →
      </a>
    </div>
  );
}
