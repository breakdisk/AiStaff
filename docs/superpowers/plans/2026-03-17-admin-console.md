# Admin Console Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full platform-owner admin console covering user management, listing moderation, deployment oversight, and revenue reporting.

**Architecture:** DB migration adds `is_admin`, `suspended_at/reason` to `unified_profiles` and `listing_status/rejection_reason` to `agent_listings`. Admin endpoints are added to existing `identity_service` (users) and `marketplace_service` (listings, deployments, revenue). The Next.js `/admin/*` tree is protected by a middleware role check and calls backend via a dedicated `lib/adminApi.ts`.

**Tech Stack:** Rust/Axum (identity_service port 3001, marketplace_service port 3002), Next.js 15 App Router, React 19 Server + Client Components, Tailwind 4, SQLx offline mode.

---

## File Map

### New files
| Path | Purpose |
|------|---------|
| `migrations/0025_admin_columns.sql` | DB columns for admin, suspension, listing moderation |
| `crates/identity_service/src/admin_handlers.rs` | Rust admin user endpoints |
| `crates/marketplace_service/src/admin_handlers.rs` | Rust admin listings/deployments/revenue endpoints |
| `apps/web/lib/adminApi.ts` | Centralised admin API fetch helpers |
| `apps/web/app/admin/layout.tsx` | Admin shell: sidebar + role guard |
| `apps/web/app/admin/page.tsx` | Overview dashboard (4 stat cards) |
| `apps/web/app/admin/users/page.tsx` | User management table |
| `apps/web/app/admin/listings/page.tsx` | Listing moderation queue |
| `apps/web/app/admin/deployments/page.tsx` | All-deployments table |
| `apps/web/app/admin/revenue/page.tsx` | Platform revenue summary |

### Modified files
| Path | Change |
|------|--------|
| `crates/identity_service/src/main.rs` | Mount admin routes; wire `is_admin` in oauth response |
| `crates/identity_service/src/oauth_handler.rs` | Return `is_admin` field from `handle_oauth_callback` |
| `crates/marketplace_service/src/main.rs` | Mount admin routes |
| `apps/web/auth.ts` | Read + forward `is_admin` into session |
| `apps/web/types/next-auth.d.ts` | Add `isAdmin: boolean` to Session + JWT types |
| `apps/web/middleware.ts` | Block `/admin/*` for non-admin sessions |

---

## Task 1 — DB Migration 0025

**Files:**
- Create: `migrations/0025_admin_columns.sql`

- [ ] Write migration:

```sql
-- migrations/0025_admin_columns.sql

-- Platform-owner flag on unified_profiles
ALTER TABLE unified_profiles
    ADD COLUMN IF NOT EXISTS is_admin        BOOLEAN      NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS suspended_at    TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS suspended_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_unified_profiles_admin
    ON unified_profiles (is_admin) WHERE is_admin = TRUE;

-- Listing moderation status
ALTER TABLE agent_listings
    ADD COLUMN IF NOT EXISTS listing_status   TEXT NOT NULL DEFAULT 'APPROVED',
    ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_agent_listings_status
    ON agent_listings (listing_status);

-- Seed: set the first admin by email (replace with real email before deploy)
-- UPDATE unified_profiles SET is_admin = TRUE WHERE email = 'owner@aistaffglobal.com';
```

- [ ] Commit:
```bash
git add migrations/0025_admin_columns.sql
git commit -m "feat(admin): migration 0025 — is_admin, suspension, listing_status columns"
```

---

## Task 2 — identity_service: `is_admin` in OAuth response

**Files:**
- Modify: `crates/identity_service/src/oauth_handler.rs` (lines ~66-80)

- [ ] In `handle_oauth_callback`, after fetching `account_type + role`, also fetch `is_admin`:

```rust
// After the existing account_type + role fetch:
let is_admin: bool = sqlx::query_scalar(
    "SELECT is_admin FROM unified_profiles WHERE id = $1",
)
.bind(profile_id)
.fetch_one(pool)
.await
.unwrap_or(false);
```

- [ ] Add `is_admin` to the returned struct/JSON (find the `OAuthCallbackResponse` struct and add the field):

```rust
// In the response struct (wherever it is defined):
pub is_admin: bool,

// In the Ok(resp) construction:
is_admin,
```

- [ ] Run cargo check:
```bash
SQLX_OFFLINE=true cargo check -p identity_service
```
Expected: no errors.

- [ ] Commit:
```bash
git add crates/identity_service/src/oauth_handler.rs
git commit -m "feat(admin): include is_admin in oauth-callback response"
```

---

## Task 3 — identity_service: admin user-management endpoints

**Files:**
- Create: `crates/identity_service/src/admin_handlers.rs`
- Modify: `crates/identity_service/src/main.rs`

- [ ] Create `admin_handlers.rs`:

