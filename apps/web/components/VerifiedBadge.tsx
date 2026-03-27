import { Star } from "lucide-react";

interface VerifiedBadgeProps {
  planTier?: string | null;
}

/**
 * Amber filled star shown next to org name when plan_tier is ENTERPRISE or PLATINUM.
 */
export function VerifiedBadge({ planTier }: VerifiedBadgeProps) {
  if (planTier !== "ENTERPRISE" && planTier !== "PLATINUM") return null;
  return (
    <span title="Verified Agency">
      <Star
        className="w-4 h-4 fill-amber-400 text-amber-400 shrink-0"
        aria-label="Verified Agency"
      />
    </span>
  );
}
