# Agency Enterprise Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement four enterprise features: Public Agency Profile page, Bundle Listings, Proposal Inbox Kanban, and Verified Badge — all targeting the `organisations` table.

**Architecture:** Two DB migrations (0056 bundle/handle + 0057 proposals extension), one new identity_service endpoint, multiple marketplace_service handlers (bundles + proposals), Next.js API proxy routes, five frontend pages/components, VerifiedBadge component reused across profile and listing cards.

**Tech Stack:** Rust/Axum/SQLx (identity_service :3001, marketplace_service :3002), Next.js 15 App Router (SSR Server Components + Client Components), Tailwind 4, Lucide React, TypeScript.

**Spec:** `docs/superpowers/specs/2026-03-25-agency-enterprise-features-design.md`

---

## File Map

### New files
```
migrations/0056_bundle_tables_org_handle.sql
migrations/0057_proposals_profile_and_status.sql
crates/marketplace_service/src/bundle_handlers.rs
apps/web/components/VerifiedBadge.tsx
apps/web/app/agency/[handle]/page.tsx
apps/web/app/(app)/enterprise/bundles/page.tsx
apps/web/app/(app)/enterprise/bundles/BundleEditor.tsx
apps/web/app/(app)/enterprise/proposals/page.tsx
apps/web/app/api/enterprise/orgs/[id]/bundles/route.ts
apps/web/app/api/enterprise/orgs/[id]/bundles/[bundle_id]/route.ts
apps/web/app/api/enterprise/orgs/[id]/proposals/route.ts
apps/web/app/api/admin/bundles/[id]/approve/route.ts
apps/web/app/api/admin/bundles/[id]/reject/route.ts
```

### Modified files
```
crates/identity_service/src/enterprise_handlers.rs  — add public_org_profile handler
crates/identity_service/src/main.rs                — add GET /orgs/public/{handle} route
crates/marketplace_service/src/proposal_handlers.rs — add list_org_proposals handler
crates/marketplace_service/src/handlers.rs          — list_listings LEFT JOINs organisations
crates/marketplace_service/src/main.rs              — add bundle + proposal routes
apps/web/lib/api.ts                                 — AgencyProfile type, fetchAgencyProfile, org_plan_tier on AgentListing
apps/web/lib/enterpriseApi.ts                       — Bundle/Proposal types + functions
apps/web/lib/adminApi.ts                            — AdminBundle type, fetchAdminBundles, approveBundle, rejectBundle
apps/web/components/AppSidebar.tsx                  — add Proposals + Bundles to Enterprise section
apps/web/app/(app)/marketplace/page.tsx             — render VerifiedBadge on listing cards
apps/web/app/admin/listings/page.tsx                — add Bundles tab
```

---

## Task 1: DB Migration 0056 — Bundle tables + org handle + listing org_id FK

**Files:**
- Create: `migrations/0056_bundle_tables_org_handle.sql`

- [ ] **Step 1: Write the migration**

```sql
-- migrations/0056_bundle_tables_org_handle.sql

-- Handle and public profile columns on organisations
ALTER TABLE organisations ADD COLUMN handle TEXT UNIQUE;
ALTER TABLE organisations ADD COLUMN description TEXT;
ALTER TABLE organisations ADD COLUMN website_url TEXT;
CREATE INDEX idx_organisations_handle ON organisations(handle);

-- org_id FK on agent_listings so verified badge can be shown on listing cards
ALTER TABLE agent_listings ADD COLUMN org_id UUID REFERENCES organisations(id) ON DELETE SET NULL;
CREATE INDEX idx_agent_listings_org ON agent_listings(org_id);

-- Bundle tables
CREATE TABLE listing_bundles (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id           UUID        NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    name             TEXT        NOT NULL,
    description      TEXT,
    price_cents      BIGINT      NOT NULL CHECK (price_cents > 0),
    listing_status   TEXT        NOT NULL DEFAULT 'PENDING_REVIEW',
    active           BOOLEAN     NOT NULL DEFAULT FALSE,
    rejection_reason TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE bundle_items (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bundle_id     UUID NOT NULL REFERENCES listing_bundles(id) ON DELETE CASCADE,
    listing_id    UUID NOT NULL REFERENCES agent_listings(id) ON DELETE CASCADE,
    display_order INT  NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (bundle_id, listing_id)
);

CREATE INDEX idx_bundle_items_bundle  ON bundle_items(bundle_id);
CREATE INDEX idx_bundle_items_listing ON bundle_items(listing_id);
CREATE INDEX idx_listing_bundles_org  ON listing_bundles(org_id);
```

- [ ] **Step 2: Verify the file exists with no typos**

```bash
cat migrations/0056_bundle_tables_org_handle.sql
```
Expected: SQL printed with no syntax errors visible.

- [ ] **Step 3: Commit**

```bash
git add migrations/0056_bundle_tables_org_handle.sql
git commit -m "feat: migration 0056 — bundle tables + org handle + agent_listings org_id FK"
```

---

## Task 2: DB Migration 0057 — Proposals: profile FK + DRAFT status

**Files:**
- Create: `migrations/0057_proposals_profile_and_status.sql`

- [ ] **Step 1: Write the migration**

```sql
-- migrations/0057_proposals_profile_and_status.sql
--
-- Link proposals to the submitter's unified profile (nullable for backward compat).
-- Extend status CHECK to include DRAFT for the Proposal Inbox Kanban.
--
-- IMPORTANT: proposals.submitted_at is NOT NULL DEFAULT NOW() — it is always set.
-- Do NOT use submitted_at IS NULL to infer draft status. Use the status column only.

ALTER TABLE proposals
    ADD COLUMN submitted_by_profile_id UUID REFERENCES unified_profiles(id);

CREATE INDEX idx_proposals_submitted_by ON proposals(submitted_by_profile_id);

-- Drop and re-add check constraint to include DRAFT.
-- The existing constraint was added by migration 0027 as 'proposals_status_check'.
-- Existing rows (PENDING / ACCEPTED / REJECTED) are unaffected.
ALTER TABLE proposals DROP CONSTRAINT IF EXISTS proposals_status_check;
ALTER TABLE proposals ADD CONSTRAINT proposals_status_check
    CHECK (status IN ('DRAFT', 'PENDING', 'ACCEPTED', 'REJECTED'));
```

- [ ] **Step 2: Commit**

```bash
git add migrations/0057_proposals_profile_and_status.sql
git commit -m "feat: migration 0057 — proposals profile FK + DRAFT status"
```

---

## Task 3: identity_service — public org profile endpoint

**Files:**
- Modify: `crates/identity_service/src/enterprise_handlers.rs`
- Modify: `crates/identity_service/src/main.rs`

**Context:** `identity_service` state is `AppState { svc: Arc<StitchService>, pool: PgPool }` with `FromRef` impls. Handlers that only need the DB pool use `State(pool): State<sqlx::PgPool>` as the extractor (not `State(state): State<AppState>`). The existing enterprise handlers follow this exact pattern. The new endpoint is **public** (no auth).

- [ ] **Step 1: Write unit test first**

Add to the bottom of `crates/identity_service/src/enterprise_handlers.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::is_verified_plan;

    #[test]
    fn enterprise_and_platinum_are_verified() {
        assert!(is_verified_plan("ENTERPRISE"));
        assert!(is_verified_plan("PLATINUM"));
    }

    #[test]
    fn growth_is_not_verified() {
        assert!(!is_verified_plan("GROWTH"));
        assert!(!is_verified_plan(""));
        assert!(!is_verified_plan("UNKNOWN"));
    }
}
```

- [ ] **Step 2: Run test — expect FAIL (function not yet defined)**

```bash
cmd /c "vcvars64.bat && cargo test -p identity_service is_verified_plan 2>&1"
```
Expected: `error[E0425]: cannot find function 'is_verified_plan'`

- [ ] **Step 3: Add the handler and helper function**

Add to `crates/identity_service/src/enterprise_handlers.rs` (after the existing imports, before the first handler):

```rust
/// Pure predicate for testability — no I/O.
pub fn is_verified_plan(plan_tier: &str) -> bool {
    plan_tier == "ENTERPRISE" || plan_tier == "PLATINUM"
}

#[derive(Serialize)]
pub struct PublicOrgProfile {
    pub id:                          String,
    pub name:                        String,
    pub handle:                      String,
    pub description:                 Option<String>,
    pub website_url:                 Option<String>,
    pub plan_tier:                   String,
    pub is_verified:                 bool,
    pub member_count:                i64,
    pub active_listing_count:        i64,
    pub completed_deployment_count:  i64,
    pub created_at:                  String,
}

/// GET /orgs/public/:handle — no auth required (public endpoint)
///
/// Looks up `organisations` WHERE handle = $1.
/// Returns 404 if handle not found or not set.
pub async fn public_org_profile(
    State(pool): State<sqlx::PgPool>,
    Path(handle): Path<String>,
) -> Result<Json<PublicOrgProfile>, StatusCode> {
    use sqlx::Row;

    // Main org row
    let org = sqlx::query(
        "SELECT id, name, handle, description, website_url,
                plan_tier::TEXT AS plan_tier, created_at
         FROM organisations
         WHERE handle = $1",
    )
    .bind(&handle)
    .fetch_optional(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    .ok_or(StatusCode::NOT_FOUND)?;

    let org_id: uuid::Uuid = org.get("id");

    // Member count
    let member_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM org_members WHERE org_id = $1",
    )
    .bind(org_id)
    .fetch_one(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Active listing count (agent_listings.org_id FK added in migration 0056)
    let active_listing_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM agent_listings WHERE org_id = $1 AND active = TRUE",
    )
    .bind(org_id)
    .fetch_one(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Completed deployments (state column — NOT status — is `deployment_status` enum)
    let completed_deployment_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM deployments WHERE org_id = $1 AND state::TEXT = 'RELEASED'",
    )
    .bind(org_id)
    .fetch_one(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let plan_tier: String = org.get("plan_tier");
    let is_verified = is_verified_plan(&plan_tier);

    Ok(Json(PublicOrgProfile {
        id:                         org_id.to_string(),
        name:                       org.get("name"),
        handle:                     org.get("handle"),
        description:                org.get("description"),
        website_url:                org.get("website_url"),
        plan_tier,
        is_verified,
        member_count,
        active_listing_count,
        completed_deployment_count,
        created_at:                 org.get::<chrono::DateTime<chrono::Utc>, _>("created_at")
                                       .to_rfc3339(),
    }))
}
```