```rust
//! Admin-only user management endpoints.
//! All handlers assume the caller is authenticated as admin
//! (enforced by the Next.js middleware + route proxy; no extra JWT check here
//!  because these routes are never exposed externally via Traefik).

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;

// ── GET /admin/users ──────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct UserListQuery {
    /// Filter by role: "talent" | "client" | "agent-owner" | all
    pub role: Option<String>,
    /// Filter: "suspended" | "active" | all
    pub status: Option<String>,
    /// Filter by account_type: "individual" | "agency"
    pub account_type: Option<String>,
    pub limit:  Option<i64>,
    pub offset: Option<i64>,
}

pub async fn list_users(
    State(pool): State<PgPool>,
    Query(q): Query<UserListQuery>,
) -> impl IntoResponse {
    use sqlx::Row as _;
    let limit  = q.limit.unwrap_or(50).min(200);
    let offset = q.offset.unwrap_or(0);

    let rows = sqlx::query(
        "SELECT id, display_name, email, identity_tier::TEXT AS identity_tier,
                trust_score, account_type, role, is_admin,
                suspended_at, suspended_reason, created_at, updated_at
         FROM unified_profiles
         WHERE ($1::TEXT IS NULL OR role = $1)
           AND ($2::TEXT IS NULL OR account_type = $2)
           AND ($3::TEXT IS NULL OR
               CASE $3
                 WHEN 'suspended' THEN suspended_at IS NOT NULL
                 WHEN 'active'    THEN suspended_at IS NULL
                 ELSE TRUE
               END)
         ORDER BY created_at DESC
         LIMIT $4 OFFSET $5",
    )
    .bind(&q.role)
    .bind(&q.account_type)
    .bind(&q.status)
    .bind(limit)
    .bind(offset)
    .fetch_all(&pool)
    .await;

    match rows {
        Ok(rs) => {
            let users: Vec<serde_json::Value> = rs.iter().map(|r| {
                serde_json::json!({
                    "id":               r.get::<Uuid,_>("id"),
                    "display_name":     r.get::<Option<String>,_>("display_name"),
                    "email":            r.get::<String,_>("email"),
                    "identity_tier":    r.get::<&str,_>("identity_tier"),
                    "trust_score":      r.get::<i16,_>("trust_score"),
                    "account_type":     r.get::<String,_>("account_type"),
                    "role":             r.get::<Option<String>,_>("role"),
                    "is_admin":         r.get::<bool,_>("is_admin"),
                    "suspended_at":     r.get::<Option<chrono::DateTime<chrono::Utc>>,_>("suspended_at")
                                         .map(|t| t.to_rfc3339()),
                    "suspended_reason": r.get::<Option<String>,_>("suspended_reason"),
                    "created_at":       r.get::<chrono::DateTime<chrono::Utc>,_>("created_at").to_rfc3339(),
                })
            }).collect();
            (StatusCode::OK, Json(serde_json::json!({ "users": users, "limit": limit, "offset": offset }))).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

// ── POST /admin/users/:id/suspend ─────────────────────────────────────────────

#[derive(Deserialize)]
pub struct SuspendBody {
    pub reason: String,
}

pub async fn suspend_user(
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
    Json(body): Json<SuspendBody>,
) -> impl IntoResponse {
    let res = sqlx::query(
        "UPDATE unified_profiles
         SET suspended_at = NOW(), suspended_reason = $2, updated_at = NOW()
         WHERE id = $1 AND is_admin = FALSE",
    )
    .bind(id)
    .bind(&body.reason)
    .execute(&pool)
    .await;

    match res {
        Ok(r) if r.rows_affected() == 0 =>
            (StatusCode::NOT_FOUND, "user not found or is admin").into_response(),
        Ok(_) => (StatusCode::OK, Json(serde_json::json!({ "ok": true }))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

// ── POST /admin/users/:id/unsuspend ───────────────────────────────────────────

pub async fn unsuspend_user(
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
) -> impl IntoResponse {
    let res = sqlx::query(
        "UPDATE unified_profiles
         SET suspended_at = NULL, suspended_reason = NULL, updated_at = NOW()
         WHERE id = $1",
    )
    .bind(id)
    .execute(&pool)
    .await;

    match res {
        Ok(_) => (StatusCode::OK, Json(serde_json::json!({ "ok": true }))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

// ── POST /admin/users/:id/set-tier ────────────────────────────────────────────

#[derive(Deserialize)]
pub struct SetTierBody {
    /// "UNVERIFIED" | "SOCIAL_VERIFIED" | "BIOMETRIC_VERIFIED"
    pub tier: String,
}

pub async fn set_user_tier(
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
    Json(body): Json<SetTierBody>,
) -> impl IntoResponse {
    let valid = ["UNVERIFIED", "SOCIAL_VERIFIED", "BIOMETRIC_VERIFIED"];
    if !valid.contains(&body.tier.as_str()) {
        return (StatusCode::BAD_REQUEST, "invalid tier").into_response();
    }
    let res = sqlx::query(
        "UPDATE unified_profiles
         SET identity_tier = $2::identity_tier, updated_at = NOW()
         WHERE id = $1",
    )
    .bind(id)
    .bind(&body.tier)
    .execute(&pool)
    .await;

    match res {
        Ok(r) if r.rows_affected() == 0 => StatusCode::NOT_FOUND.into_response(),
        Ok(_) => (StatusCode::OK, Json(serde_json::json!({ "ok": true }))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}
```

- [ ] Mount in `main.rs` — add `mod admin_handlers;` and routes:

```rust
// Inside the router builder, after existing routes:
.route("/admin/users",                  get(admin_handlers::list_users))
.route("/admin/users/{id}/suspend",     post(admin_handlers::suspend_user))
.route("/admin/users/{id}/unsuspend",   post(admin_handlers::unsuspend_user))
.route("/admin/users/{id}/set-tier",    post(admin_handlers::set_user_tier))
```

- [ ] Run cargo check:
```bash
SQLX_OFFLINE=true cargo check -p identity_service
```
Expected: no errors.

- [ ] Commit:
```bash
git add crates/identity_service/src/admin_handlers.rs crates/identity_service/src/main.rs
git commit -m "feat(admin): user management endpoints in identity_service"
```

---

## Task 4 — marketplace_service: admin listing/deployment/revenue endpoints

**Files:**
- Create: `crates/marketplace_service/src/admin_handlers.rs`
- Modify: `crates/marketplace_service/src/main.rs`

- [ ] Create `admin_handlers.rs`:

