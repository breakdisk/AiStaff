"use client";

interface TalentStatsStripProps {
  githubFollowers?: number;
  githubRepos?:     number;
  totalDeployments: number;
  reputationScore:  number;
}

function repColor(score: number): string {
  if (score >= 70) return "text-emerald-400";
  if (score >= 50) return "text-amber-400";
  return "text-zinc-400";
}

function ghColor(val: number | undefined): string {
  return val ? "text-amber-400" : "text-zinc-500";
}

export default function TalentStatsStrip({
  githubFollowers,
  githubRepos,
  totalDeployments,
  reputationScore,
}: TalentStatsStripProps) {
  const followersDisplay = githubFollowers
    ? githubFollowers.toLocaleString()
    : "—";
  const reposDisplay = githubRepos
    ? githubRepos.toLocaleString()
    : "—";

  const cols = [
    {
      value: followersDisplay,
      label: "Followers",
      cls:   ghColor(githubFollowers),
    },
    {
      value: reposDisplay,
      label: "Repos",
      cls:   ghColor(githubRepos),
    },
    {
      value: totalDeployments.toLocaleString(),
      label: "Completed Jobs",
      cls:   "text-zinc-100",
    },
    {
      value: reputationScore.toFixed(1),
      label: "Reputation",
      cls:   repColor(reputationScore),
    },
  ];

  return (
    <div className="border border-zinc-800 rounded-sm overflow-hidden">
      <div className="grid grid-cols-4 divide-x divide-zinc-800">
        {cols.map(({ value, label, cls }) => (
          <div key={label} className="flex flex-col items-center py-3 px-2">
            <span className={`font-mono text-sm font-bold ${cls}`}>{value}</span>
            <span className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest mt-1">
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
