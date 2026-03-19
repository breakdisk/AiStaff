import type { RoiReport } from "@/lib/api";

export function roiToReputation(roi: RoiReport) {
  const driftRate    = roi.total_deployments > 0
    ? roi.drift_incidents / roi.total_deployments : 0;
  const volumeScore  = Math.min(roi.total_deployments / 20, 1.0);
  const reputationScore =
    0.4 * roi.avg_checklist_pass_pct +
    0.3 * (1 - driftRate) * 100 +
    0.2 * roi.reputation_score +
    0.1 * volumeScore * 100;

  return {
    talentId:         roi.talent_id,
    reputationScore:  Math.round(reputationScore * 10) / 10,
    totalDeployments: roi.total_deployments,
    totalEarnedCents: roi.total_earned_cents,
    driftIncidents:   roi.drift_incidents,
    vcIssued:         false,
  };
}