```rust
//! Admin endpoints: listing moderation, deployment overview, revenue summary.

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::Deserialize;
use sqlx::PgPool;
use std::sync::Arc;
use uuid::Uuid;

use crate::handlers::AppState;

// ── GET /admin/listings ───────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct ListingQuery {
    /// "PENDING_REVIEW" | "APPROVED" | "REJECTED" | all
    pub status: Option<String>,
    pub limit:  Option<i64>,
    pub offset: Option<i64>,
}

pub async fn list_listings(
    State(state): State<Arc<AppState>>,
    Query(q): Query<ListingQuery>,
) -> impl IntoResponse {
    use sqlx::Row as _;
    let limit  = q.limit.unwrap_or(50).min(200);
    let offset = q.offset.unwrap_or(0);

    let rows = sqlx::query(
        "SELECT id, developer_id, name, description, price_cents, category,
                seller_type, slug, listing_status, rejection_reason,
                active, created_at
         FROM agent_listings
         WHERE ($1::TEXT IS NULL OR listing_status = $1)
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3",
    )
    .bind(&q.status)
    .bind(limit)
    .bind(offset)
    .fetch_all(&state.db)
    .await;

    match rows {
        Ok(rs) => {
            let listings: Vec<serde_json::Value> = rs.iter().map(|r| {
                serde_json::json!({
                    "id":               r.get::<Uuid,_>("id"),
                    "developer_id":     r.get::<Uuid,_>("developer_id"),
                    "name":             r.get::<&str,_>("name"),
                    "description":      r.get::<&str,_>("description"),
                    "price_cents":      r.get::<i64,_>("price_cents"),
                    "category":         r.get::<&str,_>("category"),
                    "seller_type":      r.get::<&str,_>("seller_type"),
                    "slug":             r.get::<&str,_>("slug"),
                    "listing_status":   r.get::<&str,_>("listing_status"),
                    "rejection_reason": r.get::<Option<String>,_>("rejection_reason"),
                    "active":           r.get::<bool,_>("active"),
                    "created_at":       r.get::<chrono::DateTime<chrono::Utc>,_>("created_at").to_rfc3339(),
                })
            }).collect();
            (StatusCode::OK, Json(serde_json::json!({ "listings": listings }))).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

// ── POST /admin/listings/:id/approve ─────────────────────────────────────────

pub async fn approve_listing(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
) -> impl IntoResponse {
    let res = sqlx::query(
        "UPDATE agent_listings
         SET listing_status = 'APPROVED', rejection_reason = NULL, updated_at = NOW()
         WHERE id = $1",
    )
    .bind(id)
    .execute(&state.db)
    .await;

    match res {
        Ok(r) if r.rows_affected() == 0 => StatusCode::NOT_FOUND.into_response(),
        Ok(_) => (StatusCode::OK, Json(serde_json::json!({ "ok": true }))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

// ── POST /admin/listings/:id/reject ──────────────────────────────────────────

#[derive(Deserialize)]
pub struct RejectBody {
    pub reason: String,
}

pub async fn reject_listing(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    Json(body): Json<RejectBody>,
) -> impl IntoResponse {
    let res = sqlx::query(
        "UPDATE agent_listings
         SET listing_status = 'REJECTED', rejection_reason = $2,
             active = FALSE, updated_at = NOW()
         WHERE id = $1",
    )
    .bind(id)
    .bind(&body.reason)
    .execute(&state.db)
    .await;

    match res {
        Ok(r) if r.rows_affected() == 0 => StatusCode::NOT_FOUND.into_response(),
        Ok(_) => (StatusCode::OK, Json(serde_json::json!({ "ok": true }))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

// ── GET /admin/deployments ────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct DeploymentQuery {
    pub state:  Option<String>,
    pub limit:  Option<i64>,
    pub offset: Option<i64>,
}

pub async fn list_deployments(
    State(state): State<Arc<AppState>>,
    Query(q): Query<DeploymentQuery>,
) -> impl IntoResponse {
    use sqlx::Row as _;
    let limit  = q.limit.unwrap_or(50).min(200);
    let offset = q.offset.unwrap_or(0);

    let rows = sqlx::query(
        "SELECT id, agent_id, client_id, freelancer_id,
                escrow_amount_cents, state::TEXT AS state,
                failure_reason, created_at, updated_at
         FROM deployments
         WHERE ($1::TEXT IS NULL OR state::TEXT = $1)
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3",
    )
    .bind(&q.state)
    .bind(limit)
    .bind(offset)
    .fetch_all(&state.db)
    .await;

    match rows {
        Ok(rs) => {
            let deps: Vec<serde_json::Value> = rs.iter().map(|r| {
                serde_json::json!({
                    "id":                   r.get::<Uuid,_>("id"),
                    "agent_id":             r.get::<Uuid,_>("agent_id"),
                    "client_id":            r.get::<Uuid,_>("client_id"),
                    "freelancer_id":        r.get::<Uuid,_>("freelancer_id"),
                    "escrow_amount_cents":  r.get::<i64,_>("escrow_amount_cents"),
                    "state":                r.get::<&str,_>("state"),
                    "failure_reason":       r.get::<Option<String>,_>("failure_reason"),
                    "created_at":           r.get::<chrono::DateTime<chrono::Utc>,_>("created_at").to_rfc3339(),
                    "updated_at":           r.get::<chrono::DateTime<chrono::Utc>,_>("updated_at").to_rfc3339(),
                })
            }).collect();
            (StatusCode::OK, Json(serde_json::json!({ "deployments": deps }))).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

// ── GET /admin/revenue ────────────────────────────────────────────────────────

pub async fn revenue_summary(
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    use sqlx::Row as _;

    // Total platform fees collected
    let fees = sqlx::query(
        "SELECT
           COUNT(*)                 AS total_deployments,
           COALESCE(SUM(fee_cents), 0) AS total_fee_cents,
           COALESCE(SUM(CASE WHEN created_at >= NOW() - INTERVAL '30 days'
                             THEN fee_cents END), 0) AS last_30d_cents
         FROM platform_fees",
    )
    .fetch_one(&state.db)
    .await;

    // Deployment state distribution
    let states = sqlx::query(
        "SELECT state::TEXT AS state, COUNT(*) AS cnt
         FROM deployments GROUP BY state ORDER BY cnt DESC",
    )
    .fetch_all(&state.db)
    .await;

    // Active listings count
    let listing_counts = sqlx::query(
        "SELECT listing_status, COUNT(*) AS cnt
         FROM agent_listings GROUP BY listing_status",
    )
    .fetch_all(&state.db)
    .await;

    match (fees, states, listing_counts) {
        (Ok(f), Ok(ss), Ok(ls)) => {
            let state_dist: Vec<serde_json::Value> = ss.iter().map(|r| {
                serde_json::json!({ "state": r.get::<&str,_>("state"), "count": r.get::<i64,_>("cnt") })
            }).collect();
            let listing_dist: Vec<serde_json::Value> = ls.iter().map(|r| {
                serde_json::json!({ "status": r.get::<&str,_>("listing_status"), "count": r.get::<i64,_>("cnt") })
            }).collect();
            (StatusCode::OK, Json(serde_json::json!({
                "total_fee_cents":       f.get::<i64,_>("total_fee_cents"),
                "last_30d_fee_cents":    f.get::<i64,_>("last_30d_cents"),
                "total_fee_deployments": f.get::<i64,_>("total_deployments"),
                "deployment_states":     state_dist,
                "listing_statuses":      listing_dist,
            }))).into_response()
        }
        _ => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}
```