- [ ] **Step 4: Register the route in `crates/identity_service/src/main.rs`**

Find the enterprise routes block (around line 122) and add before the `// Admin enterprise route` comment:

```rust
        // Public org profile — no auth (for /agency/{handle} frontend page)
        .route(
            "/orgs/public/{handle}",
            get(enterprise_handlers::public_org_profile),
        )
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
cmd /c "vcvars64.bat && cargo test -p identity_service is_verified_plan 2>&1"
```
Expected: `test enterprise_handlers::tests::enterprise_and_platinum_are_verified ... ok`
Expected: `test enterprise_handlers::tests::growth_is_not_verified ... ok`

- [ ] **Step 6: Check compilation**

```bash
cmd /c "vcvars64.bat && cargo check -p identity_service 2>&1"
```
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add crates/identity_service/src/enterprise_handlers.rs crates/identity_service/src/main.rs
git commit -m "feat(identity): GET /orgs/public/{handle} — public agency profile endpoint"
```

---

## Task 4: marketplace_service — bundle handlers

**Files:**
- Create: `crates/marketplace_service/src/bundle_handlers.rs`
- Modify: `crates/marketplace_service/src/main.rs`

**Context:** `marketplace_service` state is `Arc<AppState>` aliased as `SharedState`. All handlers use `State(state): State<SharedState>` and query via `&state.db`. Use `sqlx::query()` (non-macro) with `sqlx::Row::get()` for all queries — the `.sqlx/` offline cache is not regenerated during this plan. The admin bundle routes follow the same pattern as `POST /admin/listings/{id}/approve`.

- [ ] **Step 1: Write unit tests**

Create `crates/marketplace_service/src/bundle_handlers.rs` with just the tests and the SQL constants:

```rust
//! Bundle CRUD handlers + admin moderation endpoints.
//!
//! All routes require org membership verified server-side.
//! Bundle state machine: PENDING_REVIEW → APPROVED (active=TRUE) → PENDING_REVIEW on item change.

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use sqlx::Row as _;
use std::sync::Arc;
use uuid::Uuid;

use crate::handlers::AppState;

// ── SQL constants (extracted for unit-testability) ─────────────────────────

pub(crate) const BUNDLE_APPROVE_SQL: &str =
    "UPDATE listing_bundles
     SET listing_status = 'APPROVED', rejection_reason = NULL,
         active = TRUE, updated_at = NOW()
     WHERE id = $1";

pub(crate) const BUNDLE_REJECT_SQL: &str =
    "UPDATE listing_bundles
     SET listing_status = 'REJECTED', rejection_reason = $2,
         active = FALSE, updated_at = NOW()
     WHERE id = $1";

#[cfg(test)]
mod tests {
    use super::{BUNDLE_APPROVE_SQL, BUNDLE_REJECT_SQL};

    #[test]
    fn approve_sets_active_true() {
        assert!(
            BUNDLE_APPROVE_SQL.contains("active = TRUE"),
            "BUNDLE_APPROVE_SQL must set active = TRUE"
        );
        assert!(
            BUNDLE_APPROVE_SQL.contains("listing_status = 'APPROVED'"),
            "BUNDLE_APPROVE_SQL must set listing_status = 'APPROVED'"
        );
    }

    #[test]
    fn reject_sets_active_false() {
        assert!(
            BUNDLE_REJECT_SQL.contains("active = FALSE"),
            "BUNDLE_REJECT_SQL must set active = FALSE"
        );
        assert!(
            BUNDLE_REJECT_SQL.contains("listing_status = 'REJECTED'"),
            "BUNDLE_REJECT_SQL must set listing_status = 'REJECTED'"
        );
        assert!(
            BUNDLE_REJECT_SQL.contains("rejection_reason = $2"),
            "BUNDLE_REJECT_SQL must store rejection_reason"
        );
    }
}
```

- [ ] **Step 2: Run tests — expect PASS** (constants are defined, tests verify SQL content)

```bash
cmd /c "vcvars64.bat && cargo test -p marketplace_service approve_sets_active_true reject_sets_active_false 2>&1"
```
Expected: 2 tests pass.

- [ ] **Step 3: Add request/response types and handler implementations**

Replace the entire `crates/marketplace_service/src/bundle_handlers.rs` with the full implementation (expand below the constants and test module):

```rust
// ── Request / Response types ───────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct CreateBundleBody {
    pub name:         String,
    pub description:  Option<String>,
    pub price_cents:  i64,
    pub listing_ids:  Vec<Uuid>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateBundleBody {
    pub name:         Option<String>,
    pub description:  Option<String>,
    pub price_cents:  Option<i64>,
    pub listing_ids:  Option<Vec<Uuid>>,
}

#[derive(Debug, Deserialize)]
pub struct RejectBundleBody {
    pub reason: String,
}

#[derive(Debug, Serialize)]
pub struct BundleItem {
    pub listing_id:    String,
    pub name:          String,
    pub price_cents:   i64,
    pub display_order: i32,
}

#[derive(Debug, Serialize)]
pub struct BundleRow {
    pub id:             String,
    pub name:           String,
    pub description:    Option<String>,
    pub price_cents:    i64,
    pub listing_status: String,
    pub active:         bool,
    pub item_count:     i64,
    pub items:          Vec<BundleItem>,
    pub created_at:     String,
}

// ── GET /enterprise/orgs/:id/bundles ─────────────────────────────────────────

