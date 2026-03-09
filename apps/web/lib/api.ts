/**
 * Typed API client — all requests go through Next.js proxy rewrites
 * defined in next.config.ts, so no CORS issues and no hardcoded ports.
 */

// ── Types (mirror Rust structs) ───────────────────────────────────────────

export interface RoiReport {
  talent_id:              string;
  total_deployments:      number;
  total_earned_cents:     number;
  avg_checklist_pass_pct: number;
  drift_incidents:        number;
  reputation_score:       number;
}

export interface TalentMatch {
  talent_id:   string;
  match_score: number;
  trust_score: number;
  skill_tags:  string[];
}

export interface MatchResult {
  request_id: string;
  matches:    TalentMatch[];
}

export interface MatchRequest {
  request_id:      string;
  agent_id:        string;
  required_skills: string[];
  min_trust_score: number;
  jurisdiction?:   string;
}

export interface VcExportResponse {
  "@context":         string[];
  type:               string[];
  id:                 string;
  issuer:             string;
  issuanceDate:       string;
  credentialSubject:  Record<string, unknown>;
}

// ── Helpers ───────────────────────────────────────────────────────────────

async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    throw new Error(`API ${init?.method ?? "GET"} ${path} → ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ── Marketplace service (:3002) ───────────────────────────────────────────

export interface CreateDeploymentRequest {
  agent_id:            string;
  client_id:           string;
  freelancer_id:       string;
  agent_artifact_hash: string;
  escrow_amount_cents: number;
}

export interface DeploymentSummary {
  deployment_id: string;
  state:         string;
}

export interface Deployment {
  id:                   string;
  agent_id:             string;
  client_id:            string;
  freelancer_id:        string;
  agent_artifact_hash:  string;
  escrow_amount_cents:  number;
  state:                string;
  failure_reason:       string | null;
  created_at:           string;
  updated_at:           string;
}

export function createDeployment(req: CreateDeploymentRequest): Promise<DeploymentSummary> {
  return apiFetch("/api/marketplace/deployments", {
    method: "POST",
    body:   JSON.stringify(req),
  });
}

export function fetchDeployment(deploymentId: string): Promise<Deployment> {
  return apiFetch(`/api/marketplace/deployments/${deploymentId}`);
}

export type ListingCategory = "AiTalent" | "AiStaff" | "AiRobot";
export type SellerType     = "Agency"   | "Freelancer";

export interface AgentListing {
  id:           string;
  developer_id: string;
  name:         string;
  description:  string;
  wasm_hash:    string;
  price_cents:  number;
  active:       boolean;
  category:     ListingCategory;
  seller_type:  SellerType;
  created_at:   string;
  updated_at:   string;
}

export interface CreateListingRequest {
  developer_id: string;
  name:         string;
  description:  string;
  wasm_hash:    string;
  price_cents:  number;
  category:     ListingCategory;
  seller_type:  SellerType;
}

export function fetchListings(): Promise<{ listings: AgentListing[] }> {
  return apiFetch("/api/marketplace/listings");
}

export function fetchListing(listingId: string): Promise<AgentListing> {
  return apiFetch(`/api/marketplace/listings/${listingId}`);
}

export function createListing(req: CreateListingRequest): Promise<{ listing_id: string }> {
  return apiFetch("/api/marketplace/listings", {
    method: "POST",
    body:   JSON.stringify(req),
  });
}

// ── Analytics service (:3008) ─────────────────────────────────────────────

export function fetchRoiReport(talentId: string): Promise<RoiReport> {
  return apiFetch(`/api/analytics/talent/${talentId}/roi`);
}

export function fetchLeaderboard(limit = 50): Promise<RoiReport[]> {
  return apiFetch(`/api/analytics/leaderboard?limit=${limit}`);
}

// ── Matching service (:3005) ──────────────────────────────────────────────

export function fetchMatches(req: MatchRequest): Promise<MatchResult> {
  return apiFetch("/api/matching/match", {
    method: "POST",
    body:   JSON.stringify(req),
  });
}

// ── Reputation service (:3009) ────────────────────────────────────────────

export function getVc(talentId: string): Promise<string> {
  return apiFetch(`/api/reputation/${talentId}/vc`);
}

export function exportVc(talentId: string): Promise<VcExportResponse> {
  return apiFetch(`/api/reputation/${talentId}/export`, { method: "POST" });
}

// ── Compliance service (:3006) ────────────────────────────────────────────

export interface Contract {
  id:            string;
  contract_type: string;
  status:        string;
  document_hash: string;
  created_at:    string;
  signed_at:     string | null;
}

export function fetchContract(contractId: string): Promise<Contract> {
  return apiFetch(`/api/compliance/contracts/${contractId}`);
}

export interface WarrantyClaim {
  id:            string;
  deployment_id: string;
  claimant_id:   string;
  drift_proof:   string;
  claimed_at:    string;
  resolved_at:   string | null;
  resolution:    "REMEDIATED" | "REFUNDED" | "REJECTED" | null;
}

export function fetchWarrantyClaims(deploymentId?: string): Promise<WarrantyClaim[]> {
  const qs = deploymentId ? `?deployment_id=${deploymentId}` : "";
  return apiFetch(`/api/compliance/warranty-claims${qs}`);
}

export function resolveWarrantyClaim(
  claimId:    string,
  resolution: "REMEDIATED" | "REFUNDED" | "REJECTED",
): Promise<{ ok: boolean }> {
  return apiFetch(`/api/compliance/warranty-claims/${claimId}/resolve`, {
    method: "POST",
    body:   JSON.stringify({ resolution }),
  });
}

// ── Telemetry service (:3007) ─────────────────────────────────────────────

export interface Heartbeat {
  cpu_pct:       number;
  mem_bytes:     number;
  artifact_hash: string;
  recorded_at:   string;
}

export interface DriftEvent {
  id:            string;
  expected_hash: string;
  actual_hash:   string;
  detected_at:   string;
}

export function fetchHeartbeats(deploymentId: string): Promise<Heartbeat[]> {
  return apiFetch(`/api/telemetry/deployments/${deploymentId}/heartbeats`);
}

export function fetchDriftEvents(deploymentId: string): Promise<DriftEvent[]> {
  return apiFetch(`/api/telemetry/deployments/${deploymentId}/drift`);
}

// ── Checklist service (:3003) ─────────────────────────────────────────────

export interface ChecklistStep {
  step_id:    string;
  step_label: string;
  passed:     boolean;
  notes?:     string;
}

export function fetchChecklistSteps(deploymentId: string): Promise<ChecklistStep[]> {
  return apiFetch(`/api/checklist/checklist/${deploymentId}/steps`);
}

// ── Payout service (:3010) ────────────────────────────────────────────────

export function vetoDeployment(
  deploymentId: string,
  talentId:     string,
  reason:       string,
): Promise<{ ok: boolean }> {
  return apiFetch(`/api/payout/payouts/${deploymentId}/veto`, {
    method: "POST",
    body:   JSON.stringify({ talent_id: talentId, reason }),
  });
}

export function approveDeployment(
  deploymentId: string,
  talentId:     string,
): Promise<{ ok: boolean }> {
  return apiFetch(`/api/payout/payouts/${deploymentId}/approve`, {
    method: "POST",
    body:   JSON.stringify({ talent_id: talentId }),
  });
}

// ── Health checks ──────────────────────────────────────────────────────────

const SERVICE_PORTS: Record<string, string> = {
  identity:    "/api/identity/health",
  marketplace: "/api/marketplace/health",
  checklist:   "/api/checklist/health",
  license:     "/api/license/health",
  matching:    "/api/matching/health",
  compliance:  "/api/compliance/health",
  telemetry:   "/api/telemetry/health",
  analytics:   "/api/analytics/health",
  reputation:  "/api/reputation/health",
};

export async function checkServiceHealth(): Promise<Record<string, boolean>> {
  const results = await Promise.allSettled(
    Object.entries(SERVICE_PORTS).map(async ([name, path]) => {
      const res = await fetch(path);
      return [name, res.ok] as const;
    }),
  );
  return Object.fromEntries(
    results.map((r, i) => [
      Object.keys(SERVICE_PORTS)[i],
      r.status === "fulfilled" && r.value[1],
    ]),
  );
}