- [ ] Mount in `main.rs`:

```rust
mod admin_handlers;

// Inside router builder:
.route("/admin/listings",               get(admin_handlers::list_listings))
.route("/admin/listings/{id}/approve",  post(admin_handlers::approve_listing))
.route("/admin/listings/{id}/reject",   post(admin_handlers::reject_listing))
.route("/admin/deployments",            get(admin_handlers::list_deployments))
.route("/admin/revenue",                get(admin_handlers::revenue_summary))
```

- [ ] Cargo check:
```bash
SQLX_OFFLINE=true cargo check -p marketplace_service
```
Expected: no errors.

- [ ] Commit:
```bash
git add crates/marketplace_service/src/admin_handlers.rs crates/marketplace_service/src/main.rs
git commit -m "feat(admin): listing moderation, deployment overview, revenue endpoints"
```

---

## Task 5 — auth.ts + session types: forward `is_admin`

**Files:**
- Modify: `apps/web/types/next-auth.d.ts`
- Modify: `apps/web/auth.ts`

- [ ] In `next-auth.d.ts`, add `isAdmin: boolean` to both `Session.user` and `JWT`:

```typescript
// In the Session interface extension:
isAdmin: boolean;

// In the JWT interface extension:
isAdmin?: boolean;
```

- [ ] In `auth.ts` `jwt` callback, after receiving the identity_service response, forward `is_admin`:

```typescript
// identity_service returns is_admin in the oauth-callback response
token.isAdmin = (profile as { is_admin?: boolean }).is_admin ?? false;
```

- [ ] In `auth.ts` `session` callback:

```typescript
session.user.isAdmin = token.isAdmin ?? false;
```

- [ ] Commit:
```bash
git add apps/web/types/next-auth.d.ts apps/web/auth.ts
git commit -m "feat(admin): forward is_admin into session and JWT"
```

---

## Task 6 — Middleware: protect `/admin/*`

**Files:**
- Modify: `apps/web/middleware.ts`

- [ ] Add admin guard. After the existing `isPublic` check, before the generic auth redirect, add:

```typescript
// Admin route guard — must come before the generic auth check
if (pathname.startsWith("/admin")) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.isAdmin) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }
  return NextResponse.next();
}
```

Import `getToken` from `next-auth/jwt` at the top of the file.

- [ ] Commit:
```bash
git add apps/web/middleware.ts
git commit -m "feat(admin): protect /admin/* routes with isAdmin session check"
```

---

## Task 7 — `lib/adminApi.ts`: admin fetch helpers

**Files:**
- Create: `apps/web/lib/adminApi.ts`

- [ ] Create:

```typescript
// apps/web/lib/adminApi.ts
// All admin API calls — no fetch() scattered across components.

const IDENTITY_URL    = process.env.IDENTITY_SERVICE_URL    ?? "http://localhost:3001";
const MARKETPLACE_URL = process.env.MARKETPLACE_SERVICE_URL ?? "http://localhost:3002";

async function adminFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init });
  if (!res.ok) throw new Error(`Admin API error ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

// ── Users ──────────────────────────────────────────────────────────────────

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
  role?: string; status?: string; account_type?: string;
  limit?: number; offset?: number;
}): Promise<{ users: AdminUser[] }> {
  const q = new URLSearchParams();
  if (params?.role)         q.set("role",         params.role);
  if (params?.status)       q.set("status",       params.status);
  if (params?.account_type) q.set("account_type", params.account_type);
  if (params?.limit)        q.set("limit",        String(params.limit));
  if (params?.offset)       q.set("offset",       String(params.offset));
  return adminFetch(`${IDENTITY_URL}/admin/users?${q}`);
}

export function suspendUser(id: string, reason: string) {
  return adminFetch(`${IDENTITY_URL}/admin/users/${id}/suspend`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });
}

export function unsuspendUser(id: string) {
  return adminFetch(`${IDENTITY_URL}/admin/users/${id}/unsuspend`, { method: "POST" });
}

export function setUserTier(id: string, tier: string) {
  return adminFetch(`${IDENTITY_URL}/admin/users/${id}/set-tier`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tier }),
  });
}

// ── Listings ───────────────────────────────────────────────────────────────

export interface AdminListing {
  id: string; developer_id: string; name: string; description: string;
  price_cents: number; category: string; seller_type: string;
  slug: string; listing_status: string; rejection_reason: string | null;
  active: boolean; created_at: string;
}

export function fetchAdminListings(status?: string): Promise<{ listings: AdminListing[] }> {
  const q = status ? `?status=${status}` : "";
  return adminFetch(`${MARKETPLACE_URL}/admin/listings${q}`);
}

