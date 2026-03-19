/**
 * Typed API client — all requests go through Next.js proxy rewrites
 * defined in next.config.ts, so no CORS issues and no hardcoded ports.
 */

// ── Types (mirror Rust structs) ───────────────────────────────────────────

export interface RoiReport {
  talent_id:              string;
  display_name:           string;
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
  agent_id:                  string;
  client_id:                 string;
  freelancer_id:             string;
  /** Agent builder — defaults to freelancer_id when omitted. */
  developer_id?:             string;
  agent_artifact_hash:       string;
  escrow_amount_cents:       number;
  /** UUID v7 idempotency key — generated server-side if omitted. */
  transaction_id?:           string;
  /** Stripe PaymentIntent ID set after payment confirmation. */
  stripe_payment_intent_id?: string;
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
  /** Human-readable kebab-case slug used in share URLs. */
  slug:         string;
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

export function fetchListingBySlug(slug: string): Promise<AgentListing> {
  return apiFetch(`/api/marketplace/listings/by-slug/${slug}`);
}

export function createListing(req: CreateListingRequest): Promise<{ listing_id: string }> {
  return apiFetch("/api/marketplace/listings", {
    method: "POST",
    body:   JSON.stringify(req),
  });
}

// ── Identity service — profile update (:3001) ────────────────────────────

export interface UpdateProfileRequest {
  bio?:               string;
  hourly_rate_cents?: number;
  availability?:      "available" | "busy" | "not-available";
  role?:              "talent" | "client" | "agent-owner";
}

export function updateProfile(profileId: string, data: UpdateProfileRequest): Promise<{ ok: boolean }> {
  return apiFetch(`/api/identity/profile/${profileId}`, {
    method: "PATCH",
    body:   JSON.stringify(data),
  });
}

// ── Marketplace service — skills + express interest (:3002) ───────────────

export interface SkillTag {
  id:     string;
  tag:    string;
  domain: string;
}

export interface TalentSkill {
  tag_id:      string;
  tag:         string;
  domain:      string;
  proficiency: number;
  verified_at: string | null;
}

export function fetchSkillTags(): Promise<{ skill_tags: SkillTag[] }> {
  // Served from Next.js directly (pg Pool → skill_tags table).
  // No dependency on marketplace_service being up.
  return apiFetch("/api/skill-tags");
}

export function fetchTalentSkills(profileId: string): Promise<{ skills: TalentSkill[] }> {
  return apiFetch(`/api/marketplace/talent-skills/${profileId}`);
}

export function fetchListingRequiredSkills(listingId: string): Promise<{ skills: SkillTag[] }> {
  return apiFetch(`/api/listings/${listingId}/required-skills`);
}

export function updateTalentSkills(
  profileId: string,
  skills:    { tag_id: string; proficiency: number }[],
): Promise<{ ok: boolean; count: number }> {
  return apiFetch(`/api/marketplace/talent-skills/${profileId}`, {
    method: "PUT",
    body:   JSON.stringify({ skills }),
  });
}

export function expressInterest(
  agentId:        string,
  profileId:      string,
  requiredSkills: string[],
): Promise<{ request_id: string }> {
  return apiFetch("/api/marketplace/express-interest", {
    method: "POST",
    body:   JSON.stringify({
      agent_id:        agentId,
      profile_id:      profileId,
      required_skills: requiredSkills,
      min_trust_score: 0,
    }),
  });
}

// ── Identity service — verification endpoints (:3001) ────────────────────

export interface PublicProfile {
  profile_id:         string;
  display_name:       string;
  trust_score:        number;
  identity_tier:      string;
  github_connected:   boolean;
  linkedin_connected: boolean;
  google_connected:   boolean;
  // Added in migration 0017 — present on talent profiles
  bio:                string | null;
  hourly_rate_cents:  number | null;
  availability:       string | null;  // "available" | "busy" | "not-available"
  role:               string | null;  // "talent" | "client" | "agent-owner"
}

export function fetchPublicProfile(profileId: string): Promise<PublicProfile> {
  // Proxy: /api/identity/* → http://localhost:3001/*
  // Identity service route: /identity/public-profile/{id}
  return apiFetch(`/api/identity/public-profile/${profileId}`);
}

export function requestNonce(
  profileId: string,
): Promise<{ nonce_hex: string; expires_at: string; wallet_deep_link: string }> {
  // Identity service route: /identity/nonce-request
  return apiFetch("/api/identity/identity/nonce-request", {
    method: "POST",
    body:   JSON.stringify({ profile_id: profileId }),
  });
}

export function disconnectProvider(
  profileId: string,
  provider:  "github" | "google" | "linkedin",
): Promise<{ ok: boolean; trust_score: number; identity_tier: string }> {
  // Identity service route: /profile/{id}/provider/{provider}
  return apiFetch(`/api/identity/profile/${profileId}/provider/${provider}`, {
    method: "DELETE",
  });
}

export function attestSkills(
  profileId: string,
): Promise<{ ok: boolean; attested: number }> {
  return apiFetch(`/api/marketplace/talent-skills/${profileId}/attest`, {
    method: "POST",
  });
}

export interface AgencyResponse {
  agency_id:  string;
  handle:     string;
  name:       string;
  created_at: string;
}

export function createAgency(req: {
  owner_id:     string;
  name:         string;
  handle:       string;
  description?: string;
  website_url?: string;
}): Promise<AgencyResponse> {
  // Proxy: /api/identity/* → http://localhost:3001/*
  // Route: /agencies (no /identity/ prefix — top-level route in identity_service)
  return apiFetch("/api/identity/agencies", {
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
  id:                 string;
  contract_type:      string;
  status:             "DRAFT" | "PENDING_SIGNATURE" | "SIGNED" | "EXPIRED" | "REVOKED";
  document_hash:      string;
  party_a:            string;
  party_b:            string;
  deployment_id:      string | null;
  created_at:         string;
  signed_at:          string | null;
  party_a_email:      string | null;
  party_b_email:      string | null;
  party_a_signed_at:  string | null;
  party_b_signed_at:  string | null;
}

export interface CreateContractPayload {
  contract_type:  string;
  party_a:        string;
  party_b:        string;
  deployment_id?: string;
  /** Base64-encoded document content bytes */
  document_b64:   string;
  party_b_email?: string;
  party_a_email?: string;
}

export interface CreateContractResponse {
  contract_id:   string;
  document_hash: string;
}

export function fetchContracts(profileId?: string): Promise<Contract[]> {
  const qs = profileId ? `?profile_id=${profileId}` : "";
  return apiFetch(`/api/compliance/contracts${qs}`);
}

export function fetchContract(contractId: string): Promise<Contract> {
  return apiFetch(`/api/compliance/contracts/${contractId}`);
}

export function createContract(payload: CreateContractPayload): Promise<CreateContractResponse> {
  return apiFetch("/api/compliance/contracts", {
    method: "POST",
    body:   JSON.stringify(payload),
  });
}

export function signContract(contractId: string, signerId: string): Promise<void> {
  return apiFetch(`/api/compliance/contracts/${contractId}/sign`, {
    method: "POST",
    body:   JSON.stringify({ signer_id: signerId }),
  });
}

export function requestSignature(
  contractId:  string,
  partyBEmail: string,
): Promise<{ sign_url: string; sign_token: string }> {
  return apiFetch(`/api/compliance/contracts/${contractId}/request-signature`, {
    method: "POST",
    body:   JSON.stringify({ party_b_email: partyBEmail }),
  });
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

// ── Community service (:3011) ─────────────────────────────────────────────

export interface Hub {
  id:           string;
  slug:         string;
  name:         string;
  description:  string;
  category:     string;
  timezone:     string;
  owner_id:     string;
  member_count: number;
  is_private:   boolean;
  created_at:   string;
}

export interface ForumThread {
  id:          string;
  hub_id:      string;
  author_id:   string;
  title:       string;
  body:        string;
  reply_count: number;
  pinned:      boolean;
  locked:      boolean;
  created_at:  string;
}

export interface MentorProfile {
  id:                 string;
  user_id:            string;
  bio:                string;
  specializations:    string[];
  max_mentees:        number;
  current_mentees:    number;
  availability_tz:    string;
  accepting_requests: boolean;
  session_rate_cents: number;
  created_at:         string;
}

export interface MentorshipPair {
  id:           string;
  mentor_id:    string;
  mentee_id:    string;
  status:       string;
  goal:         string;
  started_at:   string;
  completed_at: string | null;
}

export interface CohortGroup {
  id:             string;
  name:           string;
  description:    string;
  cohort_type:    string;
  max_members:    number;
  member_count:   number;
  facilitator_id: string | null;
  created_at:     string;
}

export interface CareerProfile {
  id:              string;
  user_id:         string;
  current_tier:    number;
  target_role:     string | null;
  bio:             string;
  total_xp:        number;
  milestone_count: number;
  created_at:      string;
  updated_at:      string;
}

export interface CareerMilestone {
  id:            string;
  milestone_key: string;
  label:         string;
  xp_awarded:    number;
  achieved_at:   string;
}

export interface SkillGap {
  id:             string;
  skill_tag:      string;
  current_level:  number;
  required_level: number;
  gap_score:      number;
  detected_at:    string;
}

export interface LearningPath {
  id:           string;
  title:        string;
  description:  string;
  skill_target: string;
  steps:        unknown[];
  progress_pct: number;
  assigned_at:  string;
  completed_at: string | null;
}

export interface Checkin {
  id:            string;
  mood_score:    number;
  energy_score:  number;
  stress_score:  number;
  notes:         string | null;
  checked_in_at: string;
}

export interface BurnoutSignal {
  id:             string;
  risk_level:     "low" | "medium" | "high" | "critical";
  risk_score:     number;
  avg_stress_7d:  number | null;
  avg_mood_7d:    number | null;
  checkin_streak: number;
  computed_at:    string;
}

export interface CarbonFootprint {
  id:               string;
  total_kg_offset:  number;
  total_kg_emitted: number;
  net_kg:           number;
  updated_at:       string;
}

// Hubs
export function fetchHubs(category?: string): Promise<{ hubs: Hub[] }> {
  const qs = category ? `?category=${category}` : "";
  return apiFetch(`/api/community/hubs${qs}`);
}

export function joinHub(hubId: string, userId: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/community/hubs/${hubId}/join`, {
    method: "POST",
    body:   JSON.stringify({ user_id: userId }),
  });
}

export function fetchHubThreads(hubId: string): Promise<{ threads: ForumThread[] }> {
  return apiFetch(`/api/community/hubs/${hubId}/threads`);
}

export function createThread(
  hubId: string,
  data:  { author_id: string; title: string; body: string },
): Promise<{ thread_id: string }> {
  return apiFetch(`/api/community/hubs/${hubId}/threads`, {
    method: "POST",
    body:   JSON.stringify(data),
  });
}

// Mentors
export function fetchMentors(): Promise<{ mentors: MentorProfile[] }> {
  return apiFetch("/api/community/mentors");
}

export function requestMentorship(data: {
  mentor_id: string;
  mentee_id: string;
  goal?:     string;
}): Promise<{ pair_id: string }> {
  return apiFetch("/api/community/mentorship/request", {
    method: "POST",
    body:   JSON.stringify(data),
  });
}

export function fetchMentorshipPairs(userId: string): Promise<{ pairs: MentorshipPair[] }> {
  return apiFetch(`/api/community/mentorship/pairs?user_id=${userId}`);
}

// Cohorts
export function fetchCohorts(): Promise<{ cohorts: CohortGroup[] }> {
  return apiFetch("/api/community/cohorts");
}

export function joinCohort(cohortId: string, userId: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/community/cohorts/${cohortId}/join`, {
    method: "POST",
    body:   JSON.stringify({ user_id: userId }),
  });
}

// Career
export function fetchCareerProfile(userId: string): Promise<CareerProfile> {
  return apiFetch(`/api/community/career/${userId}`);
}

export function fetchMilestones(userId: string): Promise<{ milestones: CareerMilestone[] }> {
  return apiFetch(`/api/community/career/${userId}/milestones`);
}

export function fetchSkillGaps(userId: string): Promise<{ gaps: SkillGap[] }> {
  return apiFetch(`/api/community/career/${userId}/gaps`);
}

export function fetchLearningPaths(userId: string): Promise<{ paths: LearningPath[] }> {
  return apiFetch(`/api/community/career/${userId}/paths`);
}

// Wellbeing
export function submitCheckin(
  userId: string,
  data:   { mood_score: number; energy_score: number; stress_score: number; notes?: string },
): Promise<{ checkin_id: string }> {
  return apiFetch(`/api/community/wellbeing/${userId}/checkin`, {
    method: "POST",
    body:   JSON.stringify(data),
  });
}

export function fetchCheckins(userId: string): Promise<{ checkins: Checkin[] }> {
  return apiFetch(`/api/community/wellbeing/${userId}/checkins`);
}

export function fetchBurnoutSignal(userId: string): Promise<BurnoutSignal> {
  return apiFetch(`/api/community/wellbeing/${userId}/burnout`);
}

// Carbon
export function logCarbonOffset(
  userId: string,
  data:   { offset_kg: number; activity_type?: string; provider?: string; certificate_url?: string },
): Promise<{ offset_id: string }> {
  return apiFetch(`/api/community/carbon/${userId}/log`, {
    method: "POST",
    body:   JSON.stringify(data),
  });
}

export function fetchCarbonFootprint(userId: string): Promise<CarbonFootprint> {
  return apiFetch(`/api/community/carbon/${userId}/footprint`);
}

// ── Notification service (:3012) ─────────────────────────────────────────

export interface InAppNotification {
  id:         string;
  user_id:    string;
  title:      string;
  body:       string;
  event_type: string;
  priority:   string;
  read_at:    string | null;
  created_at: string;
}

export interface NotifPrefs {
  email_enabled:     boolean;
  sms_enabled:       boolean;
  push_enabled:      boolean;
  in_app_enabled:    boolean;
  whatsapp_enabled:  boolean;
  slack_enabled:     boolean;
  teams_enabled:     boolean;
  quiet_hours_start: string | null;
  quiet_hours_end:   string | null;
  quiet_hours_tz:    string;
  digest_mode:       string;
}

export interface IntegrationStatus {
  provider:      string;
  status:        string;
  display_name:  string | null;
  connected_at:  string | null;
}

export interface InitWhatsAppResponse {
  qr_url: string;
  nonce:  string;
}

export function fetchInAppNotifications(unreadOnly = false, userId = "demo-user"): Promise<InAppNotification[]> {
  return apiFetch(`/api/notifications?user_id=${userId}${unreadOnly ? "&unread=true" : ""}`);
}

export function fetchUnreadCount(userId = "demo-user"): Promise<{ count: number }> {
  return apiFetch(`/api/notifications/count?user_id=${userId}`);
}

export function markNotificationRead(id: string, userId = "demo-user"): Promise<{ ok: boolean }> {
  return apiFetch(`/api/notifications/${id}/read?user_id=${userId}`, { method: "PATCH" });
}

export function markAllNotificationsRead(userId = "demo-user"): Promise<{ ok: boolean }> {
  return apiFetch("/api/notifications/read-all", {
    method: "POST",
    body:   JSON.stringify({ user_id: userId }),
  });
}

export function fetchNotificationPreferences(userId = "demo-user"): Promise<NotifPrefs> {
  return apiFetch(`/api/notification-preferences?user_id=${userId}`);
}

export function saveNotificationPreferences(prefs: NotifPrefs & { user_id: string }): Promise<{ ok: boolean }> {
  return apiFetch("/api/notification-preferences", {
    method: "POST",
    body:   JSON.stringify(prefs),
  });
}

export function registerDeviceToken(
  userId: string, token: string, platform: "web" | "android" | "ios",
): Promise<{ ok: boolean }> {
  return apiFetch("/api/device-tokens", {
    method: "POST",
    body:   JSON.stringify({ user_id: userId, token, platform }),
  });
}

export function fetchIntegrationsStatus(userId = "demo-user"): Promise<IntegrationStatus[]> {
  return apiFetch(`/api/integrations/status?user_id=${userId}`);
}

export function initWhatsAppConnect(userId = "demo-user"): Promise<InitWhatsAppResponse> {
  return apiFetch("/api/integrations/whatsapp/init", {
    method: "POST",
    body:   JSON.stringify({ user_id: userId }),
  });
}

export function saveTeamsWebhook(userId: string, webhookUrl: string): Promise<{ ok: boolean }> {
  return apiFetch("/api/integrations/teams/webhook", {
    method: "POST",
    body:   JSON.stringify({ user_id: userId, webhook_url: webhookUrl }),
  });
}

export function disconnectIntegration(provider: string, userId = "demo-user"): Promise<{ ok: boolean }> {
  return apiFetch(`/api/integrations/${provider}?user_id=${userId}`, { method: "DELETE" });
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
  community:   "/api/community/health",
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

// ── AiTalent Proposal & Engagement ──────────────────────────────────────────

export interface Proposal {
  id: string
  job_listing_id: string | null
  freelancer_id: string | null
  freelancer_email: string
  job_title: string
  cover_letter: string
  proposed_budget: string
  proposed_timeline: string
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED'
  submitted_at: string
}

export interface AcceptProposalRequest {
  transaction_id: string
  escrow_amount_cents: number
  milestones: string[]
}

export interface AcceptProposalResponse {
  deployment_id: string
  milestone_count: number
}

export interface MilestoneStatus {
  step_id: string
  step_label: string
  passed: boolean
  submitted_at: string | null
  approved_at: string | null
  notes: string | null
}

export async function fetchProposalsForJob(listingId: string): Promise<Proposal[]> {
  const res = await fetch(`/api/marketplace/listings/${listingId}/proposals`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function acceptProposal(
  proposalId: string,
  req: AcceptProposalRequest,
): Promise<AcceptProposalResponse> {
  const res = await fetch(`/api/marketplace/proposals/${proposalId}/accept`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function rejectProposal(proposalId: string, reason?: string): Promise<void> {
  const res = await fetch(`/api/marketplace/proposals/${proposalId}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  })
  if (!res.ok) throw new Error(await res.text())
}

export async function fetchDeploymentMilestones(deploymentId: string): Promise<MilestoneStatus[]> {
  const res = await fetch(`/api/checklist/checklist/${deploymentId}/milestones`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function submitMilestone(
  deploymentId: string,
  stepId: string,
  freelancerId: string,
  notes?: string,
): Promise<void> {
  const res = await fetch(
    `/api/checklist/checklist/${deploymentId}/step/${stepId}/submit`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ freelancer_id: freelancerId, notes }),
    },
  )
  if (!res.ok) throw new Error(await res.text())
}

export async function approveMilestone(
  deploymentId: string,
  stepId: string,
  clientId: string,
): Promise<void> {
  const res = await fetch(
    `/api/checklist/checklist/${deploymentId}/step/${stepId}/approve`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId }),
    },
  )
  if (!res.ok) throw new Error(await res.text())
}
