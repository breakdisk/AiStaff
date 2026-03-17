const IS_SERVER = typeof window === "undefined";
const IDENTITY = process.env.IDENTITY_SERVICE_URL ?? "http://localhost:3001";
const MARKET   = process.env.MARKETPLACE_SERVICE_URL ?? "http://localhost:3002";

function idBase(): string {
  return IS_SERVER ? `${IDENTITY}/enterprise` : "/api/enterprise";
}
function mktBase(): string {
  return IS_SERVER ? `${MARKET}/enterprise` : "/api/enterprise";
}

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, cache: "no-store" });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  if (r.status === 204) return {} as T;
  return r.json();
}

export interface OrgResponse {
  id: string;
  name: string;
  owner_id: string;
  plan_tier: "GROWTH" | "ENTERPRISE" | "PLATINUM";
  contract_value_cents: number;
  renewal_date: string | null;
  veto_window_seconds: number;
  custom_escrow_platform_pct: number;
  csm_name: string | null;
  csm_email: string | null;
  csm_response_sla: string | null;
  member_count: number;
  created_at: string;
}

export interface OrgMember {
  profile_id: string;
  display_name: string;
  email: string;
  member_role: "ADMIN" | "MEMBER";
  identity_tier: string;
  trust_score: number;
  joined_at: string;
}

export interface ApiKey {
  id: string;
  label: string;
  key_preview: string;
  created_at: string;
  last_used_at: string | null;
}

export interface CreatedKey {
  id: string;
  label: string;
  raw_key: string;
}

export interface InviteResponse {
  invite_id: string;
  token: string;
  invitee_email: string;
  expires_at: string;
}

export interface OrgAnalytics {
  org_id: string;
  total_deployments: number;
  active_deployments: number;
  total_spend_cents: number;
  avg_dod_pass_rate: number;
  drift_incidents_30d: number;
}

export interface OrgDeployment {
  id: string;
  listing_title: string | null;
  deployment_type: string;
  status: string;
  escrow_amount_cents: number;
  created_at: string;
  org_id: string;
}

export interface AdminOrgRow {
  id: string;
  name: string;
  owner_email: string;
  plan_tier: string;
  member_count: number;
  contract_value_cents: number;
  renewal_date: string | null;
  created_at: string;
}

export function createOrg(owner_id: string, name: string, plan_tier?: string): Promise<OrgResponse> {
  return req(`${idBase()}/orgs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ owner_id, name, plan_tier: plan_tier ?? "GROWTH" }),
  });
}

export function getMyOrg(profile_id: string): Promise<OrgResponse> {
  return req(`${idBase()}/orgs?profile_id=${profile_id}`);
}

export function getOrg(id: string): Promise<OrgResponse> {
  return req(`${idBase()}/orgs/${id}`);
}

export function updateOrg(id: string, body: Partial<{
  name: string; csm_name: string; csm_email: string; csm_response_sla: string;
  veto_window_seconds: number; contract_value_cents: number; renewal_date: string; plan_tier: string;
}>): Promise<OrgResponse> {
  return req(`${idBase()}/orgs/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function inviteMember(org_id: string, invitee_email: string, inviter_profile_id: string): Promise<InviteResponse> {
  return req(`${idBase()}/orgs/${org_id}/invite`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ invitee_email, inviter_profile_id }),
  });
}

export function acceptInvite(token: string, profile_id: string): Promise<void> {
  return req(`${idBase()}/invites/${token}/accept`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profile_id }),
  });
}

export function listMembers(org_id: string): Promise<OrgMember[]> {
  return req(`${idBase()}/orgs/${org_id}/members`);
}

export function removeMember(org_id: string, profile_id: string): Promise<void> {
  return req(`${idBase()}/orgs/${org_id}/members/${profile_id}`, { method: "DELETE" });
}

export function listApiKeys(org_id: string): Promise<ApiKey[]> {
  return req(`${idBase()}/orgs/${org_id}/api-keys`);
}

export function createApiKey(org_id: string, label: string, created_by: string): Promise<CreatedKey> {
  return req(`${idBase()}/orgs/${org_id}/api-keys`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ label, created_by }),
  });
}

export function revokeApiKey(org_id: string, key_id: string): Promise<void> {
  return req(`${idBase()}/orgs/${org_id}/api-keys/${key_id}`, { method: "DELETE" });
}

export function getOrgAnalytics(org_id: string): Promise<OrgAnalytics> {
  return req(`${mktBase()}/orgs/${org_id}/analytics`);
}

export function listOrgDeployments(org_id: string): Promise<OrgDeployment[]> {
  return req(`${mktBase()}/orgs/${org_id}/deployments`);
}

export function adminListOrgs(): Promise<AdminOrgRow[]> {
  const url = IS_SERVER
    ? `${IDENTITY}/admin/enterprises`
    : "/api/admin/enterprises";
  return req(url);
}
