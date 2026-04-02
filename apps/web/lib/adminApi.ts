// apps/web/lib/adminApi.ts
// Centralised admin API — works in both server components (direct to Rust)
// and client components (via /api/admin/* Next.js proxy with session guard).

const isServer = typeof window === "undefined";

function userBase(): string {
  return isServer
    ? `${process.env.IDENTITY_SERVICE_URL ?? "http://localhost:3001"}/admin`
    : "/api/admin";
}

function marketBase(): string {
  return isServer
    ? `${process.env.MARKETPLACE_SERVICE_URL ?? "http://localhost:3002"}/admin`
    : "/api/admin";
}

async function adminFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init });
  if (!res.ok) throw new Error(`Admin API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

// ── Users ─────────────────────────────────────────────────────────────────────

export interface AdminUser {
  id: string;
  display_name: string | null;
  email: string;
  identity_tier: string;
  trust_score: number;
  account_type: string;
  role: string | null;
  is_admin: boolean;
  suspended_at: string | null;
  suspended_reason: string | null;
  created_at: string;
}

export function fetchAdminUsers(params?: {
  role?: string;
  status?: string;
  account_type?: string;
  limit?: number;
  offset?: number;
}): Promise<{ users: AdminUser[] }> {
  const q = new URLSearchParams();
  if (params?.role)         q.set("role",         params.role);
  if (params?.status)       q.set("status",       params.status);
  if (params?.account_type) q.set("account_type", params.account_type);
  if (params?.limit != null) q.set("limit",  String(params.limit));
  if (params?.offset != null) q.set("offset", String(params.offset));
  const qs = q.toString();
  return adminFetch(`${userBase()}/users${qs ? `?${qs}` : ""}`);
}

export function suspendUser(id: string, reason: string): Promise<{ ok: boolean }> {
  return adminFetch(`${userBase()}/users/${id}/suspend`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });
}

export function unsuspendUser(id: string): Promise<{ ok: boolean }> {
  return adminFetch(`${userBase()}/users/${id}/unsuspend`, { method: "POST" });
}

export function setUserTier(id: string, tier: string): Promise<{ ok: boolean }> {
  return adminFetch(`${userBase()}/users/${id}/set-tier`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tier }),
  });
}

// ── Listings ──────────────────────────────────────────────────────────────────

export interface AdminListing {
  id: string;
  developer_id: string;
  name: string;
  description: string;
  price_cents: number;
  category: string;
  seller_type: string;
  slug: string;
  listing_status: string;
  rejection_reason: string | null;
  active: boolean;
  created_at: string;
}

export function fetchAdminListings(status?: string): Promise<{ listings: AdminListing[] }> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  return adminFetch(`${marketBase()}/listings${qs}`);
}

export function approveListing(id: string): Promise<{ ok: boolean }> {
  return adminFetch(`${marketBase()}/listings/${id}/approve`, { method: "POST" });
}

export function rejectListing(id: string, reason: string): Promise<{ ok: boolean }> {
  return adminFetch(`${marketBase()}/listings/${id}/reject`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });
}

// ── Deployments ───────────────────────────────────────────────────────────────

export interface AdminDeployment {
  id: string;
  agent_id: string;
  client_id: string;
  freelancer_id: string;
  escrow_amount_cents: number;
  state: string;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
}

export function fetchAdminDeployments(state?: string): Promise<{ deployments: AdminDeployment[] }> {
  const qs = state ? `?state=${encodeURIComponent(state)}` : "";
  return adminFetch(`${marketBase()}/deployments${qs}`);
}

// ── Revenue ───────────────────────────────────────────────────────────────────

export interface RevenueData {
  total_deployments: number;
  total_escrow_cents: number;
  active_escrow_cents: number;
  released_cents: number;
  payout_count: number;
  by_state: { state: string; count: number; escrow_cents: number }[];
}

export function fetchRevenueSummary(): Promise<RevenueData> {
  return adminFetch(`${marketBase()}/revenue`);
}

// ── Bundles ───────────────────────────────────────────────────────────────────

export interface AdminBundle {
  id:               string;
  org_id:           string;
  name:             string;
  description:      string | null;
  price_cents:      number;
  listing_status:   string;
  active:           boolean;
  rejection_reason: string | null;
  item_count:       number;
  created_at:       string;
}

export function fetchAdminBundles(status?: string): Promise<{ bundles: AdminBundle[] }> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  return adminFetch(`${marketBase()}/bundles${qs}`);
}

export function approveBundle(id: string): Promise<{ ok: boolean }> {
  return adminFetch(`${marketBase()}/bundles/${id}/approve`, { method: "POST" });
}

export function rejectBundle(id: string, reason: string): Promise<{ ok: boolean }> {
  return adminFetch(`${marketBase()}/bundles/${id}/reject`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });
}