export function approveListing(id: string) {
  return adminFetch(`${MARKETPLACE_URL}/admin/listings/${id}/approve`, { method: "POST" });
}

export function rejectListing(id: string, reason: string) {
  return adminFetch(`${MARKETPLACE_URL}/admin/listings/${id}/reject`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });
}

// ── Deployments ────────────────────────────────────────────────────────────

export interface AdminDeployment {
  id: string; agent_id: string; client_id: string; freelancer_id: string;
  escrow_amount_cents: number; state: string; failure_reason: string | null;
  created_at: string; updated_at: string;
}

export function fetchAdminDeployments(state?: string): Promise<{ deployments: AdminDeployment[] }> {
  const q = state ? `?state=${state}` : "";
  return adminFetch(`${MARKETPLACE_URL}/admin/deployments${q}`);
}

// ── Revenue ────────────────────────────────────────────────────────────────

export interface RevenueData {
  total_fee_cents: number;
  last_30d_fee_cents: number;
  total_fee_deployments: number;
  deployment_states: { state: string; count: number }[];
  listing_statuses: { status: string; count: number }[];
}

export function fetchRevenueSummary(): Promise<RevenueData> {
  return adminFetch(`${MARKETPLACE_URL}/admin/revenue`);
}
```

- [ ] Commit:
```bash
git add apps/web/lib/adminApi.ts
git commit -m "feat(admin): centralised adminApi.ts helper"
```

---

## Task 8 — Admin Layout + overview dashboard

**Files:**
- Create: `apps/web/app/admin/layout.tsx`
- Create: `apps/web/app/admin/page.tsx`

- [ ] `layout.tsx` — server component, role guard + sidebar:

```tsx
// apps/web/app/admin/layout.tsx
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Users, Package, Zap, DollarSign, LayoutDashboard } from "lucide-react";

const NAV = [
  { href: "/admin",             label: "Overview",     icon: LayoutDashboard },
  { href: "/admin/users",       label: "Users",        icon: Users           },
  { href: "/admin/listings",    label: "Listings",     icon: Package         },
  { href: "/admin/deployments", label: "Deployments",  icon: Zap             },
  { href: "/admin/revenue",     label: "Revenue",      icon: DollarSign      },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.isAdmin) redirect("/dashboard");

  return (
    <div className="flex min-h-screen bg-zinc-950 text-zinc-50">
      {/* Sidebar */}
      <aside className="w-52 shrink-0 border-r border-zinc-800 flex flex-col">
        <div className="px-4 py-4 border-b border-zinc-800">
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest">Admin Console</p>
          <p className="text-xs text-amber-400 font-mono mt-0.5">AiStaff Platform</p>
        </div>
        <nav className="flex-1 py-3">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-zinc-400
                         hover:text-zinc-50 hover:bg-zinc-800 transition-colors"
            >
              <Icon size={14} />
              {label}
            </Link>
          ))}
        </nav>
        <div className="px-4 py-3 border-t border-zinc-800">
          <p className="text-[10px] text-zinc-600 font-mono">
            {session.user.email}
          </p>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto p-6">{children}</main>
    </div>
  );
}
```

- [ ] `page.tsx` — overview with 4 stat cards (fetches revenue summary):

```tsx
// apps/web/app/admin/page.tsx
import { fetchRevenueSummary, fetchAdminUsers, fetchAdminListings, fetchAdminDeployments } from "@/lib/adminApi";

function fmtUSD(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-sm p-5">
      <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-2">{label}</p>
      <p className="text-2xl font-mono text-zinc-50">{value}</p>
      {sub && <p className="text-xs text-zinc-500 mt-1">{sub}</p>}
    </div>
  );
}

