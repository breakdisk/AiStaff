"use client";

interface SkillGap {
  id:             string;
  skill_tag:      string;
  current_level:  number;
  required_level: number;
  gap_score:      number;
}

interface Props {
  gaps: SkillGap[];
}

export default function SkillGapChart({ gaps }: Props) {
  if (gaps.length === 0) {
    return (
      <div className="rounded-sm border border-zinc-800 bg-zinc-900 p-4">
        <p className="text-xs text-zinc-500 text-center py-2">No skill gaps detected</p>
      </div>
    );
  }

  const sorted = [...gaps].sort((a, b) => b.gap_score - a.gap_score).slice(0, 8);

  return (
    <div className="rounded-sm border border-zinc-800 bg-zinc-900 p-4 flex flex-col gap-3">
      <h3 className="text-xs font-semibold text-zinc-200">Skill Gaps</h3>
      <div className="flex flex-col gap-2">
        {sorted.map((gap) => {
          const currentPct  = gap.current_level;
          const requiredPct = gap.required_level;
          const gapColor = gap.gap_score > 50
            ? "bg-red-500"
            : gap.gap_score > 25
            ? "bg-amber-400"
            : "bg-emerald-400";

          return (
            <div key={gap.id} className="flex flex-col gap-0.5">
              <div className="flex justify-between text-[10px] text-zinc-400">
                <span className="truncate max-w-[140px]">{gap.skill_tag}</span>
                <span className="text-zinc-500">
                  {gap.current_level} / {gap.required_level}
                </span>
              </div>
              {/* Track */}
              <div className="relative h-2 w-full bg-zinc-800 rounded-full overflow-hidden">
                {/* Current level */}
                <div
                  className="absolute top-0 left-0 h-full bg-zinc-600 rounded-full"
                  style={{ width: `${currentPct}%` }}
                />
                {/* Gap overlay */}
                <div
                  className={`absolute top-0 h-full rounded-full opacity-70 ${gapColor}`}
                  style={{
                    left:  `${currentPct}%`,
                    width: `${Math.max(requiredPct - currentPct, 0)}%`,
                  }}
                />
                {/* Required level marker */}
                <div
                  className="absolute top-0 w-0.5 h-full bg-white/40"
                  style={{ left: `${requiredPct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
