interface SubScoreBarProps {
  label:  string;
  score:  number;          // 0–100
  color?: "green" | "amber" | "red" | "sky";
  showValue?: boolean;
}

const COLOR_MAP = {
  green: "bg-green-600",
  amber: "bg-amber-500",
  red:   "bg-red-600",
  sky:   "bg-sky-600",
};

export function SubScoreBar({ label, score, color = "amber", showValue = true }: SubScoreBarProps) {
  const fill = COLOR_MAP[color];
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[10px] text-zinc-500 w-32 flex-shrink-0 truncate">{label}</span>
      <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${fill}`}
          style={{ width: `${Math.max(0, Math.min(100, score))}%` }}
        />
      </div>
      {showValue && (
        <span className="font-mono text-[10px] tabular-nums text-zinc-400 w-8 text-right flex-shrink-0">
          {score}
        </span>
      )}
    </div>
  );
}