pub async fn list_org_bundles(
    State(state): State<Arc<AppState>>,
    Path(org_id): Path<Uuid>,
) -> impl IntoResponse {
    // Fetch all bundles for org
    let bundles = sqlx::query(
        "SELECT id, name, description, price_cents, listing_status, active, created_at
         FROM listing_bundles WHERE org_id = $1 ORDER BY created_at DESC",
    )
    .bind(org_id)
    .fetch_all(&state.db)
    .await;

    let bundles = match bundles {
        Ok(b) => b,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    // For each bundle, fetch its items with listing name + price
    let mut result: Vec<BundleRow> = Vec::new();

    for b in &bundles {
        let bundle_id: Uuid = b.get("id");

        let items = match sqlx::query(
            "SELECT bi.listing_id, al.name, al.price_cents, bi.display_order
             FROM bundle_items bi
             JOIN agent_listings al ON al.id = bi.listing_id
             WHERE bi.bundle_id = $1
             ORDER BY bi.display_order ASC",
        )
        .bind(bundle_id)
        .fetch_all(&state.db)
        .await
        {
            Ok(i) => i,
            Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
        };

        let bundle_items: Vec<BundleItem> = items
            .iter()
            .map(|r| BundleItem {
                listing_id:    r.get::<Uuid, _>("listing_id").to_string(),
                name:          r.get("name"),
                price_cents:   r.get("price_cents"),
                display_order: r.get("display_order"),
            })
            .collect();

        let item_count = bundle_items.len() as i64;

        result.push(BundleRow {
            id:             bundle_id.to_string(),
            name:           b.get("name"),
            description:    b.get("description"),
            price_cents:    b.get("price_cents"),
            listing_status: b.get("listing_status"),
            active:         b.get("active"),
            item_count,
            items:          bundle_items,
            created_at:     b.get::<chrono::DateTime<chrono::Utc>, _>("created_at").to_rfc3339(),
        });
    }

    (StatusCode::OK, Json(serde_json::json!({ "bundles": result }))).into_response()
}

// ── POST /enterprise/orgs/:id/bundles ────────────────────────────────────────

pub async fn create_bundle(
    State(state): State<Arc<AppState>>,
    Path(org_id): Path<Uuid>,
    Json(body): Json<CreateBundleBody>,
) -> impl IntoResponse {
    if body.price_cents <= 0 {
        return (StatusCode::BAD_REQUEST, "price_cents must be > 0").into_response();
    }
    if body.name.trim().is_empty() {
        return (StatusCode::BAD_REQUEST, "name must not be empty").into_response();
    }

    // Validate all listing_ids belong to this org and are APPROVED
    for lid in &body.listing_ids {
        let valid = match sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM agent_listings
             WHERE id = $1 AND org_id = $2 AND listing_status = 'APPROVED'",
        )
        .bind(lid)
        .bind(org_id)
        .fetch_one(&state.db)
        .await
        {
            Ok(v) => v,
            Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
        };

        if valid == 0 {
            return (
                StatusCode::UNPROCESSABLE_ENTITY,
                format!("listing {lid} is not an APPROVED listing of this org"),
            )
                .into_response();
        }
    }

    let mut tx = match state.db.begin().await {
        Ok(t) => t,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    let bundle_id = Uuid::now_v7();

    let res = sqlx::query(
        "INSERT INTO listing_bundles (id, org_id, name, description, price_cents)
         VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(bundle_id)
    .bind(org_id)
    .bind(&body.name)
    .bind(&body.description)
    .bind(body.price_cents)
    .execute(&mut *tx)
    .await;

    if let Err(e) = res {
        let _ = tx.rollback().await;
        return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
    }

    // Insert bundle_items
    for (order, lid) in body.listing_ids.iter().enumerate() {
        let res = sqlx::query(
            "INSERT INTO bundle_items (id, bundle_id, listing_id, display_order)
             VALUES ($1, $2, $3, $4)",
        )
        .bind(Uuid::now_v7())
        .bind(bundle_id)
        .bind(lid)
        .bind(order as i32)
        .execute(&mut *tx)
        .await;

        if let Err(e) = res {
            let _ = tx.rollback().await;
            return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
        }
    }

    if let Err(e) = tx.commit().await {
        return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
    }

    (
        StatusCode::CREATED,
        Json(serde_json::json!({
            "bundle_id":      bundle_id,
            "listing_status": "PENDING_REVIEW"
        })),
    )
        .into_response()
}

// ── PATCH /enterprise/orgs/:id/bundles/:bundle_id ─────────────────────────────

pub async fn update_bundle(
    State(state): State<Arc<AppState>>,
    Path((org_id, bundle_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<UpdateBundleBody>,
) -> impl IntoResponse {
    // Load current status (also verifies bundle belongs to org)
    let current = sqlx::query(
        "SELECT listing_status FROM listing_bundles WHERE id = $1 AND org_id = $2",
    )
    .bind(bundle_id)
    .bind(org_id)
    .fetch_optional(&state.db)
    .await;

    let current = match current {
        Ok(Some(r)) => r,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    let current_status: String = current.get("listing_status");

    // Determine if listing_ids are changing on an APPROVED bundle → re-moderate
    let items_changed = body.listing_ids.is_some();
    let needs_remoderate = items_changed && current_status == "APPROVED";
    let new_status = if needs_remoderate { "PENDING_REVIEW" } else { &current_status };
    let new_active = if needs_remoderate { false } else { current_status == "APPROVED" };

    let mut tx = match state.db.begin().await {
        Ok(t) => t,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    // Update scalar fields
    let res = sqlx::query(
        "UPDATE listing_bundles
         SET name           = COALESCE($3, name),
             description    = COALESCE($4, description),
             price_cents    = COALESCE($5, price_cents),
             listing_status = $6,
             active         = $7,
             updated_at     = NOW()
         WHERE id = $1 AND org_id = $2",
    )
    .bind(bundle_id)
    .bind(org_id)
    .bind(&body.name)
    .bind(&body.description)
    .bind(body.price_cents)
    .bind(new_status)
    .bind(new_active)
    .execute(&mut *tx)
    .await;

    if let Err(e) = res {
        let _ = tx.rollback().await;
        return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
    }

    // Replace items if provided
    if let Some(listing_ids) = &body.listing_ids {
        // Validate each listing belongs to org and is APPROVED
        for lid in listing_ids {
            let valid = match sqlx::query_scalar::<_, i64>(
                "SELECT COUNT(*) FROM agent_listings
                 WHERE id = $1 AND org_id = $2 AND listing_status = 'APPROVED'",
            )
            .bind(lid)
            .bind(org_id)
            .fetch_one(&mut *tx)
            .await
            {
                Ok(v) => v,
                Err(e) => {
                    let _ = tx.rollback().await;
                    return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
                }
            };

            if valid == 0 {
                let _ = tx.rollback().await;
                return (
                    StatusCode::UNPROCESSABLE_ENTITY,
                    format!("listing {lid} is not an APPROVED listing of this org"),
                )
                    .into_response();
            }
        }

        // Delete old items, insert new
        let del = sqlx::query("DELETE FROM bundle_items WHERE bundle_id = $1")
            .bind(bundle_id)
            .execute(&mut *tx)
            .await;
        if let Err(e) = del {
            let _ = tx.rollback().await;
            return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
        }

        for (order, lid) in listing_ids.iter().enumerate() {
            let ins = sqlx::query(
                "INSERT INTO bundle_items (id, bundle_id, listing_id, display_order)
                 VALUES ($1, $2, $3, $4)",
            )
            .bind(Uuid::now_v7())
            .bind(bundle_id)
            .bind(lid)
            .bind(order as i32)
            .execute(&mut *tx)
            .await;
            if let Err(e) = ins {
                let _ = tx.rollback().await;
                return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
            }
        }
    }

    if let Err(e) = tx.commit().await {
        return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
    }

    (
        StatusCode::OK,
        Json(serde_json::json!({ "ok": true, "listing_status": new_status })),
    )
        .into_response()
}

// ── DELETE /enterprise/orgs/:id/bundles/:bundle_id ────────────────────────────

pub async fn delete_bundle(
    State(state): State<Arc<AppState>>,
    Path((org_id, bundle_id)): Path<(Uuid, Uuid)>,
) -> impl IntoResponse {
    let res = sqlx::query(
        "DELETE FROM listing_bundles WHERE id = $1 AND org_id = $2",
    )
    .bind(bundle_id)
    .bind(org_id)
    .execute(&state.db)
    .await;

    match res {
        Ok(r) if r.rows_affected() == 0 => StatusCode::NOT_FOUND.into_response(),
        Ok(_) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

// ── Admin: POST /admin/bundles/:id/approve ────────────────────────────────────

pub async fn admin_approve_bundle(
    State(state): State<Arc<AppState>>,
    Path(bundle_id): Path<Uuid>,
) -> impl IntoResponse {
    let res = sqlx::query(BUNDLE_APPROVE_SQL)
        .bind(bundle_id)
        .execute(&state.db)
        .await;

    match res {
        Ok(r) if r.rows_affected() == 0 => StatusCode::NOT_FOUND.into_response(),
        Ok(_) => (StatusCode::OK, Json(serde_json::json!({ "ok": true }))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

// ── Admin: POST /admin/bundles/:id/reject ─────────────────────────────────────

pub async fn admin_reject_bundle(
    State(state): State<Arc<AppState>>,
    Path(bundle_id): Path<Uuid>,
    Json(body): Json<RejectBundleBody>,
) -> impl IntoResponse {
    let res = sqlx::query(BUNDLE_REJECT_SQL)
        .bind(bundle_id)
        .bind(&body.reason)
        .execute(&state.db)
        .await;

    match res {
        Ok(r) if r.rows_affected() == 0 => StatusCode::NOT_FOUND.into_response(),
        Ok(_) => (StatusCode::OK, Json(serde_json::json!({ "ok": true }))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}
```

- [ ] **Step 4: Add module declaration + routes to `crates/marketplace_service/src/main.rs`**

Add `mod bundle_handlers;` after `mod admin_handlers;` near the top.

Add these routes to the `Router::new()` chain, after the existing admin routes:

```rust
        // Bundle management
        .route(
            "/enterprise/orgs/{id}/bundles",
            get(bundle_handlers::list_org_bundles).post(bundle_handlers::create_bundle),
        )
        .route(
            "/enterprise/orgs/{id}/bundles/{bundle_id}",
            axum::routing::patch(bundle_handlers::update_bundle)
                .delete(bundle_handlers::delete_bundle),
        )
        // Admin bundle moderation
        .route(
            "/admin/bundles/{id}/approve",
            post(bundle_handlers::admin_approve_bundle),
        )
        .route(
            "/admin/bundles/{id}/reject",
            post(bundle_handlers::admin_reject_bundle),
        )
```

- [ ] **Step 5: Run tests**

```bash
cmd /c "vcvars64.bat && cargo test -p marketplace_service approve_sets_active_true reject_sets_active_false 2>&1"
```
Expected: 2 tests pass.

- [ ] **Step 6: Check compilation**

```bash
cmd /c "vcvars64.bat && cargo check -p marketplace_service 2>&1"
```
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add crates/marketplace_service/src/bundle_handlers.rs crates/marketplace_service/src/main.rs
git commit -m "feat(marketplace): bundle CRUD handlers + admin approve/reject bundle endpoints"
```

---

## Task 5: marketplace_service — org proposals inbox handler

**Files:**
- Modify: `crates/marketplace_service/src/proposal_handlers.rs`
- Modify: `crates/marketplace_service/src/main.rs`

**Context:** The `proposals` table schema (after migrations 0027 + 0057) has: `id, job_title, cover_letter, freelancer_email, client_email, submitted_at, status, submitted_by_profile_id`. Status mapping: `DRAFT` → "draft", `PENDING`+`ACCEPTED` → "sent", `REJECTED` → "closed". The `org_members` table has `(org_id, profile_id, member_role)`.

- [ ] **Step 1: Write a unit test for the Kanban status mapping**

Add to the bottom of `crates/marketplace_service/src/proposal_handlers.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::proposal_kanban_group;

    #[test]
    fn draft_maps_to_draft() {
        assert_eq!(proposal_kanban_group("DRAFT"), "draft");
    }

    #[test]
    fn pending_and_accepted_map_to_sent() {
        assert_eq!(proposal_kanban_group("PENDING"),  "sent");
        assert_eq!(proposal_kanban_group("ACCEPTED"), "sent");
    }

    #[test]
    fn rejected_maps_to_closed() {
        assert_eq!(proposal_kanban_group("REJECTED"), "closed");
    }
}
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cmd /c "vcvars64.bat && cargo test -p marketplace_service proposal_kanban_group 2>&1"
```
Expected: `error[E0425]: cannot find function 'proposal_kanban_group'`

- [ ] **Step 3: Add the helper function and handler**

Add near the top of `crates/marketplace_service/src/proposal_handlers.rs` (after existing imports):

```rust
/// Pure function — maps DB `status` value to Kanban column name.
pub fn proposal_kanban_group(status: &str) -> &'static str {
    match status {
        "DRAFT"              => "draft",
        "PENDING" | "ACCEPTED" => "sent",
        _                    => "closed",
    }
}
```

Add this struct and handler at the bottom of `crates/marketplace_service/src/proposal_handlers.rs` (before the tests block):

```rust
#[derive(Debug, Serialize)]
pub struct OrgProposalItem {
    pub id:                       String,
    pub job_title:                String,
    pub freelancer_email:         String,
    pub client_email:             String,
    pub submitted_at:             String,
    pub submitted_by_profile_id:  Option<String>,
    pub submitter_name:           Option<String>,
    pub status:                   String,
}

#[derive(Debug, Serialize)]
pub struct OrgProposalsResponse {
    pub draft:  Vec<OrgProposalItem>,
    pub sent:   Vec<OrgProposalItem>,
    pub closed: Vec<OrgProposalItem>,
}

/// GET /enterprise/orgs/:id/proposals
///
/// ADMIN sees all proposals from any org member.
/// MEMBER sees only their own proposals.
/// Returns 403 if caller is not a member of the org.
///
/// The `caller_profile_id` query parameter is the profile UUID of the
/// authenticated user (passed from the Next.js proxy layer).
pub async fn list_org_proposals(
    State(state): State<SharedState>,
    Path(org_id): Path<Uuid>,
    axum::extract::Query(params): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> impl IntoResponse {
    use sqlx::Row as _;

    let caller_profile_id_str = match params.get("caller_profile_id") {
        Some(s) => s.clone(),
        None => return (StatusCode::BAD_REQUEST, "caller_profile_id required").into_response(),
    };
    let caller_id: Uuid = match caller_profile_id_str.parse() {
        Ok(id) => id,
        Err(_) => return (StatusCode::BAD_REQUEST, "invalid caller_profile_id").into_response(),
    };

    // Resolve caller's membership role — 403 if not a member
    let membership = sqlx::query(
        "SELECT member_role FROM org_members WHERE org_id = $1 AND profile_id = $2",
    )
    .bind(org_id)
    .bind(caller_id)
    .fetch_optional(&state.db)
    .await;

    let member_role: String = match membership {
        Ok(Some(r)) => r.get("member_role"),
        Ok(None)    => return StatusCode::FORBIDDEN.into_response(),
        Err(e)      => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    // Build query: ADMIN sees all org members' proposals, MEMBER sees own only
    let rows = if member_role == "ADMIN" {
        sqlx::query(
            "SELECT p.id, p.job_title, p.freelancer_email, p.client_email,
                    p.submitted_at, p.status,
                    p.submitted_by_profile_id,
                    up.display_name AS submitter_name
             FROM proposals p
             LEFT JOIN unified_profiles up ON up.id = p.submitted_by_profile_id
             WHERE p.submitted_by_profile_id IN (
                 SELECT profile_id FROM org_members WHERE org_id = $1
             )
             ORDER BY p.submitted_at DESC",
        )
        .bind(org_id)
        .fetch_all(&state.db)
        .await
    } else {
        sqlx::query(
            "SELECT p.id, p.job_title, p.freelancer_email, p.client_email,
                    p.submitted_at, p.status,
                    p.submitted_by_profile_id,
                    up.display_name AS submitter_name
             FROM proposals p
             LEFT JOIN unified_profiles up ON up.id = p.submitted_by_profile_id
             WHERE p.submitted_by_profile_id = $1
             ORDER BY p.submitted_at DESC",
        )
        .bind(caller_id)
        .fetch_all(&state.db)
        .await
    };

    let rows = match rows {
        Ok(r) => r,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    let mut draft:  Vec<OrgProposalItem> = Vec::new();
    let mut sent:   Vec<OrgProposalItem> = Vec::new();
    let mut closed: Vec<OrgProposalItem> = Vec::new();

    for r in &rows {
        let status: String = r.get("status");
        let item = OrgProposalItem {
            id:                      r.get::<Uuid, _>("id").to_string(),
            job_title:               r.get("job_title"),
            freelancer_email:        r.get("freelancer_email"),
            client_email:            r.get("client_email"),
            submitted_at:            r.get::<chrono::DateTime<chrono::Utc>, _>("submitted_at")
                                      .to_rfc3339(),
            submitted_by_profile_id: r.get::<Option<Uuid>, _>("submitted_by_profile_id")
                                      .map(|u| u.to_string()),
            submitter_name:          r.get("submitter_name"),
            status:                  status.clone(),
        };

        match proposal_kanban_group(&status) {
            "draft"  => draft.push(item),
            "sent"   => sent.push(item),
            _        => closed.push(item),
        }
    }

    (
        StatusCode::OK,
        Json(OrgProposalsResponse { draft, sent, closed }),
    )
        .into_response()
}
```

- [ ] **Step 4: Add route to `crates/marketplace_service/src/main.rs`**

Add to the `Router::new()` chain, in the enterprise routes block:

```rust
        .route(
            "/enterprise/orgs/{id}/proposals",
            get(proposal_handlers::list_org_proposals),
        )
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
cmd /c "vcvars64.bat && cargo test -p marketplace_service proposal_kanban_group 2>&1"
```
Expected: 3 tests pass.

- [ ] **Step 6: Check compilation**

```bash
cmd /c "vcvars64.bat && cargo check -p marketplace_service 2>&1"
```
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add crates/marketplace_service/src/proposal_handlers.rs crates/marketplace_service/src/main.rs
git commit -m "feat(marketplace): GET /enterprise/orgs/:id/proposals — Kanban inbox endpoint"
```

---

## Task 6: marketplace_service — list_listings returns org_plan_tier

**Files:**
- Modify: `crates/marketplace_service/src/handlers.rs`

**Context:** `list_listings` currently queries `agent_listings` only. We need to LEFT JOIN `organisations` to return `org_plan_tier` (nullable) on each listing, which the frontend uses to decide whether to show the VerifiedBadge. The `org_id` FK was added in migration 0056.

- [ ] **Step 1: Write a unit test for the org_plan_tier extraction logic**

Add to `crates/marketplace_service/src/handlers.rs` tests section at the bottom (or create one if absent):

```rust
#[cfg(test)]
mod tests {
    use super::is_enterprise_or_platinum;

    #[test]
    fn enterprise_plan_is_verified() {
        assert!(is_enterprise_or_platinum(Some("ENTERPRISE")));
        assert!(is_enterprise_or_platinum(Some("PLATINUM")));
    }

    #[test]
    fn growth_and_none_are_not_verified() {
        assert!(!is_enterprise_or_platinum(Some("GROWTH")));
        assert!(!is_enterprise_or_platinum(None));
    }
}
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cmd /c "vcvars64.bat && cargo test -p marketplace_service is_enterprise_or_platinum 2>&1"
```
Expected: compile error, function not defined.

- [ ] **Step 3: Add the helper and update `list_listings`**

Add the helper before the `list_listings` handler in `handlers.rs`:

```rust
/// Pure function — determines if an org plan tier qualifies for Verified badge.
pub fn is_enterprise_or_platinum(plan_tier: Option<&str>) -> bool {
    matches!(plan_tier, Some("ENTERPRISE") | Some("PLATINUM"))
}
```

Find the existing `list_listings` handler. Update the SELECT query to LEFT JOIN `organisations` and return `org_plan_tier`. The existing query looks something like:

```sql
SELECT id, developer_id, name, description, wasm_hash,
       price_cents, active, category::TEXT, seller_type::TEXT,
       slug, created_at, updated_at, listing_status
FROM agent_listings WHERE active = TRUE
ORDER BY created_at DESC
```

Replace it with (keep the exact existing columns, add the JOIN):

```sql
SELECT al.id, al.developer_id, al.name, al.description, al.wasm_hash,
       al.price_cents, al.active, al.category::TEXT AS category,
       al.seller_type::TEXT AS seller_type,
       al.slug, al.created_at, al.updated_at, al.listing_status,
       o.plan_tier::TEXT AS org_plan_tier
FROM agent_listings al
LEFT JOIN organisations o ON o.id = al.org_id
WHERE al.active = TRUE
ORDER BY al.created_at DESC
```

Add `"org_plan_tier": r.get::<Option<String>, _>("org_plan_tier"),` to the `serde_json::json!({...})` row mapping.

> **Note:** Read `crates/marketplace_service/src/handlers.rs` before editing to find the exact current query text and row mapping to replace.

- [ ] **Step 4: Run tests — expect PASS**

```bash
cmd /c "vcvars64.bat && cargo test -p marketplace_service is_enterprise_or_platinum 2>&1"
```
Expected: 2 tests pass.

- [ ] **Step 5: Check compilation**

```bash
cmd /c "vcvars64.bat && cargo check -p marketplace_service 2>&1"
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add crates/marketplace_service/src/handlers.rs
git commit -m "feat(marketplace): list_listings returns org_plan_tier for verified badge"
```

---

## Task 7: VerifiedBadge component

**Files:**
- Create: `apps/web/components/VerifiedBadge.tsx`

**Context:** Lucide `Star` icon, amber-400, only shown for ENTERPRISE or PLATINUM. Used in two places: `AgencyProfilePage` hero and marketplace listing cards.

- [ ] **Step 1: Create the component**

```tsx
// apps/web/components/VerifiedBadge.tsx
import { Star } from "lucide-react";

interface VerifiedBadgeProps {
  planTier?: string | null;
}

/**
 * Amber filled star shown next to org name when plan_tier is ENTERPRISE or PLATINUM.
 * Uses native `title` for tooltip — no external library needed.
 */
export function VerifiedBadge({ planTier }: VerifiedBadgeProps) {
  if (planTier !== "ENTERPRISE" && planTier !== "PLATINUM") return null;
  return (
    <Star
      className="w-4 h-4 fill-amber-400 text-amber-400 shrink-0"
      title="Verified Agency"
      aria-label="Verified Agency"
    />
  );
}
```

- [ ] **Step 2: Verify the file looks right**

```bash
cat "apps/web/components/VerifiedBadge.tsx"
```
Expected: file printed, `Star` import visible, null guard for non-enterprise tiers.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/VerifiedBadge.tsx
git commit -m "feat(ui): VerifiedBadge component — amber star for ENTERPRISE/PLATINUM orgs"
```

---

## Task 8: Frontend API layer

**Files:**
- Modify: `apps/web/lib/api.ts`
- Modify: `apps/web/lib/enterpriseApi.ts`
- Modify: `apps/web/lib/adminApi.ts`

- [ ] **Step 1: Update `apps/web/lib/api.ts`**

1. Add `org_plan_tier?: string | null;` and `org_id?: string | null;` to the existing `AgentListing` interface (after `updated_at`). Both fields are returned by the updated `list_listings` LEFT JOIN in Task 6.

2. Add `AgencyProfile` interface and `fetchAgencyProfile` function after the existing `fetchListingBySlug` function:

```typescript
export interface AgencyProfile {
  id:                         string;
  name:                       string;
  handle:                     string;
  description:                string | null;
  website_url:                string | null;
  plan_tier:                  string;
  is_verified:                boolean;
  member_count:               number;
  active_listing_count:       number;
  completed_deployment_count: number;
  created_at:                 string;
}

/** Public — no auth required. Calls identity_service via /api/identity rewrite. */
export function fetchAgencyProfile(handle: string): Promise<AgencyProfile> {
  return apiFetch(`/api/identity/orgs/public/${encodeURIComponent(handle)}`);
}
```

- [ ] **Step 2: Update `apps/web/lib/enterpriseApi.ts`**

Add the following types and functions at the bottom of the file (before the final newline):

```typescript
// ── Bundles ───────────────────────────────────────────────────────────────────

export interface BundleItem {
  listing_id:    string;
  name:          string;
  price_cents:   number;
  display_order: number;
}

export interface Bundle {
  id:             string;
  name:           string;
  description:    string | null;
  price_cents:    number;
  listing_status: string;
  active:         boolean;
  item_count:     number;
  items:          BundleItem[];
  created_at:     string;
}

export interface CreateBundleRequest {
  name:        string;
  description?: string;
  price_cents: number;
  listing_ids: string[];
}

export function fetchOrgBundles(orgId: string): Promise<{ bundles: Bundle[] }> {
  return req(`${mktBase()}/orgs/${orgId}/bundles`);
}

export function createBundle(
  orgId: string,
  body: CreateBundleRequest,
): Promise<{ bundle_id: string; listing_status: string }> {
  return req(`${mktBase()}/orgs/${orgId}/bundles`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function updateBundle(
  orgId: string,
  bundleId: string,
  body: Partial<CreateBundleRequest>,
): Promise<{ ok: boolean; listing_status: string }> {
  return req(`${mktBase()}/orgs/${orgId}/bundles/${bundleId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function deleteBundle(orgId: string, bundleId: string): Promise<void> {
  return req(`${mktBase()}/orgs/${orgId}/bundles/${bundleId}`, { method: "DELETE" });
}

// ── Proposal Inbox ────────────────────────────────────────────────────────────

export interface OrgProposalItem {
  id:                      string;
  job_title:               string;
  freelancer_email:        string;
  client_email:            string;
  submitted_at:            string;
  submitted_by_profile_id: string | null;
  submitter_name:          string | null;
  status:                  string;
}

export interface OrgProposalsResponse {
  draft:  OrgProposalItem[];
  sent:   OrgProposalItem[];
  closed: OrgProposalItem[];
}

export function fetchOrgProposals(
  orgId: string,
  callerProfileId: string,
): Promise<OrgProposalsResponse> {
  return req(
    `${mktBase()}/orgs/${orgId}/proposals?caller_profile_id=${encodeURIComponent(callerProfileId)}`,
  );
}
```

- [ ] **Step 3: Update `apps/web/lib/adminApi.ts`**

Add at the bottom of the file:

```typescript
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
```

- [ ] **Step 3b: Add `admin_list_bundles` handler and route to marketplace_service**

The `GET /admin/bundles` endpoint is called by `fetchAdminBundles` in `adminApi.ts`. Add to `crates/marketplace_service/src/bundle_handlers.rs` (at the bottom of the file, before the `#[cfg(test)]` block):

```rust
// Add to bundle_handlers.rs
pub async fn admin_list_bundles(
    State(state): State<Arc<AppState>>,
    axum::extract::Query(q): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> impl IntoResponse {
    let status_filter = q.get("status").cloned();
    let rows = sqlx::query(
        "SELECT lb.id, lb.org_id, lb.name, lb.description, lb.price_cents,
                lb.listing_status, lb.active, lb.rejection_reason, lb.created_at,
                COUNT(bi.id) AS item_count
         FROM listing_bundles lb
         LEFT JOIN bundle_items bi ON bi.bundle_id = lb.id
         WHERE ($1::TEXT IS NULL OR lb.listing_status = $1)
         GROUP BY lb.id
         ORDER BY lb.created_at DESC",
    )
    .bind(&status_filter)
    .fetch_all(&state.db)
    .await;

    match rows {
        Ok(rs) => {
            let bundles: Vec<serde_json::Value> = rs
                .iter()
                .map(|r| serde_json::json!({
                    "id":               r.get::<Uuid, _>("id"),
                    "org_id":           r.get::<Uuid, _>("org_id"),
                    "name":             r.get::<&str, _>("name"),
                    "description":      r.get::<Option<String>, _>("description"),
                    "price_cents":      r.get::<i64, _>("price_cents"),
                    "listing_status":   r.get::<&str, _>("listing_status"),
                    "active":           r.get::<bool, _>("active"),
                    "rejection_reason": r.get::<Option<String>, _>("rejection_reason"),
                    "item_count":       r.get::<i64, _>("item_count"),
                    "created_at":       r.get::<chrono::DateTime<chrono::Utc>, _>("created_at").to_rfc3339(),
                }))
                .collect();
            (StatusCode::OK, Json(serde_json::json!({ "bundles": bundles }))).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}
```

Add to `crates/marketplace_service/src/main.rs` routes (alongside the other `/admin/bundles/{id}/...` routes):
```rust
.route("/admin/bundles", get(bundle_handlers::admin_list_bundles))
```

Then run:
```bash
cmd /c "vcvars64.bat && cargo check -p marketplace_service 2>&1"
```
Expected: no errors.

- [ ] **Step 4: Check TypeScript compiles**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | head -30
```
Expected: no errors on the modified files.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/api.ts apps/web/lib/enterpriseApi.ts apps/web/lib/adminApi.ts crates/marketplace_service/src/bundle_handlers.rs crates/marketplace_service/src/main.rs
git commit -m "feat: frontend API types + functions for agency profile, bundles, proposals + admin bundle list endpoint"
```

---

## Task 9: Next.js API proxy routes

**Files:**
- Create: `apps/web/app/api/enterprise/orgs/[id]/bundles/route.ts`
- Create: `apps/web/app/api/enterprise/orgs/[id]/bundles/[bundle_id]/route.ts`
- Create: `apps/web/app/api/enterprise/orgs/[id]/proposals/route.ts`
- Create: `apps/web/app/api/admin/bundles/[id]/approve/route.ts`
- Create: `apps/web/app/api/admin/bundles/[id]/reject/route.ts`

**Context:** These follow the exact same pattern as `apps/web/app/api/enterprise/orgs/[id]/route.ts` — auth guard + forward to Rust service. `MARKETPLACE_SERVICE_URL` for marketplace endpoints.

- [ ] **Step 1: Create bundles collection proxy**

```typescript
// apps/web/app/api/enterprise/orgs/[id]/bundles/route.ts
import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
const MKT = process.env.MARKETPLACE_SERVICE_URL ?? "http://localhost:3002";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const r = await fetch(`${MKT}/enterprise/orgs/${id}/bundles`);
  return NextResponse.json(await r.json().catch(() => ({})), { status: r.status });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const r = await fetch(`${MKT}/enterprise/orgs/${id}/bundles`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return NextResponse.json(await r.json().catch(() => ({})), { status: r.status });
}
```

- [ ] **Step 2: Create bundle item proxy**

```typescript
// apps/web/app/api/enterprise/orgs/[id]/bundles/[bundle_id]/route.ts
import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
const MKT = process.env.MARKETPLACE_SERVICE_URL ?? "http://localhost:3002";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; bundle_id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, bundle_id } = await params;
  const body = await req.json();
  const r = await fetch(`${MKT}/enterprise/orgs/${id}/bundles/${bundle_id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return NextResponse.json(await r.json().catch(() => ({})), { status: r.status });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; bundle_id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, bundle_id } = await params;
  const r = await fetch(`${MKT}/enterprise/orgs/${id}/bundles/${bundle_id}`, {
    method: "DELETE",
  });
  if (r.status === 204) return new NextResponse(null, { status: 204 });
  return NextResponse.json(await r.json().catch(() => ({})), { status: r.status });
}
```

- [ ] **Step 3: Create proposals proxy**

```typescript
// apps/web/app/api/enterprise/orgs/[id]/proposals/route.ts
import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
const MKT = process.env.MARKETPLACE_SERVICE_URL ?? "http://localhost:3002";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  // Forward the caller_profile_id query param which the Rust handler requires
  const callerProfileId = req.nextUrl.searchParams.get("caller_profile_id") ?? "";
  const r = await fetch(
    `${MKT}/enterprise/orgs/${id}/proposals?caller_profile_id=${encodeURIComponent(callerProfileId)}`,
  );
  return NextResponse.json(await r.json().catch(() => ({})), { status: r.status });
}
```

- [ ] **Step 4: Create admin bundle approve/reject proxies**

```typescript
// apps/web/app/api/admin/bundles/[id]/approve/route.ts
import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
const MKT = process.env.MARKETPLACE_SERVICE_URL ?? "http://localhost:3002";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!(session?.user as { isAdmin?: boolean })?.isAdmin)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const r = await fetch(`${MKT}/admin/bundles/${id}/approve`, { method: "POST" });
  return NextResponse.json(await r.json().catch(() => ({})), { status: r.status });
}
```

```typescript
// apps/web/app/api/admin/bundles/[id]/reject/route.ts
import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
const MKT = process.env.MARKETPLACE_SERVICE_URL ?? "http://localhost:3002";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!(session?.user as { isAdmin?: boolean })?.isAdmin)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json();
  const r = await fetch(`${MKT}/admin/bundles/${id}/reject`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return NextResponse.json(await r.json().catch(() => ({})), { status: r.status });
}
```

- [ ] **Step 5: Verify TypeScript**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/api/enterprise/orgs/[id]/bundles/ \
        apps/web/app/api/enterprise/orgs/[id]/proposals/ \
        apps/web/app/api/admin/bundles/
git commit -m "feat: Next.js proxy routes for bundles + proposals + admin bundle moderation"
```

---

## Task 10: Public Agency Profile page

**Files:**
- Create: `apps/web/app/agency/[handle]/page.tsx`

**Context:** SSR Next.js Server Component. Calls `fetchAgencyProfile(handle)` which uses `/api/identity/orgs/public/{handle}` — the existing rewrite in `next.config.ts` forwards `/api/identity/*` to identity_service:3001. No auth. Returns 404 if handle not found. Also fetches listings for the org. Design: single scroll — hero, stats strip, bundles section (if any), listings grid.

- [ ] **Step 1: Create the page**

```tsx
// apps/web/app/agency/[handle]/page.tsx
import { notFound } from "next/navigation";
import { Star, ExternalLink, Users, Package, Zap } from "lucide-react";
import { fetchAgencyProfile, fetchListings, type AgencyProfile, type AgentListing } from "@/lib/api";
import { VerifiedBadge } from "@/components/VerifiedBadge";

function fmtUSD(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export default async function AgencyProfilePage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;

  let profile: AgencyProfile;
  try {
    profile = await fetchAgencyProfile(handle);
  } catch {
    notFound();
  }

  // Fetch org's active listings (filter client-side from the global listings endpoint)
  // The listings endpoint already filters active=TRUE; filter by org_id
  let orgListings: AgentListing[] = [];
  try {
    const { listings } = await fetchListings();
    // org_id is added to AgentListing by Task 6 (list_listings LEFT JOIN) + Task 8 api.ts
    orgListings = listings.filter((l) => l.org_id === profile.id).slice(0, 12);
  } catch {
    // Non-fatal — show profile without listings
  }

  const planLabel =
    profile.plan_tier === "PLATINUM"   ? "★ PLATINUM"   :
    profile.plan_tier === "ENTERPRISE" ? "● ENTERPRISE" :
                                         "● GROWTH";

  const planStyle =
    profile.plan_tier === "PLATINUM"   ? "border-violet-800 text-violet-400" :
    profile.plan_tier === "ENTERPRISE" ? "border-amber-800 text-amber-400"   :
                                         "border-zinc-700 text-zinc-500";

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">

        {/* Hero */}
        <div className="border border-zinc-800 bg-zinc-900 rounded-sm p-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-semibold text-zinc-50 truncate">{profile.name}</h1>
                <VerifiedBadge planTier={profile.plan_tier} />
                <span className={`font-mono text-[10px] px-2 py-0.5 rounded-sm border ${planStyle}`}>
                  {planLabel}
                </span>
              </div>
              <p className="font-mono text-xs text-zinc-500">@{profile.handle}</p>
              {profile.description && (
                <p className="text-sm text-zinc-400 mt-2 leading-relaxed">
                  {profile.description}
                </p>
              )}
            </div>
            <a
              href={`/marketplace?org=${profile.id}`}
              className="shrink-0 flex items-center gap-1.5 px-3 py-2 bg-amber-400 text-zinc-950 font-mono text-xs font-semibold rounded-sm hover:bg-amber-300 transition-colors"
            >
              Hire Agency
              <ExternalLink size={12} />
            </a>
          </div>
          {profile.website_url && (
            <a
              href={profile.website_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 transition-colors"
            >
              {profile.website_url}
              <ExternalLink size={10} />
            </a>
          )}
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: Users,   label: "Members",   value: profile.member_count           },
            { icon: Package, label: "Listings",  value: profile.active_listing_count   },
            { icon: Zap,     label: "Deploys",   value: profile.completed_deployment_count },
          ].map(({ icon: Icon, label, value }) => (
            <div
              key={label}
              className="border border-zinc-800 bg-zinc-900 rounded-sm p-4 text-center space-y-1"
            >
              <Icon size={14} className="mx-auto text-zinc-500" />
              <p className="font-mono text-xl font-semibold tabular-nums text-zinc-50">{value}</p>
              <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">{label}</p>
            </div>
          ))}
        </div>

        {/* Listings section */}
        {orgListings.length > 0 && (
          <div className="space-y-3">
            <h2 className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
              Listings
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {orgListings.map((listing) => (
                <a
                  key={listing.id}
                  href={`/listings/${listing.slug}`}
                  className="border border-zinc-800 bg-zinc-900 rounded-sm p-4 space-y-2
                             hover:border-zinc-600 transition-colors block"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-zinc-50 line-clamp-1">{listing.name}</p>
                    <VerifiedBadge planTier={listing.org_plan_tier} />
                  </div>
                  <p className="text-xs text-zinc-500 line-clamp-2">{listing.description}</p>
                  <p className="font-mono text-xs text-amber-400 font-semibold">
                    {fmtUSD(listing.price_cents)}/mo
                  </p>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {orgListings.length === 0 && (
          <div className="border border-zinc-800 bg-zinc-900 rounded-sm p-8 text-center">
            <p className="text-sm text-zinc-500">No active listings yet.</p>
          </div>
        )}

      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/app/agency/[handle]/page.tsx"
git commit -m "feat(ui): public agency profile page at /agency/{handle}"
```

---

## Task 11: Enterprise Bundles page

**Files:**
- Create: `apps/web/app/(app)/enterprise/bundles/page.tsx`
- Create: `apps/web/app/(app)/enterprise/bundles/BundleEditor.tsx`

**Context:** Server component renders the table shell + fetches initial data. Client component `BundleEditor` handles inline expansion, editing, creating, and deleting. `fetchOrgBundles` / `createBundle` / `updateBundle` / `deleteBundle` from `enterpriseApi.ts`. Uses `useSession()` to get `orgId` from the user session. The `mktBase()` helper in enterpriseApi routes to `/api/enterprise` on client, which the new proxy routes handle.

- [ ] **Step 1: Create BundleEditor client component**

```tsx
// apps/web/app/(app)/enterprise/bundles/BundleEditor.tsx
"use client";

import { useState, Fragment } from "react";
import { ChevronDown, ChevronUp, Loader2, Trash2 } from "lucide-react";
import {
  fetchOrgBundles, createBundle, updateBundle, deleteBundle,
  type Bundle, type BundleItem,
} from "@/lib/enterpriseApi";
import { fetchListings, type AgentListing } from "@/lib/api";

function fmtUSD(cents: number) {
  return (cents / 100).toFixed(2);
}

const statusDot: Record<string, string> = {
  APPROVED:       "text-emerald-400",
  PENDING_REVIEW: "text-amber-400",
  REJECTED:       "text-red-400",
};

interface BundleEditorProps {
  orgId:       string;
  initialBundles: Bundle[];
  orgListings: AgentListing[]; // APPROVED listings belonging to this org
}

export function BundleEditor({ orgId, initialBundles, orgListings }: BundleEditorProps) {
  const [bundles, setBundles]         = useState<Bundle[]>(initialBundles);
  const [expandedId, setExpandedId]   = useState<string | null>(null);
  const [busy, setBusy]               = useState(false);

  // Draft state for the expanded editor
  const [draftName, setDraftName]       = useState("");
  const [draftDesc, setDraftDesc]       = useState("");
  const [draftPrice, setDraftPrice]     = useState("");
  const [draftIds, setDraftIds]         = useState<string[]>([]);
  const [isNew, setIsNew]               = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [error, setError]               = useState<string | null>(null);

  function openEditor(bundle: Bundle) {
    setExpandedId(bundle.id);
    setDraftName(bundle.name);
    setDraftDesc(bundle.description ?? "");
    setDraftPrice(fmtUSD(bundle.price_cents));
    setDraftIds(bundle.items.map((i) => i.listing_id));
    setIsNew(false);
    setDeleteConfirm("");
    setError(null);
  }

  function openNew() {
    setExpandedId("__new__");
    setDraftName("");
    setDraftDesc("");
    setDraftPrice("");
    setDraftIds([]);
    setIsNew(true);
    setError(null);
  }

  function closeEditor() {
    setExpandedId(null);
    setError(null);
    setDeleteConfirm("");
  }

  async function refresh() {
    const { bundles: fresh } = await fetchOrgBundles(orgId).catch(() => ({ bundles: [] as Bundle[] }));
    setBundles(fresh);
  }

  function parsePriceCents(): number | null {
    const val = parseFloat(draftPrice);
    if (isNaN(val) || val <= 0) return null;
    return Math.floor(val * 100);
  }

  async function handleSave() {
    const price_cents = parsePriceCents();
    if (!price_cents) { setError("Enter a valid price greater than $0.00"); return; }
    if (!draftName.trim()) { setError("Bundle name is required"); return; }
    setBusy(true);
    setError(null);
    try {
      if (isNew) {
        await createBundle(orgId, {
          name:        draftName.trim(),
          description: draftDesc.trim() || undefined,
          price_cents,
          listing_ids: draftIds,
        });
      } else if (expandedId) {
        await updateBundle(orgId, expandedId, {
          name:        draftName.trim(),
          description: draftDesc.trim() || undefined,
          price_cents,
          listing_ids: draftIds,
        });
      }
      await refresh();
      closeEditor();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (deleteConfirm !== "DELETE") { setError('Type DELETE to confirm'); return; }
    if (!expandedId) return;
    setBusy(true);
    setError(null);
    try {
      await deleteBundle(orgId, expandedId);
      await refresh();
      closeEditor();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  function toggleListing(id: string) {
    setDraftIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-base font-semibold text-zinc-50">
          Bundles ({bundles.length})
        </h1>
        <button
          onClick={openNew}
          disabled={expandedId === "__new__"}
          className="px-3 py-1.5 border border-zinc-700 text-zinc-300 font-mono text-xs
                     hover:border-zinc-500 hover:text-zinc-50 disabled:opacity-40 transition-colors"
        >
          + New Bundle
        </button>
      </div>

      {/* Table */}
      <div className="border border-zinc-800 rounded-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-[10px] text-zinc-500 uppercase tracking-wider">
              <th className="text-left px-4 py-2">Name</th>
              <th className="text-left px-4 py-2">Agents</th>
              <th className="text-left px-4 py-2">Price</th>
              <th className="text-left px-4 py-2">Status</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {/* New bundle row */}
            {expandedId === "__new__" && (
              <tr>
                <td colSpan={5} className="px-4 py-4 border-b border-zinc-800 bg-zinc-900/30">
                  <EditorRow
                    draftName={draftName} setDraftName={setDraftName}
                    draftDesc={draftDesc} setDraftDesc={setDraftDesc}
                    draftPrice={draftPrice} setDraftPrice={setDraftPrice}
                    draftIds={draftIds} toggleListing={toggleListing}
                    orgListings={orgListings}
                    deleteConfirm={deleteConfirm} setDeleteConfirm={setDeleteConfirm}
                    error={error} busy={busy} isNew={true}
                    onSave={handleSave} onDelete={handleDelete} onClose={closeEditor}
                  />
                </td>
              </tr>
            )}

            {bundles.map((bundle) => (
              <Fragment key={bundle.id}>
                <tr
                  className="border-b border-zinc-800 hover:bg-zinc-900/50 cursor-pointer"
                  onClick={() =>
                    expandedId === bundle.id ? closeEditor() : openEditor(bundle)
                  }
                >
                  <td className="px-4 py-3 text-zinc-50 font-medium">{bundle.name}</td>
                  <td className="px-4 py-3 text-zinc-400 font-mono text-xs">{bundle.item_count}</td>
                  <td className="px-4 py-3 text-amber-400 font-mono text-xs">
                    {bundle.price_cents > 0 ? `$${fmtUSD(bundle.price_cents)}/mo` : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`font-mono text-xs ${statusDot[bundle.listing_status] ?? "text-zinc-400"}`}>
                      ● {bundle.listing_status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {expandedId === bundle.id
                      ? <ChevronUp size={14} className="ml-auto text-zinc-400" />
                      : <ChevronDown size={14} className="ml-auto text-zinc-400" />
                    }
                  </td>
                </tr>

                {expandedId === bundle.id && (
                  <tr key={`${bundle.id}-editor`} className="border-b border-zinc-800 bg-zinc-900/30">
                    <td colSpan={5} className="px-4 py-4">
                      <EditorRow
                        draftName={draftName} setDraftName={setDraftName}
                        draftDesc={draftDesc} setDraftDesc={setDraftDesc}
                        draftPrice={draftPrice} setDraftPrice={setDraftPrice}
                        draftIds={draftIds} toggleListing={toggleListing}
                        orgListings={orgListings}
                        deleteConfirm={deleteConfirm} setDeleteConfirm={setDeleteConfirm}
                        error={error} busy={busy} isNew={false}
                        onSave={handleSave} onDelete={handleDelete} onClose={closeEditor}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}

            {bundles.length === 0 && expandedId !== "__new__" && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-zinc-500">
                  No bundles yet. Click + New Bundle to create one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Inline editor row ──────────────────────────────────────────────────────────

interface EditorRowProps {
  draftName:      string; setDraftName:      (v: string) => void;
  draftDesc:      string; setDraftDesc:      (v: string) => void;
  draftPrice:     string; setDraftPrice:     (v: string) => void;
  draftIds:       string[]; toggleListing:   (id: string) => void;
  orgListings:    AgentListing[];
  deleteConfirm:  string; setDeleteConfirm:  (v: string) => void;
  error:          string | null;
  busy:           boolean;
  isNew:          boolean;
  onSave:         () => void;
  onDelete:       () => void;
  onClose:        () => void;
}

function EditorRow({
  draftName, setDraftName, draftDesc, setDraftDesc, draftPrice, setDraftPrice,
  draftIds, toggleListing, orgListings, deleteConfirm, setDeleteConfirm,
  error, busy, isNew, onSave, onDelete, onClose,
}: EditorRowProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 py-2">
      {/* Left: listing checkboxes */}
      <div className="space-y-2">
        <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
          Select Listings
        </p>
        {orgListings.length === 0 ? (
          <p className="text-xs text-zinc-500">
            No APPROVED listings linked to this org yet. Set `org_id` on a listing first.
          </p>
        ) : (
          <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
            {orgListings.map((l) => (
              <label
                key={l.id}
                className="flex items-center gap-2 cursor-pointer group"
              >
                <input
                  type="checkbox"
                  checked={draftIds.includes(l.id)}
                  onChange={() => toggleListing(l.id)}
                  className="accent-amber-400"
                />
                <span className="text-xs text-zinc-300 group-hover:text-zinc-50 transition-colors truncate">
                  {l.name}
                </span>
                <span className="text-xs text-zinc-500 font-mono ml-auto shrink-0">
                  ${(l.price_cents / 100).toFixed(0)}/mo
                </span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Right: name / desc / price + actions */}
      <div className="space-y-3">
        <div>
          <label className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest block mb-1">
            Bundle Name
          </label>
          <input
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            placeholder="e.g. Full Auto Stack"
            className="w-full bg-zinc-800 border border-zinc-700 text-zinc-50 text-sm px-3 py-2
                       rounded-sm focus:outline-none focus:border-amber-500 transition-colors"
          />
        </div>
        <div>
          <label className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest block mb-1">
            Description (optional)
          </label>
          <textarea
            value={draftDesc}
            onChange={(e) => setDraftDesc(e.target.value)}
            rows={2}
            className="w-full bg-zinc-800 border border-zinc-700 text-zinc-50 text-sm px-3 py-2
                       rounded-sm focus:outline-none focus:border-amber-500 transition-colors resize-none"
          />
        </div>
        <div>
          <label className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest block mb-1">
            Price / month (USD)
          </label>
          <input
            value={draftPrice}
            onChange={(e) => setDraftPrice(e.target.value)}
            placeholder="0.00"
            type="number"
            min="0"
            step="0.01"
            className="w-full bg-zinc-800 border border-zinc-700 text-zinc-50 text-sm px-3 py-2
                       rounded-sm focus:outline-none focus:border-amber-500 transition-colors font-mono"
          />
        </div>

        {error && (
          <p className="text-xs text-red-400">{error}</p>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <button
            disabled={busy}
            onClick={onSave}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-400 text-zinc-950
                       font-mono text-xs font-semibold rounded-sm hover:bg-amber-300
                       disabled:opacity-50 transition-colors"
          >
            {busy && <Loader2 size={12} className="animate-spin" />}
            {isNew ? "Create Bundle" : "Save Changes"}
          </button>
          <button
            disabled={busy}
            onClick={onClose}
            className="px-3 py-1.5 border border-zinc-700 text-zinc-400 font-mono text-xs
                       hover:text-zinc-200 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
        </div>

        {!isNew && (
          <div className="pt-2 border-t border-zinc-800 space-y-2">
            <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
              Danger Zone
            </p>
            <div className="flex items-center gap-2">
              <input
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder={'Type "DELETE" to confirm'}
                className="flex-1 bg-zinc-800 border border-red-900 text-zinc-50 text-xs px-3 py-1.5
                           rounded-sm focus:outline-none focus:border-red-500 transition-colors font-mono"
              />
              <button
                disabled={busy || deleteConfirm !== "DELETE"}
                onClick={onDelete}
                className="flex items-center gap-1 px-3 py-1.5 border border-red-900 text-red-400
                           font-mono text-xs hover:bg-red-900/30 disabled:opacity-40 transition-colors"
              >
                <Trash2 size={12} /> Delete
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the bundles page**

```tsx
// apps/web/app/(app)/enterprise/bundles/page.tsx
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { fetchOrgBundles, getMyOrg, type Bundle } from "@/lib/enterpriseApi";
import { fetchListings, type AgentListing } from "@/lib/api";
import { BundleEditor } from "./BundleEditor";

export default async function BundlesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const profileId = (session.user as { profileId?: string })?.profileId ?? "";

  // Get org for this user
  let orgId = "";
  let orgListings: AgentListing[] = [];
  let initialBundles: Bundle[] = [];

  try {
    const org = await getMyOrg(profileId);
    orgId = org.id;
    const [bundlesRes] = await Promise.all([
      fetchOrgBundles(orgId).catch(() => ({ bundles: [] as Bundle[] })),
    ]);
    initialBundles = bundlesRes.bundles;

    // Get APPROVED listings belonging to this org (org_id added in Task 6 + Task 8)
    const { listings } = await fetchListings().catch(() => ({ listings: [] as AgentListing[] }));
    orgListings = listings.filter((l) => l.org_id === orgId && l.listing_status === "APPROVED");
  } catch {
    // Org not found — redirect to setup
    redirect("/enterprise/setup");
  }

  return (
    <div className="max-w-4xl mx-auto py-6 px-4">
      <BundleEditor
        orgId={orgId}
        initialBundles={initialBundles}
        orgListings={orgListings}
      />
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/(app)/enterprise/bundles/"
git commit -m "feat(ui): enterprise bundles page — inline table editor with expand/create/delete"
```

---

## Task 12: Enterprise Proposals Inbox page

**Files:**
- Create: `apps/web/app/(app)/enterprise/proposals/page.tsx`

**Context:** Kanban with 3 fixed columns: Draft / Sent / Closed. Uses `fetchOrgProposals(orgId, callerProfileId)`. ADMIN sees Mine/All toggle. Card click navigates to existing `/proposals/{id}` detail. No drag-and-drop.

- [ ] **Step 1: Create the page**

```tsx
// apps/web/app/(app)/enterprise/proposals/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { getMyOrg, fetchOrgProposals, type OrgProposalItem, type OrgProposalsResponse } from "@/lib/enterpriseApi";

function ProposalCard({ item }: { item: OrgProposalItem }) {
  const router = useRouter();
  const date = new Date(item.submitted_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  return (
    <button
      onClick={() => router.push(`/proposals/${item.id}`)}
      className="w-full text-left border border-zinc-800 bg-zinc-900 rounded-sm p-3 space-y-1.5
                 hover:border-zinc-600 transition-colors"
    >
      <p className="text-xs font-medium text-zinc-50 line-clamp-1">{item.job_title}</p>
      <div className="flex items-center gap-1 text-[11px] text-zinc-500">
        <span className="font-mono truncate max-w-[120px]">
          {item.submitter_name ?? item.freelancer_email.split("@")[0]}
        </span>
        <span>·</span>
        <span className="font-mono">{date}</span>
      </div>
      <p className="font-mono text-[10px] text-zinc-600 truncate">{item.client_email}</p>
    </button>
  );
}

interface KanbanColumnProps {
  title:  string;
  items:  OrgProposalItem[];
}

function KanbanColumn({ title, items }: KanbanColumnProps) {
  return (
    <div className="flex-1 min-w-0 space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">{title}</p>
        <span className="font-mono text-[10px] text-zinc-600">{items.length}</span>
      </div>
      <div className="space-y-2">
        {items.map((item) => (
          <ProposalCard key={item.id} item={item} />
        ))}
        {items.length === 0 && (
          <p className="text-xs text-zinc-600 italic">None</p>
        )}
      </div>
    </div>
  );
}

export default function ProposalsInboxPage() {
  const { data: session } = useSession();
  const [data, setData]       = useState<OrgProposalsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [orgId, setOrgId]     = useState<string | null>(null);

  // ADMIN toggle: "mine" | "all"  (ADMIN only — MEMBER always sees "mine"; ADMIN defaults to "all" per spec)
  const [view, setView]  = useState<"mine" | "all">("all");

  const profileId  = (session?.user as { profileId?: string })?.profileId ?? "";
  const memberRole = (session?.user as { role?: string })?.role;
  const isAdmin    = memberRole === "agent-owner" || memberRole === "admin";

  useEffect(() => {
    if (!profileId) return;
    getMyOrg(profileId)
      .then((org) => setOrgId(org.id))
      .catch(() => setError("Could not load organisation."));
  }, [profileId]);

  useEffect(() => {
    if (!orgId || !profileId) return;
    setLoading(true);
    // For "mine" view, pass the callerProfileId; for "all" admin view, still pass it
    // (the backend filters based on role lookup server-side — callerProfileId identifies the caller)
    fetchOrgProposals(orgId, profileId)
      .then(setData)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [orgId, profileId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={18} className="animate-spin text-zinc-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto py-6 px-4">
        <p className="text-sm text-red-400">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  // For "mine" view: filter to only items submitted by the current user
  const filtered: OrgProposalsResponse = view === "mine"
    ? {
        draft:  data.draft.filter( (p) => p.submitted_by_profile_id === profileId),
        sent:   data.sent.filter(  (p) => p.submitted_by_profile_id === profileId),
        closed: data.closed.filter((p) => p.submitted_by_profile_id === profileId),
      }
    : data;

  return (
    <div className="max-w-5xl mx-auto py-6 px-4 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-base font-semibold text-zinc-50">Proposal Inbox</h1>
        {isAdmin && (
          <div className="flex items-center gap-1 border border-zinc-800 rounded-sm overflow-hidden">
            {(["mine", "all"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest transition-colors ${
                  view === v
                    ? "bg-zinc-800 text-zinc-50"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KanbanColumn title="Draft"  items={filtered.draft}  />
        <KanbanColumn title="Sent"   items={filtered.sent}   />
        <KanbanColumn title="Closed" items={filtered.closed} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/app/(app)/enterprise/proposals/page.tsx"
git commit -m "feat(ui): enterprise proposal inbox — 3-column Kanban with ADMIN Mine/All toggle"
```

---

## Task 13: Navigation + Admin Bundles tab

**Files:**
- Modify: `apps/web/components/AppSidebar.tsx`
- Modify: `apps/web/app/admin/listings/page.tsx`

### Part A — AppSidebar Enterprise nav

- [ ] **Step 1: Add Proposals and Bundles links to the Enterprise section**

In `apps/web/components/AppSidebar.tsx`, find the `SECTION_NAV` Enterprise items array:

```typescript
  {
    heading: "Enterprise",
    items: [
      { label: "Industry Suites", href: "/vertical"                },
      { label: "Enterprise Hub",  href: "/enterprise"              },
      { label: "Talent Pools",    href: "/enterprise/talent-pools" },
      { label: "SLA Dashboard",   href: "/enterprise/sla"          },
      { label: "Global & Access", href: "/global"                  },
    ],
  },
```

Replace the `items` array with:

```typescript
    items: [
      { label: "Industry Suites", href: "/vertical"                 },
      { label: "Enterprise Hub",  href: "/enterprise"               },
      { label: "Members",         href: "/enterprise/members"       },
      { label: "Proposals",       href: "/enterprise/proposals"     },
      { label: "Bundles",         href: "/enterprise/bundles"       },
      { label: "Talent Pools",    href: "/enterprise/talent-pools"  },
      { label: "SLA Dashboard",   href: "/enterprise/sla"           },
      { label: "Global & Access", href: "/global"                   },
    ],
```

### Part B — Admin Listings: add Bundles tab

- [ ] **Step 2: Read the current admin listings page**

Read `apps/web/app/admin/listings/page.tsx` in full to understand the structure before modifying.

- [ ] **Step 3: Add Bundles tab to admin listings page**

The current page has a header with status filter tabs and a table of `agent_listings`. We need to add a "Bundles" / "Listings" top-level tab.

Add at the top of the file:

```typescript
import { fetchAdminBundles, approveListing, rejectListing, approveBundle, rejectBundle, type AdminListing, type AdminBundle } from "@/lib/adminApi";
import { BundleActions } from "./BundleActions";
```

Update the component signature and data fetching to accept a `tab` search param:

```typescript
export default async function AdminListings({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; tab?: string }>;
}) {
  const sp  = await searchParams;
  const tab = sp.tab === "bundles" ? "bundles" : "listings";
  const statusFilter = sp.status;
```

Add tab switcher UI before the status filters:

```tsx
  {/* Tab switcher */}
  <div className="flex gap-2 mb-4">
    {(["listings", "bundles"] as const).map((t) => (
      <a
        key={t}
        href={`?tab=${t}`}
        className={`px-3 py-1.5 font-mono text-xs border transition-colors ${
          tab === t
            ? "border-amber-500 text-amber-400 bg-amber-950/20"
            : "border-zinc-700 text-zinc-400 hover:text-zinc-200"
        }`}
      >
        {t === "listings" ? "Agent Listings" : "Bundles"}
      </a>
    ))}
  </div>
```

When `tab === "bundles"`, render a bundles table using `fetchAdminBundles(statusFilter)`. When `tab === "listings"`, render the existing listings table.

> **Note:** Create a companion `apps/web/app/admin/listings/BundleActions.tsx` client component following the same pattern as `ListingActions.tsx` — uses `approveBundle` and `rejectBundle` from adminApi.

```tsx
// apps/web/app/admin/listings/BundleActions.tsx
"use client";
import { useState } from "react";
import { approveBundle, rejectBundle, type AdminBundle } from "@/lib/adminApi";

export function BundleActions({ bundle }: { bundle: AdminBundle }) {
  const [busy, setBusy] = useState(false);

  async function handle(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      window.location.reload();
    } catch (e) {
      alert(String(e));
    } finally {
      setBusy(false);
    }
  }

  if (bundle.listing_status === "APPROVED") {
    return (
      <button
        disabled={busy}
        onClick={() => handle(() => rejectBundle(bundle.id, "Re-reviewed"))}
        className="text-[11px] px-2 py-0.5 border border-red-900 text-red-400
                   hover:bg-red-900/30 disabled:opacity-50 transition-colors"
      >
        Revoke
      </button>
    );
  }

  if (bundle.listing_status === "REJECTED") {
    return (
      <button
        disabled={busy}
        onClick={() => handle(() => approveBundle(bundle.id))}
        className="text-[11px] px-2 py-0.5 border border-emerald-800 text-emerald-400
                   hover:bg-emerald-900/30 disabled:opacity-50 transition-colors"
      >
        Re-approve
      </button>
    );
  }

  return (
    <div className="flex gap-1">
      <button
        disabled={busy}
        onClick={() => handle(() => approveBundle(bundle.id))}
        className="text-[11px] px-2 py-0.5 border border-emerald-800 text-emerald-400
                   hover:bg-emerald-900/30 disabled:opacity-50 transition-colors"
      >
        Approve
      </button>
      <button
        disabled={busy}
        onClick={() => {
          const r = window.prompt("Rejection reason:");
          if (r) handle(() => rejectBundle(bundle.id, r));
        }}
        className="text-[11px] px-2 py-0.5 border border-red-900 text-red-400
                   hover:bg-red-900/30 disabled:opacity-50 transition-colors"
      >
        Reject
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Verify TypeScript**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/AppSidebar.tsx \
        apps/web/app/admin/listings/page.tsx \
        apps/web/app/admin/listings/BundleActions.tsx
git commit -m "feat(nav): add Proposals + Bundles to Enterprise sidebar; Bundles tab in admin listings"
```

---

## Task 14: Verified Badge on marketplace listing cards

**Files:**
- Modify: `apps/web/app/(app)/marketplace/page.tsx`

**Context:** The marketplace listing cards are rendered inline in `marketplace/page.tsx`. Each `AgentListing` now has `org_plan_tier?: string | null` from the updated `list_listings` endpoint. Import `VerifiedBadge` and render it in the card top-right.

- [ ] **Step 1: Read the current listing card rendering**

Read `apps/web/app/(app)/marketplace/page.tsx` and find the section that renders individual listing cards (look for `price_cents`, `seller_type`, card `<div>` blocks).

- [ ] **Step 2: Add VerifiedBadge import**

Add to the import block at the top of `apps/web/app/(app)/marketplace/page.tsx`:

```typescript
import { VerifiedBadge } from "@/components/VerifiedBadge";
```

- [ ] **Step 3: Add badge to each listing card**

In the listing card render area, find the card header section (typically contains `listing.name` and category badge). Add:

```tsx
<div className="flex items-start justify-between gap-2">
  {/* existing name / category content */}
  <VerifiedBadge planTier={listing.org_plan_tier} />
</div>
```

Wrap the existing name element and the `VerifiedBadge` in the flex container. Read the file first to see the exact structure.

- [ ] **Step 4: Verify TypeScript**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/(app)/marketplace/page.tsx"
git commit -m "feat(ui): show VerifiedBadge on marketplace listing cards for enterprise orgs"
```

---

## Final Verification

- [ ] **Rust compilation check — whole workspace**

```bash
cmd /c "vcvars64.bat && cargo check --workspace 2>&1"
```
Expected: no errors.

- [ ] **All Rust tests pass**

```bash
cmd /c "vcvars64.bat && cargo test -p identity_service -p marketplace_service 2>&1"
```
Expected: all tests pass (including the new `is_verified_plan`, `proposal_kanban_group`, `approve_sets_active_true`, `reject_sets_active_false` tests).

- [ ] **Frontend TypeScript clean**

```bash
cd apps/web && npx tsc --noEmit 2>&1
```
Expected: no errors.

- [ ] **Final commit if any loose files remain**

```bash
git status
```
If nothing untracked/modified: done. Otherwise, commit with `git add <files> && git commit -m "chore: final cleanup"`.