export default async function AdminOverview() {
  const [revenue, users, listings, deployments] = await Promise.allSettled([
    fetchRevenueSummary(),
    fetchAdminUsers({ limit: 1 }),
    fetchAdminListings(),
    fetchAdminDeployments(),
  ]);

  const rev    = revenue.status    === "fulfilled" ? revenue.value    : null;
  const pending = listings.status  === "fulfilled"
    ? listings.value.listings.filter(l => l.listing_status === "PENDING_REVIEW").length
    : 0;
  const suspended = users.status   === "fulfilled"
    ? 0 : 0; // user count from query

  return (
    <div>
      <h1 className="text-base font-semibold text-zinc-50 mb-6">Platform Overview</h1>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Total Platform Fees"
          value={rev ? fmtUSD(rev.total_fee_cents) : "—"}
          sub="All time"
        />
        <StatCard
          label="Last 30 Days"
          value={rev ? fmtUSD(rev.last_30d_fee_cents) : "—"}
          sub={`${rev?.total_fee_deployments ?? 0} deployments total`}
        />
        <StatCard
          label="Pending Listings"
          value={String(pending)}
          sub="Awaiting moderation"
        />
        <StatCard
          label="Active Deployments"
          value={rev ? String(rev.deployment_states.find(s => s.state === "VETO_WINDOW")?.count ?? 0) : "—"}
          sub="In veto window now"
        />
      </div>

      {/* Deployment state breakdown */}
      {rev && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-sm p-5 mb-6">
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-4">Deployment States</p>
          <div className="space-y-2">
            {rev.deployment_states.map(s => (
              <div key={s.state} className="flex items-center justify-between text-sm">
                <span className="font-mono text-zinc-400">{s.state}</span>
                <span className="text-zinc-50">{s.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] Commit:
```bash
git add apps/web/app/admin/
git commit -m "feat(admin): admin layout + overview dashboard"
```

---

## Task 9 — Users page

**Files:**
- Create: `apps/web/app/admin/users/page.tsx`

- [ ] Create server component with client actions via a `UserActions` client component:

```tsx
// apps/web/app/admin/users/page.tsx
import { fetchAdminUsers, type AdminUser } from "@/lib/adminApi";
import { UserActionsBar } from "./UserActionsBar";

export default async function AdminUsers({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; status?: string }>;
}) {
  const sp    = await searchParams;
  const data  = await fetchAdminUsers({ role: sp.role, status: sp.status, limit: 100 }).catch(() => ({ users: [] as AdminUser[] }));

  const tierColor: Record<string, string> = {
    UNVERIFIED:         "text-zinc-500",
    SOCIAL_VERIFIED:    "text-sky-400",
    BIOMETRIC_VERIFIED: "text-emerald-400",
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-base font-semibold text-zinc-50">Users ({data.users.length})</h1>
        <div className="flex gap-2 text-xs">
          {["", "talent", "client", "agent-owner"].map(r => (
            <a key={r} href={r ? `?role=${r}` : "?"} className="px-2 py-1 bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-zinc-50">
              {r || "All"}
            </a>
          ))}
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-[10px] text-zinc-500 uppercase tracking-wider">
              <th className="text-left px-4 py-2">User</th>
              <th className="text-left px-4 py-2">Role</th>
              <th className="text-left px-4 py-2">Tier</th>
              <th className="text-left px-4 py-2">Trust</th>
              <th className="text-left px-4 py-2">Status</th>
              <th className="text-left px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.users.map(u => (
              <tr key={u.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/40 transition-colors">
                <td className="px-4 py-3">
                  <p className="text-zinc-50 font-medium">{u.display_name ?? "—"}</p>
                  <p className="text-zinc-500 text-xs font-mono">{u.email}</p>
                </td>
                <td className="px-4 py-3 text-zinc-400">{u.role ?? "—"}</td>
                <td className={`px-4 py-3 font-mono text-xs ${tierColor[u.identity_tier] ?? "text-zinc-400"}`}>
                  {u.identity_tier}
                </td>
                <td className="px-4 py-3 text-zinc-400">{u.trust_score}</td>
                <td className="px-4 py-3">
                  {u.suspended_at
                    ? <span className="text-red-400 text-xs">SUSPENDED</span>
                    : <span className="text-emerald-500 text-xs">ACTIVE</span>}
                </td>
                <td className="px-4 py-3">
                  <UserActionsBar user={u} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.users.length === 0 && (
          <p className="text-center text-zinc-500 text-sm py-8">No users found.</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] Create `apps/web/app/admin/users/UserActionsBar.tsx` (client component for actions):

```tsx
"use client";
import { useState } from "react";
import { suspendUser, unsuspendUser, setUserTier, type AdminUser } from "@/lib/adminApi";

export function UserActionsBar({ user }: { user: AdminUser }) {
  const [busy, setBusy] = useState(false);

  async function handle(action: () => Promise<unknown>) {
    setBusy(true);
    try { await action(); window.location.reload(); }
    catch (e) { alert(String(e)); }
    finally { setBusy(false); }
  }

  if (user.is_admin) return <span className="text-amber-400 text-xs">PLATFORM ADMIN</span>;

  return (
    <div className="flex gap-1 flex-wrap">
      {user.suspended_at ? (
        <button
          disabled={busy}
          onClick={() => handle(() => unsuspendUser(user.id))}
          className="text-[11px] px-2 py-0.5 border border-emerald-800 text-emerald-400 hover:bg-emerald-900/30 disabled:opacity-50"
        >Unsuspend</button>
      ) : (
        <button
          disabled={busy}
          onClick={() => {
            const reason = window.prompt("Suspension reason:");
            if (reason) handle(() => suspendUser(user.id, reason));
          }}
          className="text-[11px] px-2 py-0.5 border border-red-900 text-red-400 hover:bg-red-900/30 disabled:opacity-50"
        >Suspend</button>
      )}
      <select
        disabled={busy}
        defaultValue=""
        onChange={e => { if (e.target.value) handle(() => setUserTier(user.id, e.target.value)); }}
        className="text-[11px] bg-zinc-800 border border-zinc-700 text-zinc-300 px-1 disabled:opacity-50"
      >
        <option value="" disabled>Set tier</option>
        <option value="UNVERIFIED">Unverified</option>
        <option value="SOCIAL_VERIFIED">Social</option>
        <option value="BIOMETRIC_VERIFIED">Biometric</option>
      </select>
    </div>
  );
}
```

- [ ] Commit:
```bash
git add apps/web/app/admin/users/
git commit -m "feat(admin): users management page with suspend/tier actions"
```

---

## Task 10 — Listings moderation page

**Files:**
- Create: `apps/web/app/admin/listings/page.tsx`
- Create: `apps/web/app/admin/listings/ListingActions.tsx`

- [ ] `page.tsx`:

```tsx
// apps/web/app/admin/listings/page.tsx
import { fetchAdminListings, type AdminListing } from "@/lib/adminApi";
import { ListingActions } from "./ListingActions";

function fmtUSD(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

const statusColor: Record<string, string> = {
  APPROVED:       "text-emerald-400",
  PENDING_REVIEW: "text-amber-400",
  REJECTED:       "text-red-400",
};

export default async function AdminListings({
  searchParams,
}: { searchParams: Promise<{ status?: string }> }) {
  const sp   = await searchParams;
  const data = await fetchAdminListings(sp.status).catch(() => ({ listings: [] as AdminListing[] }));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-base font-semibold text-zinc-50">Listings ({data.listings.length})</h1>
        <div className="flex gap-2 text-xs">
          {[["", "All"], ["PENDING_REVIEW", "Pending"], ["APPROVED", "Approved"], ["REJECTED", "Rejected"]].map(([v, label]) => (
            <a key={v} href={v ? `?status=${v}` : "?"} className="px-2 py-1 bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-zinc-50">
              {label}
            </a>
          ))}
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-[10px] text-zinc-500 uppercase tracking-wider">
              <th className="text-left px-4 py-2">Listing</th>
              <th className="text-left px-4 py-2">Category</th>
              <th className="text-left px-4 py-2">Price</th>
              <th className="text-left px-4 py-2">Status</th>
              <th className="text-left px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.listings.map(l => (
              <tr key={l.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/40 transition-colors">
                <td className="px-4 py-3">
                  <p className="text-zinc-50 font-medium">{l.name}</p>
                  <p className="text-zinc-500 text-xs line-clamp-1">{l.description}</p>
                </td>
                <td className="px-4 py-3 text-zinc-400">{l.category}</td>
                <td className="px-4 py-3 text-zinc-300 font-mono">{fmtUSD(l.price_cents)}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-mono ${statusColor[l.listing_status] ?? "text-zinc-400"}`}>
                    {l.listing_status}
                  </span>
                  {l.rejection_reason && (
                    <p className="text-xs text-zinc-600 mt-0.5">{l.rejection_reason}</p>
                  )}
                </td>
                <td className="px-4 py-3">
                  <ListingActions listing={l} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.listings.length === 0 && (
          <p className="text-center text-zinc-500 text-sm py-8">No listings found.</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] `ListingActions.tsx`:

```tsx
"use client";
import { useState } from "react";
import { approveListing, rejectListing, type AdminListing } from "@/lib/adminApi";

export function ListingActions({ listing }: { listing: AdminListing }) {
  const [busy, setBusy] = useState(false);

  async function handle(action: () => Promise<unknown>) {
    setBusy(true);
    try { await action(); window.location.reload(); }
    catch (e) { alert(String(e)); }
    finally { setBusy(false); }
  }

  if (listing.listing_status === "APPROVED") return (
    <button disabled={busy} onClick={() => handle(() => rejectListing(listing.id, "Re-reviewed"))}
      className="text-[11px] px-2 py-0.5 border border-red-900 text-red-400 hover:bg-red-900/30 disabled:opacity-50">
      Revoke
    </button>
  );

  if (listing.listing_status === "REJECTED") return (
    <button disabled={busy} onClick={() => handle(() => approveListing(listing.id))}
      className="text-[11px] px-2 py-0.5 border border-emerald-800 text-emerald-400 hover:bg-emerald-900/30 disabled:opacity-50">
      Re-approve
    </button>
  );

  // PENDING_REVIEW
  return (
    <div className="flex gap-1">
      <button disabled={busy} onClick={() => handle(() => approveListing(listing.id))}
        className="text-[11px] px-2 py-0.5 border border-emerald-800 text-emerald-400 hover:bg-emerald-900/30 disabled:opacity-50">
        Approve
      </button>
      <button disabled={busy}
        onClick={() => { const r = window.prompt("Rejection reason:"); if (r) handle(() => rejectListing(listing.id, r)); }}
        className="text-[11px] px-2 py-0.5 border border-red-900 text-red-400 hover:bg-red-900/30 disabled:opacity-50">
        Reject
      </button>
    </div>
  );
}
```

- [ ] Commit:
```bash
git add apps/web/app/admin/listings/
git commit -m "feat(admin): listing moderation page with approve/reject"
```

---

## Task 11 — Deployments page

**Files:**
- Create: `apps/web/app/admin/deployments/page.tsx`

- [ ] Create:

```tsx
// apps/web/app/admin/deployments/page.tsx
import { fetchAdminDeployments, type AdminDeployment } from "@/lib/adminApi";

function fmtUSD(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

const stateColor: Record<string, string> = {
  RELEASED:         "text-emerald-400",
  VETOED:           "text-red-400",
  FAILED:           "text-red-500",
  VETO_WINDOW:      "text-amber-400",
  BIOMETRIC_PENDING:"text-sky-400",
  PENDING:          "text-zinc-400",
  VERIFYING:        "text-zinc-300",
};

export default async function AdminDeployments({
  searchParams,
}: { searchParams: Promise<{ state?: string }> }) {
  const sp   = await searchParams;
  const data = await fetchAdminDeployments(sp.state).catch(() => ({ deployments: [] as AdminDeployment[] }));

  const states = ["", "PENDING", "VETO_WINDOW", "BIOMETRIC_PENDING", "RELEASED", "VETOED", "FAILED"];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-base font-semibold text-zinc-50">Deployments ({data.deployments.length})</h1>
        <div className="flex gap-2 text-xs flex-wrap">
          {states.map(s => (
            <a key={s} href={s ? `?state=${s}` : "?"}
              className="px-2 py-1 bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-zinc-50">
              {s || "All"}
            </a>
          ))}
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-[10px] text-zinc-500 uppercase tracking-wider">
              <th className="text-left px-4 py-2">ID</th>
              <th className="text-left px-4 py-2">Escrow</th>
              <th className="text-left px-4 py-2">State</th>
              <th className="text-left px-4 py-2">Created</th>
            </tr>
          </thead>
          <tbody>
            {data.deployments.map(d => (
              <tr key={d.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/40 transition-colors">
                <td className="px-4 py-3 font-mono text-xs text-zinc-400">{d.id.slice(0, 8)}…</td>
                <td className="px-4 py-3 text-zinc-300 font-mono">{fmtUSD(d.escrow_amount_cents)}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-mono ${stateColor[d.state] ?? "text-zinc-400"}`}>{d.state}</span>
                  {d.failure_reason && <p className="text-xs text-zinc-600 mt-0.5">{d.failure_reason}</p>}
                </td>
                <td className="px-4 py-3 text-zinc-500 text-xs">
                  {new Date(d.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.deployments.length === 0 && (
          <p className="text-center text-zinc-500 text-sm py-8">No deployments found.</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] Commit:
```bash
git add apps/web/app/admin/deployments/page.tsx
git commit -m "feat(admin): deployments overview page"
```

---

## Task 12 — Revenue page

**Files:**
- Create: `apps/web/app/admin/revenue/page.tsx`

- [ ] Create:

```tsx
// apps/web/app/admin/revenue/page.tsx
import { fetchRevenueSummary } from "@/lib/adminApi";

function fmtUSD(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

export default async function AdminRevenue() {
  const data = await fetchRevenueSummary().catch(() => null);

  return (
    <div>
      <h1 className="text-base font-semibold text-zinc-50 mb-6">Revenue</h1>

      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: "All-Time Fees (15%)", value: data ? fmtUSD(data.total_fee_cents) : "—" },
          { label: "Last 30 Days", value: data ? fmtUSD(data.last_30d_fee_cents) : "—" },
          { label: "Fee-Generating Deployments", value: String(data?.total_fee_deployments ?? 0) },
        ].map(({ label, value }) => (
          <div key={label} className="bg-zinc-900 border border-zinc-800 rounded-sm p-5">
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-2">{label}</p>
            <p className="text-2xl font-mono text-zinc-50">{value}</p>
          </div>
        ))}
      </div>

      {data && (
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-sm p-5">
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-4">Deployment States</p>
            <div className="space-y-2">
              {data.deployment_states.map(s => (
                <div key={s.state} className="flex justify-between text-sm">
                  <span className="font-mono text-zinc-400">{s.state}</span>
                  <span className="text-zinc-50">{s.count}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-sm p-5">
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-4">Listing Status</p>
            <div className="space-y-2">
              {data.listing_statuses.map(s => (
                <div key={s.status} className="flex justify-between text-sm">
                  <span className="font-mono text-zinc-400">{s.status}</span>
                  <span className="text-zinc-50">{s.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] Commit:
```bash
git add apps/web/app/admin/revenue/page.tsx
git commit -m "feat(admin): revenue summary page"
```

---

## Task 13 — Add `/api/admin/*` proxy routes in Next.js

The frontend server components call `adminApi.ts` which talks directly to Rust services (server-side, no CORS). No extra proxy needed. However, the `UserActionsBar` and `ListingActions` client components call `adminApi.ts` functions — these make fetch calls from the **browser** to backend URLs, which won't work cross-origin.

**Fix**: Add thin `/api/admin/*` Next.js Route Handlers that proxy to the Rust services, authenticated by the session.

**Files:**
- Create: `apps/web/app/api/admin/users/route.ts`
- Create: `apps/web/app/api/admin/users/[id]/suspend/route.ts`
- Create: `apps/web/app/api/admin/users/[id]/unsuspend/route.ts`
- Create: `apps/web/app/api/admin/users/[id]/set-tier/route.ts`
- Create: `apps/web/app/api/admin/listings/route.ts`
- Create: `apps/web/app/api/admin/listings/[id]/approve/route.ts`
- Create: `apps/web/app/api/admin/listings/[id]/reject/route.ts`
- Create: `apps/web/app/api/admin/deployments/route.ts`
- Create: `apps/web/app/api/admin/revenue/route.ts`

**Update `adminApi.ts`** to call `/api/admin/` (relative URLs) instead of the Rust service URLs directly — so client components work too.

- [ ] Create a shared admin auth helper `apps/web/app/api/admin/_auth.ts`:

```typescript
// apps/web/app/api/admin/_auth.ts
import { auth } from "@/auth";
import { NextResponse } from "next/server";

export async function requireAdmin(): Promise<{ ok: true } | NextResponse> {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return { ok: true };
}

export const IDENTITY_URL    = process.env.IDENTITY_SERVICE_URL    ?? "http://localhost:3001";
export const MARKETPLACE_URL = process.env.MARKETPLACE_SERVICE_URL ?? "http://localhost:3002";
```

- [ ] Create each proxy route (example for users list — repeat pattern for all):

```typescript
// apps/web/app/api/admin/users/route.ts
import { type NextRequest, NextResponse } from "next/server";
import { requireAdmin, IDENTITY_URL } from "../_auth";

export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;
  const q = req.nextUrl.search;
  const res = await fetch(`${IDENTITY_URL}/admin/users${q}`, { cache: "no-store" });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
```

- [ ] Update `adminApi.ts` to use `/api/admin/` prefix (relative) instead of direct service URLs.

- [ ] Commit:
```bash
git add apps/web/app/api/admin/ apps/web/lib/adminApi.ts
git commit -m "feat(admin): Next.js proxy routes for admin API with session guard"
```

---

## Task 14 — Seed first admin user

- [ ] After deploying migration 0025, set the platform owner as admin:

```sql
UPDATE unified_profiles SET is_admin = TRUE WHERE email = 'YOUR_EMAIL@domain.com';
```

Run against production DB (Dokploy → Postgres console).

- [ ] Verify by logging in and navigating to `/admin` — should see the dashboard, not be redirected.

---

## Final Verification Checklist

- [ ] `GET /admin` → redirects to `/dashboard` if not admin
- [ ] `GET /admin` → shows overview for admin user
- [ ] Users table loads and filters work
- [ ] Suspend/unsuspend a user works
- [ ] Set tier works
- [ ] Listings moderation: approve/reject changes status
- [ ] Deployments table loads with state filter
- [ ] Revenue page shows fee totals
- [ ] Cargo check: zero warnings on identity_service + marketplace_service

---

## Commit summary (in order)

1. `feat(admin): migration 0025 — is_admin, suspension, listing_status columns`
2. `feat(admin): include is_admin in oauth-callback response`
3. `feat(admin): user management endpoints in identity_service`
4. `feat(admin): listing moderation, deployment overview, revenue endpoints`
5. `feat(admin): forward is_admin into session and JWT`
6. `feat(admin): protect /admin/* routes with isAdmin session check`
7. `feat(admin): centralised adminApi.ts helper`
8. `feat(admin): admin layout + overview dashboard`
9. `feat(admin): users management page with suspend/tier actions`
10. `feat(admin): listing moderation page with approve/reject`
11. `feat(admin): deployments overview page`
12. `feat(admin): revenue summary page`
13. `feat(admin): Next.js proxy routes for admin API with session guard`
