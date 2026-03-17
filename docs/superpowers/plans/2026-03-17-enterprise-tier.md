# Enterprise Tier Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Enterprise tier — multi-seat org accounts with member management, org-scoped deployment tracking, SLA analytics, API keys for MCP access, and admin oversight.

**Architecture:** Add `organisations` + `org_members` + `org_invites` + `org_api_keys` tables. Identity service handles org CRUD/invite/member/key endpoints. Marketplace service exposes org-scoped deployment analytics. Frontend wires the existing demo `/enterprise/page.tsx` to real data and adds setup, members, and API-key pages. Admin gets an Enterprise orgs overview tab.

**Tech Stack:** Rust/Axum (identity_service :3001, marketplace_service :3002), SQLx non-macro queries, Next.js 15 App Router, React 19, Tailwind 4, Lucide icons, NextAuth.js v5 session guard.

---

## File Map

```
migrations/
  0028_enterprise.sql                              CREATE

crates/identity_service/src/
  enterprise_handlers.rs                           CREATE — org CRUD, invite, members, API keys
  main.rs                                          MODIFY — register enterprise + admin enterprise routes

crates/marketplace_service/src/
  enterprise_handlers.rs                           CREATE — org deployments list + analytics
  main.rs                                          MODIFY — register enterprise routes

apps/web/
  lib/enterpriseApi.ts                             CREATE — all enterprise API helpers
  app/api/enterprise/orgs/route.ts                 CREATE — POST create org / GET my org
  app/api/enterprise/orgs/[id]/route.ts            CREATE — GET details / PATCH update
  app/api/enterprise/orgs/[id]/invite/route.ts     CREATE — POST invite member
  app/api/enterprise/orgs/[id]/members/route.ts    CREATE — GET list members
  app/api/enterprise/orgs/[id]/members/[pid]/route.ts  CREATE — DELETE remove member
  app/api/enterprise/orgs/[id]/api-keys/route.ts   CREATE — GET list / POST generate key
  app/api/enterprise/orgs/[id]/api-keys/[kid]/route.ts  CREATE — DELETE revoke key
  app/api/enterprise/orgs/[id]/analytics/route.ts   CREATE — GET org analytics
  app/api/enterprise/orgs/[id]/deployments/route.ts CREATE — GET org deployments
  app/api/enterprise/invites/[token]/accept/route.ts  CREATE — POST accept invite
  app/enterprise/setup/page.tsx                    CREATE — create org wizard
  app/enterprise/page.tsx                          MODIFY — wire to real API (currently demo)
  app/enterprise/members/page.tsx                  CREATE — member management
  app/enterprise/api-keys/page.tsx                 CREATE — API key management
  app/enterprise/sla/page.tsx                      MODIFY — wire to real analytics
  app/admin/enterprise/page.tsx                    CREATE — admin org oversight
  app/admin/layout.tsx                             MODIFY — add Enterprise nav item
```

---

## Task 1: DB Migration 0028

**Files:**
- Create: `migrations/0028_enterprise.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- migrations/0028_enterprise.sql

-- Organisation plan tiers
CREATE TYPE org_plan_tier AS ENUM ('GROWTH', 'ENTERPRISE', 'PLATINUM');

-- Core org table
CREATE TABLE organisations (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                      TEXT NOT NULL,
    owner_id                  UUID NOT NULL REFERENCES unified_profiles(id),
    plan_tier                 org_plan_tier NOT NULL DEFAULT 'GROWTH',
    contract_value_cents      BIGINT NOT NULL DEFAULT 0,
    renewal_date              DATE,
    veto_window_seconds       INT NOT NULL DEFAULT 30,
    custom_escrow_platform_pct INT NOT NULL DEFAULT 30,
    csm_name                  TEXT,
    csm_email                 TEXT,
    csm_response_sla          TEXT DEFAULT '< 4 hr',
    created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Org membership (owner is always ADMIN + listed here)
CREATE TABLE org_members (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    profile_id  UUID NOT NULL REFERENCES unified_profiles(id) ON DELETE CASCADE,
    member_role TEXT NOT NULL DEFAULT 'MEMBER' CHECK (member_role IN ('ADMIN', 'MEMBER')),
    joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (org_id, profile_id)
);

-- Email invites (token-based, single-use)
CREATE TABLE org_invites (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id         UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    inviter_id     UUID NOT NULL REFERENCES unified_profiles(id),
    invitee_email  TEXT NOT NULL,
    token          TEXT NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
    accepted_at    TIMESTAMPTZ,
    expires_at     TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- API keys (hash stored, raw shown once)
CREATE TABLE org_api_keys (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id       UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    label        TEXT NOT NULL,
    key_hash     TEXT NOT NULL UNIQUE,
    created_by   UUID NOT NULL REFERENCES unified_profiles(id),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ,
    revoked_at   TIMESTAMPTZ
);

-- Link deployments to org (nullable — not all deployments are org-scoped)
ALTER TABLE deployments ADD COLUMN org_id UUID REFERENCES organisations(id);

-- Indexes
CREATE INDEX idx_org_members_org_id     ON org_members(org_id);
CREATE INDEX idx_org_members_profile_id ON org_members(profile_id);
CREATE INDEX idx_org_invites_token      ON org_invites(token);
CREATE INDEX idx_org_invites_org_id     ON org_invites(org_id);
CREATE INDEX idx_org_api_keys_org_id    ON org_api_keys(org_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_deployments_org_id     ON deployments(org_id) WHERE org_id IS NOT NULL;

-- account_type 'enterprise' is already a valid TEXT value — no enum change needed
```

- [ ] **Step 2: Verify migration syntax locally (offline — no DB needed)**

```bash
# Just check the file exists and has no obvious syntax issues
cat /d/AiStaffApp/migrations/0028_enterprise.sql | head -5
```
Expected: First line is `-- migrations/0028_enterprise.sql`

- [ ] **Step 3: Commit**

```bash
cd /d/AiStaffApp
git add migrations/0028_enterprise.sql
git commit -m "feat(enterprise): migration 0028 — organisations, org_members, org_invites, org_api_keys"
```

---

## Task 2: Identity Service — enterprise_handlers.rs

**Files:**
- Create: `crates/identity_service/src/enterprise_handlers.rs`

- [ ] **Step 1: Create the handler file**

```rust
// crates/identity_service/src/enterprise_handlers.rs
use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use blake3::Hasher;
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;

// ── Request / Response types ───────────────────────────────────────────────

#[derive(Deserialize)]
pub struct CreateOrgBody {
    pub name: String,
    pub plan_tier: Option<String>, // "GROWTH" | "ENTERPRISE" | "PLATINUM"
}

#[derive(Serialize)]
pub struct OrgResponse {
    pub id: String,
    pub name: String,
    pub owner_id: String,
    pub plan_tier: String,
    pub contract_value_cents: i64,
    pub renewal_date: Option<String>,
    pub veto_window_seconds: i32,
    pub custom_escrow_platform_pct: i32,
    pub csm_name: Option<String>,
    pub csm_email: Option<String>,
    pub csm_response_sla: Option<String>,
    pub member_count: i64,
    pub created_at: String,
}

#[derive(Deserialize)]
pub struct UpdateOrgBody {
    pub name: Option<String>,
    pub csm_name: Option<String>,
    pub csm_email: Option<String>,
    pub csm_response_sla: Option<String>,
    pub veto_window_seconds: Option<i32>,
    pub contract_value_cents: Option<i64>,
    pub renewal_date: Option<String>,
    pub plan_tier: Option<String>,
}

#[derive(Deserialize)]
pub struct InviteBody {
    pub invitee_email: String,
    pub inviter_profile_id: String,
}

#[derive(Serialize)]
pub struct InviteResponse {
    pub invite_id: String,
    pub token: String,
    pub invitee_email: String,
    pub expires_at: String,
}

#[derive(Deserialize)]
pub struct AcceptInviteBody {
    pub profile_id: String,
}

#[derive(Serialize)]
pub struct MemberResponse {
    pub profile_id: String,
    pub display_name: Option<String>,
    pub email: String,
    pub member_role: String,
    pub identity_tier: String,
    pub trust_score: i32,  // DB is SMALLINT — cast to ::INT in SQL query below
    pub joined_at: String,
}

#[derive(Serialize)]
pub struct ApiKeyResponse {
    pub id: String,
    pub label: String,
    pub key_preview: String, // first 8 chars only
    pub created_at: String,
    pub last_used_at: Option<String>,
}

#[derive(Serialize)]
pub struct CreatedKeyResponse {
    pub id: String,
    pub label: String,
    pub raw_key: String, // shown ONCE — never stored
}

#[derive(Deserialize)]
pub struct CreateKeyBody {
    pub label: String,
    pub created_by: String,
}

// ── Handlers ───────────────────────────────────────────────────────────────

/// POST /enterprise/orgs
pub async fn create_org(
    State(pool): State<PgPool>,
    Json(body): Json<CreateOrgBody>,
) -> Result<Json<OrgResponse>, StatusCode> {
    // Require non-empty name
    if body.name.trim().is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }

    // Placeholder: owner_id must come from auth header in production
    // For now accept owner_id in query or use a fixed placeholder
    // Real impl: extract from JWT in middleware
    Err(StatusCode::NOT_IMPLEMENTED)
}

/// POST /enterprise/orgs-create  (takes owner_id in body for now)
#[derive(Deserialize)]
pub struct CreateOrgFullBody {
    pub owner_id: String,
    pub name: String,
    pub plan_tier: Option<String>,
}

pub async fn create_org_full(
    State(pool): State<PgPool>,
    Json(body): Json<CreateOrgFullBody>,
) -> Result<(StatusCode, Json<OrgResponse>), StatusCode> {
    if body.name.trim().is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }
    let owner_id = Uuid::parse_str(&body.owner_id).map_err(|_| StatusCode::BAD_REQUEST)?;
    let plan_tier = body.plan_tier.as_deref().unwrap_or("GROWTH");
    if !["GROWTH", "ENTERPRISE", "PLATINUM"].contains(&plan_tier) {
        return Err(StatusCode::BAD_REQUEST);
    }

    // Create org
    let org_id: Uuid = sqlx::query_scalar(
        "INSERT INTO organisations (name, owner_id, plan_tier)
         VALUES ($1, $2, $3::org_plan_tier)
         RETURNING id"
    )
    .bind(&body.name)
    .bind(owner_id)
    .bind(plan_tier)
    .fetch_one(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Add owner as ADMIN member
    sqlx::query(
        "INSERT INTO org_members (org_id, profile_id, member_role)
         VALUES ($1, $2, 'ADMIN')
         ON CONFLICT (org_id, profile_id) DO NOTHING"
    )
    .bind(org_id)
    .bind(owner_id)
    .execute(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Update account_type to 'enterprise'
    sqlx::query(
        "UPDATE unified_profiles SET account_type = 'enterprise', updated_at = NOW()
         WHERE id = $1"
    )
    .bind(owner_id)
    .execute(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let org = fetch_org_response(&pool, org_id).await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok((StatusCode::CREATED, Json(org)))
}

/// GET /enterprise/orgs/my?profile_id=<uuid>
pub async fn get_my_org(
    State(pool): State<PgPool>,
    axum::extract::Query(params): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> Result<Json<OrgResponse>, StatusCode> {
    let profile_id = params.get("profile_id")
        .and_then(|s| Uuid::parse_str(s).ok())
        .ok_or(StatusCode::BAD_REQUEST)?;

    let org_id: Option<Uuid> = sqlx::query_scalar(
        "SELECT org_id FROM org_members WHERE profile_id = $1 LIMIT 1"
    )
    .bind(profile_id)
    .fetch_optional(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    match org_id {
        None => Err(StatusCode::NOT_FOUND),
        Some(id) => {
            let org = fetch_org_response(&pool, id).await
                .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
            Ok(Json(org))
        }
    }
}

/// GET /enterprise/orgs/:id
pub async fn get_org(
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
) -> Result<Json<OrgResponse>, StatusCode> {
    fetch_org_response(&pool, id).await
        .map(Json)
        .map_err(|_| StatusCode::NOT_FOUND)
}

/// PATCH /enterprise/orgs/:id
pub async fn update_org(
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateOrgBody>,
) -> Result<Json<OrgResponse>, StatusCode> {
    if let Some(name) = &body.name {
        sqlx::query("UPDATE organisations SET name = $1, updated_at = NOW() WHERE id = $2")
            .bind(name).bind(id).execute(&pool).await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }
    if let Some(v) = &body.csm_name {
        sqlx::query("UPDATE organisations SET csm_name = $1, updated_at = NOW() WHERE id = $2")
            .bind(v).bind(id).execute(&pool).await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }
    if let Some(v) = &body.csm_email {
        sqlx::query("UPDATE organisations SET csm_email = $1, updated_at = NOW() WHERE id = $2")
            .bind(v).bind(id).execute(&pool).await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }
    if let Some(v) = &body.csm_response_sla {
        sqlx::query("UPDATE organisations SET csm_response_sla = $1, updated_at = NOW() WHERE id = $2")
            .bind(v).bind(id).execute(&pool).await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }
    if let Some(v) = body.veto_window_seconds {
        sqlx::query("UPDATE organisations SET veto_window_seconds = $1, updated_at = NOW() WHERE id = $2")
            .bind(v).bind(id).execute(&pool).await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }
    if let Some(v) = body.contract_value_cents {
        sqlx::query("UPDATE organisations SET contract_value_cents = $1, updated_at = NOW() WHERE id = $2")
            .bind(v).bind(id).execute(&pool).await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }
    if let Some(v) = &body.renewal_date {
        let d: chrono::NaiveDate = v.parse().map_err(|_| StatusCode::BAD_REQUEST)?;
        sqlx::query("UPDATE organisations SET renewal_date = $1, updated_at = NOW() WHERE id = $2")
            .bind(d).bind(id).execute(&pool).await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }
    if let Some(tier) = &body.plan_tier {
        if !["GROWTH", "ENTERPRISE", "PLATINUM"].contains(&tier.as_str()) {
            return Err(StatusCode::BAD_REQUEST);
        }
        sqlx::query("UPDATE organisations SET plan_tier = $1::org_plan_tier, updated_at = NOW() WHERE id = $2")
            .bind(tier).bind(id).execute(&pool).await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }

    fetch_org_response(&pool, id).await
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

/// POST /enterprise/orgs/:id/invite
pub async fn invite_member(
    State(pool): State<PgPool>,
    Path(org_id): Path<Uuid>,
    Json(body): Json<InviteBody>,
) -> Result<(StatusCode, Json<InviteResponse>), StatusCode> {
    let inviter_id = Uuid::parse_str(&body.inviter_profile_id)
        .map_err(|_| StatusCode::BAD_REQUEST)?;

    let (invite_id, token, expires_at): (Uuid, String, chrono::DateTime<chrono::Utc>) =
        sqlx::query_as(
            "INSERT INTO org_invites (org_id, inviter_id, invitee_email)
             VALUES ($1, $2, $3)
             RETURNING id, token, expires_at"
        )
        .bind(org_id)
        .bind(inviter_id)
        .bind(&body.invitee_email)
        .fetch_one(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok((StatusCode::CREATED, Json(InviteResponse {
        invite_id: invite_id.to_string(),
        token,
        invitee_email: body.invitee_email,
        expires_at: expires_at.to_rfc3339(),
    })))
}

/// POST /enterprise/invites/:token/accept
pub async fn accept_invite(
    State(pool): State<PgPool>,
    Path(token): Path<String>,
    Json(body): Json<AcceptInviteBody>,
) -> Result<StatusCode, StatusCode> {
    let profile_id = Uuid::parse_str(&body.profile_id)
        .map_err(|_| StatusCode::BAD_REQUEST)?;

    // Fetch valid unused invite
    let row: Option<(Uuid, Uuid)> = sqlx::query_as(
        "SELECT id, org_id FROM org_invites
         WHERE token = $1
           AND accepted_at IS NULL
           AND expires_at > NOW()
         LIMIT 1"
    )
    .bind(&token)
    .fetch_optional(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let (invite_id, org_id) = row.ok_or(StatusCode::NOT_FOUND)?;

    // Add member
    sqlx::query(
        "INSERT INTO org_members (org_id, profile_id, member_role)
         VALUES ($1, $2, 'MEMBER')
         ON CONFLICT (org_id, profile_id) DO NOTHING"
    )
    .bind(org_id)
    .bind(profile_id)
    .execute(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Mark invite used
    sqlx::query(
        "UPDATE org_invites SET accepted_at = NOW() WHERE id = $1"
    )
    .bind(invite_id)
    .execute(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(StatusCode::OK)
}

/// GET /enterprise/orgs/:id/members
pub async fn list_members(
    State(pool): State<PgPool>,
    Path(org_id): Path<Uuid>,
) -> Result<Json<Vec<MemberResponse>>, StatusCode> {
    let rows: Vec<(Uuid, Option<String>, String, String, String, i32, chrono::DateTime<chrono::Utc>)> =
        sqlx::query_as(
            "SELECT om.profile_id, up.display_name, up.email,
                    om.member_role, up.identity_tier::TEXT, up.trust_score::INT, om.joined_at
             FROM org_members om
             JOIN unified_profiles up ON up.id = om.profile_id
             WHERE om.org_id = $1
             ORDER BY om.joined_at"
        )
        .bind(org_id)
        .fetch_all(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let members = rows.into_iter().map(|(pid, dn, email, role, tier, score, joined)| {
        MemberResponse {
            profile_id: pid.to_string(),
            display_name: dn,
            email,
            member_role: role,
            identity_tier: tier,
            trust_score: score,
            joined_at: joined.to_rfc3339(),
        }
    }).collect();

    Ok(Json(members))
}

/// DELETE /enterprise/orgs/:id/members/:profile_id
pub async fn remove_member(
    State(pool): State<PgPool>,
    Path((org_id, profile_id)): Path<(Uuid, Uuid)>,
) -> Result<StatusCode, StatusCode> {
    // Cannot remove the org owner
    let is_owner: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM organisations WHERE id = $1 AND owner_id = $2)"
    )
    .bind(org_id)
    .bind(profile_id)
    .fetch_one(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if is_owner {
        return Err(StatusCode::UNPROCESSABLE_ENTITY);
    }

    sqlx::query("DELETE FROM org_members WHERE org_id = $1 AND profile_id = $2")
        .bind(org_id)
        .bind(profile_id)
        .execute(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(StatusCode::NO_CONTENT)
}

/// GET /enterprise/orgs/:id/api-keys
pub async fn list_api_keys(
    State(pool): State<PgPool>,
    Path(org_id): Path<Uuid>,
) -> Result<Json<Vec<ApiKeyResponse>>, StatusCode> {
    let rows: Vec<(Uuid, String, String, chrono::DateTime<chrono::Utc>, Option<chrono::DateTime<chrono::Utc>>)> =
        sqlx::query_as(
            "SELECT id, label, key_hash, created_at, last_used_at
             FROM org_api_keys
             WHERE org_id = $1 AND revoked_at IS NULL
             ORDER BY created_at DESC"
        )
        .bind(org_id)
        .fetch_all(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let keys = rows.into_iter().map(|(id, label, hash, created, last_used)| {
        // Show only first 8 chars of hash as preview
        let preview = format!("{}...", &hash[..hash.len().min(8)]);
        ApiKeyResponse {
            id: id.to_string(),
            label,
            key_preview: preview,
            created_at: created.to_rfc3339(),
            last_used_at: last_used.map(|d| d.to_rfc3339()),
        }
    }).collect();

    Ok(Json(keys))
}

/// POST /enterprise/orgs/:id/api-keys
pub async fn create_api_key(
    State(pool): State<PgPool>,
    Path(org_id): Path<Uuid>,
    Json(body): Json<CreateKeyBody>,
) -> Result<(StatusCode, Json<CreatedKeyResponse>), StatusCode> {
    let created_by = Uuid::parse_str(&body.created_by)
        .map_err(|_| StatusCode::BAD_REQUEST)?;

    // Generate raw key: prefix + UUID v7
    let raw_key = format!("ask_{}", Uuid::now_v7().to_string().replace('-', ""));

    // Hash it with Blake3
    let mut hasher = Hasher::new();
    hasher.update(raw_key.as_bytes());
    let key_hash = hasher.finalize().to_hex().to_string();

    let key_id: Uuid = sqlx::query_scalar(
        "INSERT INTO org_api_keys (org_id, label, key_hash, created_by)
         VALUES ($1, $2, $3, $4)
         RETURNING id"
    )
    .bind(org_id)
    .bind(&body.label)
    .bind(&key_hash)
    .bind(created_by)
    .fetch_one(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok((StatusCode::CREATED, Json(CreatedKeyResponse {
        id: key_id.to_string(),
        label: body.label,
        raw_key, // shown ONCE — never stored raw
    })))
}

/// DELETE /enterprise/orgs/:id/api-keys/:kid
pub async fn revoke_api_key(
    State(pool): State<PgPool>,
    Path((_org_id, key_id)): Path<(Uuid, Uuid)>,
) -> Result<StatusCode, StatusCode> {
    sqlx::query(
        "UPDATE org_api_keys SET revoked_at = NOW() WHERE id = $1 AND revoked_at IS NULL"
    )
    .bind(key_id)
    .execute(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(StatusCode::NO_CONTENT)
}

// ── Admin endpoint ─────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct AdminOrgRow {
    pub id: String,
    pub name: String,
    pub owner_email: String,
    pub plan_tier: String,
    pub member_count: i64,
    pub contract_value_cents: i64,
    pub renewal_date: Option<String>,
    pub created_at: String,
}

/// GET /admin/enterprises
pub async fn admin_list_orgs(
    State(pool): State<PgPool>,
) -> Result<Json<Vec<AdminOrgRow>>, StatusCode> {
    let rows: Vec<(Uuid, String, String, String, i64, i64, Option<chrono::NaiveDate>, chrono::DateTime<chrono::Utc>)> =
        sqlx::query_as(
            "SELECT o.id, o.name, up.email, o.plan_tier::TEXT,
                    COUNT(om.id) AS member_count,
                    o.contract_value_cents, o.renewal_date, o.created_at
             FROM organisations o
             JOIN unified_profiles up ON up.id = o.owner_id
             LEFT JOIN org_members om ON om.org_id = o.id
             GROUP BY o.id, o.name, o.plan_tier, o.contract_value_cents, o.renewal_date, o.created_at, up.email
             ORDER BY o.created_at DESC"
        )
        .fetch_all(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let orgs = rows.into_iter().map(|(id, name, email, tier, count, cv, renewal, created)| {
        AdminOrgRow {
            id: id.to_string(),
            name,
            owner_email: email,
            plan_tier: tier,
            member_count: count,
            contract_value_cents: cv,
            renewal_date: renewal.map(|d| d.to_string()),
            created_at: created.to_rfc3339(),
        }
    }).collect();

    Ok(Json(orgs))
}

// ── Internal helper ────────────────────────────────────────────────────────

async fn fetch_org_response(pool: &PgPool, org_id: Uuid) -> Result<OrgResponse, sqlx::Error> {
    let row: (Uuid, String, Uuid, String, i64, Option<chrono::NaiveDate>, i32, i32,
              Option<String>, Option<String>, Option<String>, chrono::DateTime<chrono::Utc>) =
        sqlx::query_as(
            "SELECT o.id, o.name, o.owner_id, o.plan_tier::TEXT,
                    o.contract_value_cents, o.renewal_date,
                    o.veto_window_seconds, o.custom_escrow_platform_pct,
                    o.csm_name, o.csm_email, o.csm_response_sla, o.created_at
             FROM organisations o
             WHERE o.id = $1"
        )
        .bind(org_id)
        .fetch_one(pool)
        .await?;

    let member_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM org_members WHERE org_id = $1"
    )
    .bind(org_id)
    .fetch_one(pool)
    .await
    .map_err(|e| sqlx::Error::Protocol(format!("member_count: {e}")))?;

    Ok(OrgResponse {
        id: row.0.to_string(),
        name: row.1,
        owner_id: row.2.to_string(),
        plan_tier: row.3,
        contract_value_cents: row.4,
        renewal_date: row.5.map(|d| d.to_string()),
        veto_window_seconds: row.6,
        custom_escrow_platform_pct: row.7,
        csm_name: row.8,
        csm_email: row.9,
        csm_response_sla: row.10,
        member_count,
        created_at: row.11.to_rfc3339(),
    })
}
```

- [ ] **Step 2: Cargo check**

```bash
cd /d/AiStaffApp
SQLX_OFFLINE=true cargo check -p identity_service 2>&1 | tail -20
```
Expected: No errors (or only "not used" warnings — acceptable).

- [ ] **Step 3: Commit**

```bash
git add crates/identity_service/src/enterprise_handlers.rs
git commit -m "feat(enterprise): identity_service enterprise_handlers — org CRUD, invite, members, API keys"
```

---

## Task 3: Identity Service — Register Enterprise Routes

**Files:**
- Modify: `crates/identity_service/src/main.rs`

- [ ] **Step 1: Read current main.rs to find route registration block**

Read `crates/identity_service/src/main.rs` lines 1–120.

- [ ] **Step 2: Add enterprise_handlers module + routes**

After the existing `mod admin_handlers;` line, add:
```rust
mod enterprise_handlers;
```

After the last `.route("/admin/users/{id}/set-tier", ...)` line, add:
```rust
// Enterprise org routes
.route("/enterprise/orgs-create",                        post(enterprise_handlers::create_org_full))
.route("/enterprise/orgs/my",                            get(enterprise_handlers::get_my_org))
.route("/enterprise/orgs/{id}",                          get(enterprise_handlers::get_org)
                                                        .patch(enterprise_handlers::update_org))
.route("/enterprise/orgs/{id}/invite",                   post(enterprise_handlers::invite_member))
.route("/enterprise/orgs/{id}/members",                  get(enterprise_handlers::list_members))
.route("/enterprise/orgs/{id}/members/{profile_id}",     delete(enterprise_handlers::remove_member))
.route("/enterprise/orgs/{id}/api-keys",                 get(enterprise_handlers::list_api_keys)
                                                        .post(enterprise_handlers::create_api_key))
.route("/enterprise/orgs/{id}/api-keys/{kid}",           delete(enterprise_handlers::revoke_api_key))
.route("/enterprise/invites/{token}/accept",             post(enterprise_handlers::accept_invite))
// Admin enterprise route
.route("/admin/enterprises",                             get(enterprise_handlers::admin_list_orgs))
```

- [ ] **Step 3: Cargo check**

```bash
SQLX_OFFLINE=true cargo check -p identity_service 2>&1 | tail -20
```
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add crates/identity_service/src/main.rs
git commit -m "feat(enterprise): register enterprise + admin/enterprises routes in identity_service"
```

---

## Task 4: Marketplace Service — Enterprise Handlers

**Files:**
- Create: `crates/marketplace_service/src/enterprise_handlers.rs`

- [ ] **Step 1: Create the file**

```rust
// crates/marketplace_service/src/enterprise_handlers.rs
// NOTE: marketplace_service uses Arc<AppState> — NOT FromRef<AppState> for PgPool.
// Always use `State(state): State<Arc<AppState>>` and access `&state.db`.
use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::Serialize;
use std::sync::Arc;
use uuid::Uuid;
use crate::handlers::AppState;

#[derive(Serialize)]
pub struct OrgDeploymentRow {
    pub id: String,
    pub listing_title: Option<String>,
    pub deployment_type: String,
    pub status: String,
    pub escrow_amount_cents: i64,
    pub created_at: String,
    pub org_id: String,
}

#[derive(Serialize)]
pub struct OrgAnalytics {
    pub org_id: String,
    pub total_deployments: i64,
    pub active_deployments: i64,
    pub total_spend_cents: i64,
    pub avg_dod_pass_rate: f64,
    pub drift_incidents_30d: i64,
}

/// GET /enterprise/orgs/:id/deployments
pub async fn list_org_deployments(
    State(state): State<Arc<AppState>>,
    Path(org_id): Path<Uuid>,
) -> Result<Json<Vec<OrgDeploymentRow>>, StatusCode> {
    // Column is `state` (deployment_status enum), NOT `status`
    let rows: Vec<(Uuid, Option<String>, String, String, i64, chrono::DateTime<chrono::Utc>, Uuid)> =
        sqlx::query_as(
            "SELECT d.id, al.title, d.deployment_type::TEXT,
                    d.state::TEXT AS status, d.escrow_amount_cents, d.created_at, d.org_id
             FROM deployments d
             LEFT JOIN agent_listings al ON al.id = d.listing_id
             WHERE d.org_id = $1
             ORDER BY d.created_at DESC
             LIMIT 100"
        )
        .bind(org_id)
        .fetch_all(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let deployments = rows.into_iter().map(|(id, title, dtype, status, escrow, created, oid)| {
        OrgDeploymentRow {
            id: id.to_string(),
            listing_title: title,
            deployment_type: dtype,
            status,
            escrow_amount_cents: escrow,
            created_at: created.to_rfc3339(),
            org_id: oid.to_string(),
        }
    }).collect();

    Ok(Json(deployments))
}

/// GET /enterprise/orgs/:id/analytics
pub async fn org_analytics(
    State(state): State<Arc<AppState>>,
    Path(org_id): Path<Uuid>,
) -> Result<Json<OrgAnalytics>, StatusCode> {
    // Valid terminal states: RELEASED, VETOED, FAILED — NOT 'COMPLETED' (not a valid enum value)
    // Column is `state` (deployment_status enum), NOT `status`
    let (total, active, spend): (i64, i64, i64) = sqlx::query_as(
        "SELECT
            COUNT(*)                                                                      AS total,
            COUNT(*) FILTER (WHERE state NOT IN ('VETOED', 'RELEASED', 'FAILED'))        AS active,
            COALESCE(SUM(escrow_amount_cents), 0)                                        AS spend
         FROM deployments
         WHERE org_id = $1"
    )
    .bind(org_id)
    .fetch_one(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // DoD pass rate: approved steps / total steps across org deployments
    let (passed, total_steps): (i64, i64) = sqlx::query_as(
        "SELECT
            COUNT(*) FILTER (WHERE dcs.approved_at IS NOT NULL) AS passed,
            COUNT(*)                                             AS total_steps
         FROM dod_checklist_steps dcs
         JOIN deployments d ON d.id = dcs.deployment_id
         WHERE d.org_id = $1"
    )
    .bind(org_id)
    .fetch_one(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let avg_pass = if total_steps > 0 {
        (passed as f64 / total_steps as f64) * 100.0
    } else {
        0.0
    };

    // Drift incidents in last 30 days
    let drift: i64 = sqlx::query_scalar(
        "SELECT COUNT(de.id)
         FROM drift_events de
         JOIN deployments d ON d.id = de.deployment_id
         WHERE d.org_id = $1
           AND de.detected_at > NOW() - INTERVAL '30 days'"
    )
    .bind(org_id)
    .fetch_one(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(OrgAnalytics {
        org_id: org_id.to_string(),
        total_deployments: total,
        active_deployments: active,
        total_spend_cents: spend,
        avg_dod_pass_rate: (avg_pass * 10.0).round() / 10.0,
        drift_incidents_30d: drift,
    }))
}
```

- [ ] **Step 2: Register routes in marketplace_service/src/main.rs**

Add `mod enterprise_handlers;` after existing `mod` declarations.

After existing admin routes and **before** `.with_state(state)`, add:
```rust
.route("/enterprise/orgs/{id}/deployments", get(enterprise_handlers::list_org_deployments))
.route("/enterprise/orgs/{id}/analytics",   get(enterprise_handlers::org_analytics))
```

- [ ] **Step 3: Cargo check**

```bash
SQLX_OFFLINE=true cargo check -p marketplace_service 2>&1 | tail -20
```
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add crates/marketplace_service/src/enterprise_handlers.rs crates/marketplace_service/src/main.rs
git commit -m "feat(enterprise): marketplace_service org deployments + analytics endpoints"
```

---

## Task 5: Frontend — enterpriseApi.ts + Proxy Routes

**Files:**
- Create: `apps/web/lib/enterpriseApi.ts`
- Create: `apps/web/app/api/enterprise/orgs/route.ts`
- Create: `apps/web/app/api/enterprise/orgs/[id]/route.ts`
- Create: `apps/web/app/api/enterprise/orgs/[id]/invite/route.ts`
- Create: `apps/web/app/api/enterprise/orgs/[id]/members/route.ts`
- Create: `apps/web/app/api/enterprise/orgs/[id]/members/[pid]/route.ts`
- Create: `apps/web/app/api/enterprise/orgs/[id]/api-keys/route.ts`
- Create: `apps/web/app/api/enterprise/orgs/[id]/api-keys/[kid]/route.ts`
- Create: `apps/web/app/api/enterprise/orgs/[id]/analytics/route.ts`
- Create: `apps/web/app/api/enterprise/orgs/[id]/deployments/route.ts`
- Create: `apps/web/app/api/enterprise/invites/[token]/accept/route.ts`

- [ ] **Step 1: Create enterpriseApi.ts**

```typescript
// apps/web/lib/enterpriseApi.ts
const IS_SERVER = typeof window === "undefined";
const IDENTITY = process.env.IDENTITY_SERVICE_URL ?? "http://localhost:3001";
const MARKET   = process.env.MARKETPLACE_SERVICE_URL ?? "http://localhost:3002";

function base(svc: "identity" | "market"): string {
  if (IS_SERVER) return svc === "identity" ? IDENTITY : MARKET;
  return "/api/enterprise";
}

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, cache: "no-store" });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  if (r.status === 204) return {} as T;
  return r.json();
}

// ── Types ──────────────────────────────────────────────────────────────────

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
  display_name: string | null;
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

// ── Org CRUD ───────────────────────────────────────────────────────────────

export function createOrg(owner_id: string, name: string, plan_tier?: string): Promise<OrgResponse> {
  return req(`${base("identity")}/orgs-create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ owner_id, name, plan_tier: plan_tier ?? "GROWTH" }),
  });
}

export function getMyOrg(profile_id: string): Promise<OrgResponse> {
  return req(`${base("identity")}/orgs/my?profile_id=${profile_id}`);
}

export function getOrg(id: string): Promise<OrgResponse> {
  return req(`${base("identity")}/orgs/${id}`);
}

export function updateOrg(id: string, body: Partial<{
  name: string; csm_name: string; csm_email: string; csm_response_sla: string;
  veto_window_seconds: number; contract_value_cents: number; renewal_date: string; plan_tier: string;
}>): Promise<OrgResponse> {
  return req(`${base("identity")}/orgs/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── Members ────────────────────────────────────────────────────────────────

export function inviteMember(org_id: string, invitee_email: string, inviter_profile_id: string): Promise<InviteResponse> {
  return req(`${base("identity")}/orgs/${org_id}/invite`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ invitee_email, inviter_profile_id }),
  });
}

export function acceptInvite(token: string, profile_id: string): Promise<void> {
  return req(`${base("identity")}/invites/${token}/accept`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profile_id }),
  });
}

export function listMembers(org_id: string): Promise<OrgMember[]> {
  return req(`${base("identity")}/orgs/${org_id}/members`);
}

export function removeMember(org_id: string, profile_id: string): Promise<void> {
  return req(`${base("identity")}/orgs/${org_id}/members/${profile_id}`, { method: "DELETE" });
}

// ── API Keys ───────────────────────────────────────────────────────────────

export function listApiKeys(org_id: string): Promise<ApiKey[]> {
  return req(`${base("identity")}/orgs/${org_id}/api-keys`);
}

export function createApiKey(org_id: string, label: string, created_by: string): Promise<CreatedKey> {
  return req(`${base("identity")}/orgs/${org_id}/api-keys`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ label, created_by }),
  });
}

export function revokeApiKey(org_id: string, key_id: string): Promise<void> {
  return req(`${base("identity")}/orgs/${org_id}/api-keys/${key_id}`, { method: "DELETE" });
}

// ── Analytics & Deployments ────────────────────────────────────────────────

export function getOrgAnalytics(org_id: string): Promise<OrgAnalytics> {
  return req(`${base("market")}/orgs/${org_id}/analytics`);
}

export function listOrgDeployments(org_id: string): Promise<OrgDeployment[]> {
  return req(`${base("market")}/orgs/${org_id}/deployments`);
}

// ── Admin ──────────────────────────────────────────────────────────────────

export function adminListOrgs(): Promise<AdminOrgRow[]> {
  const url = IS_SERVER
    ? `${IDENTITY}/admin/enterprises`
    : "/api/admin/enterprises";
  return req(url);
}
```

- [ ] **Step 2: Create proxy routes**

**`apps/web/app/api/enterprise/orgs/route.ts`**
```typescript
import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";

const IDENTITY = process.env.IDENTITY_SERVICE_URL ?? "http://localhost:3001";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const r = await fetch(`${IDENTITY}/enterprise/orgs-create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  return NextResponse.json(data, { status: r.status });
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const profileId = req.nextUrl.searchParams.get("profile_id");
  const r = await fetch(`${IDENTITY}/enterprise/orgs/my?profile_id=${profileId}`);
  const data = await r.json().catch(() => ({}));
  return NextResponse.json(data, { status: r.status });
}
```

**`apps/web/app/api/enterprise/orgs/[id]/route.ts`**
```typescript
import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
const IDENTITY = process.env.IDENTITY_SERVICE_URL ?? "http://localhost:3001";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const r = await fetch(`${IDENTITY}/enterprise/orgs/${id}`);
  return NextResponse.json(await r.json().catch(() => ({})), { status: r.status });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const r = await fetch(`${IDENTITY}/enterprise/orgs/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return NextResponse.json(await r.json().catch(() => ({})), { status: r.status });
}
```

**`apps/web/app/api/enterprise/orgs/[id]/invite/route.ts`**
```typescript
import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
const IDENTITY = process.env.IDENTITY_SERVICE_URL ?? "http://localhost:3001";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const r = await fetch(`${IDENTITY}/enterprise/orgs/${id}/invite`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return NextResponse.json(await r.json().catch(() => ({})), { status: r.status });
}
```

**`apps/web/app/api/enterprise/orgs/[id]/members/route.ts`**
```typescript
import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
const IDENTITY = process.env.IDENTITY_SERVICE_URL ?? "http://localhost:3001";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const r = await fetch(`${IDENTITY}/enterprise/orgs/${id}/members`);
  return NextResponse.json(await r.json().catch(() => []), { status: r.status });
}
```

**`apps/web/app/api/enterprise/orgs/[id]/members/[pid]/route.ts`**
```typescript
import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
const IDENTITY = process.env.IDENTITY_SERVICE_URL ?? "http://localhost:3001";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; pid: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, pid } = await params;
  const r = await fetch(`${IDENTITY}/enterprise/orgs/${id}/members/${pid}`, { method: "DELETE" });
  return new NextResponse(null, { status: r.status });
}
```

**`apps/web/app/api/enterprise/orgs/[id]/api-keys/route.ts`**
```typescript
import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
const IDENTITY = process.env.IDENTITY_SERVICE_URL ?? "http://localhost:3001";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const r = await fetch(`${IDENTITY}/enterprise/orgs/${id}/api-keys`);
  return NextResponse.json(await r.json().catch(() => []), { status: r.status });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const r = await fetch(`${IDENTITY}/enterprise/orgs/${id}/api-keys`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return NextResponse.json(await r.json().catch(() => ({})), { status: r.status });
}
```

**`apps/web/app/api/enterprise/orgs/[id]/api-keys/[kid]/route.ts`**
```typescript
import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
const IDENTITY = process.env.IDENTITY_SERVICE_URL ?? "http://localhost:3001";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; kid: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, kid } = await params;
  const r = await fetch(`${IDENTITY}/enterprise/orgs/${id}/api-keys/${kid}`, { method: "DELETE" });
  return new NextResponse(null, { status: r.status });
}
```

**`apps/web/app/api/enterprise/orgs/[id]/analytics/route.ts`**
```typescript
import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
const MARKET = process.env.MARKETPLACE_SERVICE_URL ?? "http://localhost:3002";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const r = await fetch(`${MARKET}/enterprise/orgs/${id}/analytics`);
  return NextResponse.json(await r.json().catch(() => ({})), { status: r.status });
}
```

**`apps/web/app/api/enterprise/orgs/[id]/deployments/route.ts`**
```typescript
import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
const MARKET = process.env.MARKETPLACE_SERVICE_URL ?? "http://localhost:3002";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const r = await fetch(`${MARKET}/enterprise/orgs/${id}/deployments`);
  return NextResponse.json(await r.json().catch(() => []), { status: r.status });
}
```

**`apps/web/app/api/enterprise/invites/[token]/accept/route.ts`**
```typescript
import { NextRequest, NextResponse } from "next/server";
const IDENTITY = process.env.IDENTITY_SERVICE_URL ?? "http://localhost:3001";

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await req.json();
  const r = await fetch(`${IDENTITY}/enterprise/invites/${token}/accept`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return new NextResponse(null, { status: r.status });
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/enterpriseApi.ts apps/web/app/api/enterprise/
git commit -m "feat(enterprise): enterpriseApi.ts + Next.js proxy routes"
```

---

## Task 6: Frontend — /enterprise/setup Page

**Files:**
- Create: `apps/web/app/enterprise/setup/page.tsx`

- [ ] **Step 1: Create the setup wizard**

```tsx
// apps/web/app/enterprise/setup/page.tsx
"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Building2, ChevronRight, Loader2 } from "lucide-react";
import { createOrg } from "@/lib/enterpriseApi";

const PLAN_TIERS = [
  {
    id: "GROWTH",
    label: "Growth",
    price: "Custom",
    features: ["Up to 5 seats", "Standard veto window (30s)", "Email support", "Basic analytics"],
  },
  {
    id: "ENTERPRISE",
    label: "Enterprise",
    price: "Custom",
    features: ["Up to 25 seats", "Configurable veto window", "Dedicated CSM", "Full analytics + ROI"],
    highlight: true,
  },
  {
    id: "PLATINUM",
    label: "Platinum",
    price: "Custom",
    features: ["Unlimited seats", "Custom escrow splits", "★ Platinum SLA (< 1 hr)", "MCP API access"],
  },
];

export default function EnterpriseSetup() {
  const { data: session } = useSession();
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [tier, setTier] = useState("ENTERPRISE");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const profileId = (session?.user as { profileId?: string })?.profileId;

  async function handleCreate() {
    if (!profileId || !name.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await createOrg(profileId, name.trim(), tier);
      router.push("/enterprise");
    } catch {
      setError("Failed to create organisation. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="w-full max-w-2xl space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Building2 className="text-amber-400" size={20} />
          <h1 className="text-base font-semibold text-zinc-50">Set up your organisation</h1>
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-sm p-4 space-y-3">
              <label className="block text-xs text-zinc-400">Organisation name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Acme Financial Group"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-sm px-3 py-2 text-sm text-zinc-50 placeholder:text-zinc-600 focus:outline-none focus:border-amber-400"
              />
            </div>
            <button
              onClick={() => name.trim() && setStep(2)}
              disabled={!name.trim()}
              className="w-full flex items-center justify-center gap-2 bg-amber-400 text-zinc-950 text-sm font-medium px-4 py-2.5 rounded-sm hover:bg-amber-300 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Continue <ChevronRight size={14} />
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <p className="text-xs text-zinc-400">Select a plan tier — all pricing is custom. Our team will contact you.</p>
            <div className="grid gap-3">
              {PLAN_TIERS.map(pt => (
                <button
                  key={pt.id}
                  onClick={() => setTier(pt.id)}
                  className={`w-full text-left p-4 border rounded-sm space-y-2 transition-colors ${
                    tier === pt.id
                      ? "border-amber-400 bg-amber-950/20"
                      : "border-zinc-800 bg-zinc-900 hover:border-zinc-700"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-zinc-50">{pt.label}</span>
                    {pt.highlight && (
                      <span className="font-mono text-[10px] px-2 py-0.5 rounded-sm border border-amber-700 text-amber-400 bg-amber-950/30">
                        RECOMMENDED
                      </span>
                    )}
                  </div>
                  <ul className="space-y-1">
                    {pt.features.map(f => (
                      <li key={f} className="text-xs text-zinc-400 flex items-center gap-1.5">
                        <span className="text-emerald-500">✓</span> {f}
                      </li>
                    ))}
                  </ul>
                </button>
              ))}
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <div className="flex gap-3">
              <button
                onClick={() => setStep(1)}
                className="flex-1 border border-zinc-700 text-zinc-400 text-sm px-4 py-2.5 rounded-sm hover:border-zinc-500"
              >
                Back
              </button>
              <button
                onClick={handleCreate}
                disabled={loading}
                className="flex-1 flex items-center justify-center gap-2 bg-amber-400 text-zinc-950 text-sm font-medium px-4 py-2.5 rounded-sm hover:bg-amber-300 disabled:opacity-60"
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : null}
                Create organisation
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/app/enterprise/setup/
git commit -m "feat(enterprise): setup wizard — create org with plan tier selection"
```

---

## Task 7: Frontend — Wire /enterprise/page.tsx to Real API

**Files:**
- Modify: `apps/web/app/enterprise/page.tsx`

- [ ] **Step 1: Read the current page**

Read `apps/web/app/enterprise/page.tsx` completely.

- [ ] **Step 2: Replace demo data with real API calls**

The page is `"use client"` with hardcoded `ORG` and `SLA_KPIS`. Replace with:

```tsx
// apps/web/app/enterprise/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Building2, Shield, Users, HeadphonesIcon, AlertTriangle,
  CheckCircle, ChevronRight, Clock, TrendingUp, Zap, Mail, Calendar, Loader2,
} from "lucide-react";
import { getMyOrg, getOrgAnalytics, listMembers, OrgResponse, OrgAnalytics, OrgMember } from "@/lib/enterpriseApi";

type SupportTier = "GROWTH" | "ENTERPRISE" | "PLATINUM";
type SlaHealth   = "ON-TRACK" | "AT-RISK" | "BREACHED";

interface KpiData { label: string; target: string; actual: string; health: SlaHealth; }

function healthStyle(h: SlaHealth) {
  if (h === "ON-TRACK") return { border: "border-green-800", text: "text-green-400", bg: "bg-green-950/30" };
  if (h === "AT-RISK")  return { border: "border-amber-800", text: "text-amber-400", bg: "bg-amber-950/30" };
  return                       { border: "border-red-900",   text: "text-red-400",   bg: "bg-red-950/30"   };
}

function SupportTierBadge({ tier }: { tier: SupportTier }) {
  const style =
    tier === "PLATINUM" ? "border-violet-800 text-violet-400 bg-violet-950/30" :
    tier === "ENTERPRISE" ? "border-amber-800 text-amber-400 bg-amber-950/30" :
    "border-zinc-700 text-zinc-400 bg-zinc-900";
  const label =
    tier === "PLATINUM" ? "★ PLATINUM" : tier === "ENTERPRISE" ? "● ENTERPRISE" : "● GROWTH";
  return (
    <span className={`font-mono text-[10px] px-2 py-0.5 rounded-sm border ${style}`}>{label}</span>
  );
}

function KpiTile({ kpi }: { kpi: KpiData }) {
  const s = healthStyle(kpi.health);
  return (
    <div className={`border rounded-sm p-3 space-y-1.5 ${s.border} ${s.bg}`}>
      <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">{kpi.label}</p>
      <p className={`font-mono text-xl font-medium tabular-nums ${s.text}`}>{kpi.actual}</p>
      <div className="flex items-center justify-between">
        <span className="font-mono text-[9px] text-zinc-600">Target: {kpi.target}</span>
        <span className={`font-mono text-[9px] px-1 py-0.5 rounded-sm border ${s.border} ${s.text}`}>
          {kpi.health}
        </span>
      </div>
    </div>
  );
}

export default function EnterpriseDashboard() {
  const { data: session } = useSession();
  const router = useRouter();
  const profileId = (session?.user as { profileId?: string })?.profileId;

  const [org, setOrg]           = useState<OrgResponse | null>(null);
  const [analytics, setAnalytics] = useState<OrgAnalytics | null>(null);
  const [members, setMembers]   = useState<OrgMember[]>([]);
  const [loading, setLoading]   = useState(true);
  const [noOrg, setNoOrg]       = useState(false);

  useEffect(() => {
    if (!profileId) return;
    Promise.all([
      getMyOrg(profileId).catch(() => null),
    ]).then(([orgData]) => {
      if (!orgData) { setNoOrg(true); setLoading(false); return; }
      setOrg(orgData);
      return Promise.all([
        getOrgAnalytics(orgData.id).catch(() => null),
        listMembers(orgData.id).catch(() => []),
      ]);
    }).then((results) => {
      if (!results) return;
      const [analyticsData, membersData] = results;
      if (analyticsData) setAnalytics(analyticsData);
      setMembers(membersData as OrgMember[]);
    }).finally(() => setLoading(false));
  }, [profileId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="animate-spin text-amber-400" size={20} />
      </div>
    );
  }

  if (noOrg) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
        <div className="text-center space-y-4">
          <Building2 className="mx-auto text-zinc-600" size={32} />
          <p className="text-sm text-zinc-400">You don&apos;t have an organisation yet.</p>
          <button
            onClick={() => router.push("/enterprise/setup")}
            className="px-4 py-2 bg-amber-400 text-zinc-950 text-sm font-medium rounded-sm hover:bg-amber-300"
          >
            Create organisation
          </button>
        </div>
      </div>
    );
  }

  if (!org) return null;

  const kpis: KpiData[] = [
    {
      label: "Active Deployments",
      target: "—",
      actual: String(analytics?.active_deployments ?? 0),
      health: "ON-TRACK",
    },
    {
      label: "DoD Pass Rate",
      target: "95%",
      actual: `${analytics?.avg_dod_pass_rate ?? 0}%`,
      health: (analytics?.avg_dod_pass_rate ?? 0) >= 95 ? "ON-TRACK"
            : (analytics?.avg_dod_pass_rate ?? 0) >= 80 ? "AT-RISK" : "BREACHED",
    },
    {
      label: "Drift Incidents (30d)",
      target: "0",
      actual: String(analytics?.drift_incidents_30d ?? 0),
      health: (analytics?.drift_incidents_30d ?? 0) === 0 ? "ON-TRACK"
            : (analytics?.drift_incidents_30d ?? 0) <= 2 ? "AT-RISK" : "BREACHED",
    },
    {
      label: "Total Spend",
      target: "—",
      actual: `$${((analytics?.total_spend_cents ?? 0) / 100).toLocaleString()}`,
      health: "ON-TRACK",
    },
  ];

  const contractFormatted = org.contract_value_cents > 0
    ? `$${(org.contract_value_cents / 100).toLocaleString()} / yr`
    : "—";

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Building2 className="text-amber-400" size={16} />
              <h1 className="text-base font-semibold">{org.name}</h1>
              <SupportTierBadge tier={org.plan_tier as SupportTier} />
            </div>
            <p className="text-xs text-zinc-500">
              {org.member_count} member{org.member_count !== 1 ? "s" : ""} ·
              Contract: {contractFormatted} ·
              {org.renewal_date ? ` Renews ${org.renewal_date}` : " No renewal date set"}
            </p>
          </div>
          <a href="/enterprise/members" className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300">
            Manage team <ChevronRight size={12} />
          </a>
        </div>

        {/* SLA KPIs */}
        <div>
          <h2 className="text-xs font-medium text-zinc-400 uppercase tracking-widest mb-3">SLA Health</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {kpis.map(k => <KpiTile key={k.label} kpi={k} />)}
          </div>
        </div>

        {/* Team */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-medium text-zinc-400 uppercase tracking-widest">Team</h2>
            <a href="/enterprise/members" className="text-xs text-amber-400 hover:text-amber-300">
              View all
            </a>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-sm divide-y divide-zinc-800">
            {members.slice(0, 5).map(m => (
              <div key={m.profile_id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="w-7 h-7 rounded-sm bg-zinc-800 border border-zinc-700 flex items-center justify-center flex-shrink-0">
                  <span className="font-mono text-xs text-zinc-300">
                    {(m.display_name ?? m.email)[0].toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-zinc-200 truncate">{m.display_name ?? m.email}</p>
                  <p className="text-[10px] text-zinc-500">{m.member_role}</p>
                </div>
                <span className={`font-mono text-[10px] ${
                  m.identity_tier === "BIOMETRIC_VERIFIED" ? "text-emerald-400" :
                  m.identity_tier === "SOCIAL_VERIFIED" ? "text-sky-400" : "text-zinc-500"
                }`}>
                  T{m.identity_tier === "BIOMETRIC_VERIFIED" ? 2 : m.identity_tier === "SOCIAL_VERIFIED" ? 1 : 0}
                </span>
              </div>
            ))}
            {members.length === 0 && (
              <p className="px-4 py-3 text-xs text-zinc-500">No members yet.</p>
            )}
          </div>
        </div>

        {/* CSM */}
        {org.csm_name && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-sm p-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs font-medium text-zinc-50">Dedicated Success Manager</p>
                <p className="text-xs text-zinc-400">{org.csm_name}</p>
                {org.csm_email && (
                  <p className="font-mono text-[10px] text-zinc-500">{org.csm_email}</p>
                )}
                {org.csm_response_sla && (
                  <p className="text-[10px] text-zinc-500">Response SLA: {org.csm_response_sla}</p>
                )}
              </div>
              <HeadphonesIcon className="text-amber-400 flex-shrink-0" size={16} />
            </div>
            {org.csm_email && (
              <a
                href={`mailto:${org.csm_email}`}
                className="mt-3 flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300"
              >
                <Mail size={12} /> Escalate to CSM
              </a>
            )}
          </div>
        )}

        {/* Quick links */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { href: "/enterprise/members",  label: "Team & Invites",  icon: Users      },
            { href: "/enterprise/api-keys",  label: "API Keys",        icon: Shield     },
            { href: "/enterprise/sla",       label: "SLA Dashboard",   icon: TrendingUp },
            { href: "/admin/deployments",    label: "Deployments",     icon: Zap        },
          ].map(({ href, label, icon: Icon }) => (
            <a key={href} href={href}
              className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-sm px-4 py-3 text-sm text-zinc-300 hover:border-zinc-700 hover:text-zinc-50"
            >
              <Icon size={14} className="text-amber-400" /> {label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/enterprise/page.tsx
git commit -m "feat(enterprise): wire /enterprise dashboard to real org + analytics API"
```

---

## Task 8: Frontend — /enterprise/members Page

**Files:**
- Create: `apps/web/app/enterprise/members/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
// apps/web/app/enterprise/members/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Users, UserMinus, Mail, Loader2, ChevronLeft } from "lucide-react";
import { getMyOrg, listMembers, inviteMember, removeMember, OrgMember } from "@/lib/enterpriseApi";

export default function EnterpriseMembers() {
  const { data: session } = useSession();
  const profileId = (session?.user as { profileId?: string })?.profileId;

  const [orgId, setOrgId]       = useState<string | null>(null);
  const [members, setMembers]   = useState<OrgMember[]>([]);
  const [loading, setLoading]   = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  async function load() {
    if (!profileId) return;
    const org = await getMyOrg(profileId).catch(() => null);
    if (!org) { setLoading(false); return; }
    setOrgId(org.id);
    const mems = await listMembers(org.id).catch(() => []);
    setMembers(mems);
    setLoading(false);
  }

  useEffect(() => { load(); }, [profileId]);

  async function handleInvite() {
    if (!orgId || !profileId || !inviteEmail.trim()) return;
    setInviting(true);
    setInviteMsg(null);
    try {
      await inviteMember(orgId, inviteEmail.trim(), profileId);
      setInviteMsg(`Invite sent to ${inviteEmail.trim()}`);
      setInviteEmail("");
    } catch {
      setInviteMsg("Failed to send invite. Check email and try again.");
    } finally {
      setInviting(false);
    }
  }

  async function handleRemove(pid: string) {
    if (!orgId) return;
    setRemoving(pid);
    await removeMember(orgId, pid).catch(() => null);
    setMembers(m => m.filter(x => x.profile_id !== pid));
    setRemoving(null);
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 px-4 py-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <a href="/enterprise" className="text-zinc-500 hover:text-zinc-300">
            <ChevronLeft size={16} />
          </a>
          <Users className="text-amber-400" size={16} />
          <h1 className="text-base font-semibold">Team Members</h1>
        </div>

        {/* Invite form */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-sm p-4 space-y-3">
          <p className="text-xs font-medium text-zinc-300">Invite a new member</p>
          <div className="flex gap-2">
            <input
              type="email"
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              placeholder="colleague@company.com"
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-sm px-3 py-2 text-sm text-zinc-50 placeholder:text-zinc-600 focus:outline-none focus:border-amber-400"
            />
            <button
              onClick={handleInvite}
              disabled={inviting || !inviteEmail.trim()}
              className="flex items-center gap-1.5 px-4 py-2 bg-amber-400 text-zinc-950 text-sm font-medium rounded-sm hover:bg-amber-300 disabled:opacity-50"
            >
              {inviting ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />}
              Invite
            </button>
          </div>
          {inviteMsg && (
            <p className={`text-xs ${inviteMsg.startsWith("Failed") ? "text-red-400" : "text-emerald-400"}`}>
              {inviteMsg}
            </p>
          )}
        </div>

        {/* Members table */}
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="animate-spin text-amber-400" size={20} />
          </div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                  <th className="px-4 py-2">Member</th>
                  <th className="px-4 py-2">Role</th>
                  <th className="px-4 py-2">Tier</th>
                  <th className="px-4 py-2">Trust</th>
                  <th className="px-4 py-2">Joined</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {members.map(m => (
                  <tr key={m.profile_id} className="border-b border-zinc-800 last:border-0">
                    <td className="px-4 py-2.5">
                      <p className="text-zinc-200">{m.display_name ?? "—"}</p>
                      <p className="text-[10px] text-zinc-500">{m.email}</p>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded-sm border ${
                        m.member_role === "ADMIN"
                          ? "border-amber-700 text-amber-400"
                          : "border-zinc-700 text-zinc-400"
                      }`}>
                        {m.member_role}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[10px]">
                      <span className={
                        m.identity_tier === "BIOMETRIC_VERIFIED" ? "text-emerald-400" :
                        m.identity_tier === "SOCIAL_VERIFIED"    ? "text-sky-400"     : "text-zinc-500"
                      }>
                        {m.identity_tier === "BIOMETRIC_VERIFIED" ? "T2" :
                         m.identity_tier === "SOCIAL_VERIFIED"    ? "T1" : "T0"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-zinc-300">{m.trust_score}</td>
                    <td className="px-4 py-2.5 text-xs text-zinc-500">
                      {new Date(m.joined_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-2.5">
                      {m.member_role !== "ADMIN" && (
                        <button
                          onClick={() => handleRemove(m.profile_id)}
                          disabled={removing === m.profile_id}
                          className="text-zinc-500 hover:text-red-400"
                          title="Remove member"
                        >
                          {removing === m.profile_id
                            ? <Loader2 size={12} className="animate-spin" />
                            : <UserMinus size={12} />
                          }
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {members.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-xs text-zinc-500">
                      No members yet. Invite someone above.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/app/enterprise/members/
git commit -m "feat(enterprise): /enterprise/members — invite + remove team members"
```

---

## Task 9: Frontend — /enterprise/api-keys Page

**Files:**
- Create: `apps/web/app/enterprise/api-keys/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
// apps/web/app/enterprise/api-keys/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Shield, Plus, Trash2, Loader2, ChevronLeft, Copy, Eye } from "lucide-react";
import {
  getMyOrg, listApiKeys, createApiKey, revokeApiKey, ApiKey, CreatedKey,
} from "@/lib/enterpriseApi";

export default function EnterpriseApiKeys() {
  const { data: session } = useSession();
  const profileId = (session?.user as { profileId?: string })?.profileId;

  const [orgId, setOrgId]         = useState<string | null>(null);
  const [keys, setKeys]           = useState<ApiKey[]>([]);
  const [loading, setLoading]     = useState(true);
  const [label, setLabel]         = useState("");
  const [creating, setCreating]   = useState(false);
  const [newKey, setNewKey]       = useState<CreatedKey | null>(null);
  const [revoking, setRevoking]   = useState<string | null>(null);
  const [copied, setCopied]       = useState(false);

  async function load() {
    if (!profileId) return;
    const org = await getMyOrg(profileId).catch(() => null);
    if (!org) { setLoading(false); return; }
    setOrgId(org.id);
    const ks = await listApiKeys(org.id).catch(() => []);
    setKeys(ks);
    setLoading(false);
  }

  useEffect(() => { load(); }, [profileId]);

  async function handleCreate() {
    if (!orgId || !profileId || !label.trim()) return;
    setCreating(true);
    try {
      const created = await createApiKey(orgId, label.trim(), profileId);
      setNewKey(created);
      setLabel("");
      const refreshed = await listApiKeys(orgId).catch(() => []);
      setKeys(refreshed);
    } catch {
      // ignore — show no error state
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(kid: string) {
    if (!orgId) return;
    setRevoking(kid);
    await revokeApiKey(orgId, kid).catch(() => null);
    setKeys(k => k.filter(x => x.id !== kid));
    setRevoking(null);
  }

  function copyKey() {
    if (!newKey) return;
    navigator.clipboard.writeText(newKey.raw_key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 px-4 py-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <a href="/enterprise" className="text-zinc-500 hover:text-zinc-300">
            <ChevronLeft size={16} />
          </a>
          <Shield className="text-amber-400" size={16} />
          <h1 className="text-base font-semibold">API Keys</h1>
        </div>

        <p className="text-xs text-zinc-500">
          API keys grant programmatic access to AiStaff via the MCP server.
          Keys are shown in full <strong className="text-zinc-300">once</strong> — copy and store securely.
        </p>

        {/* New key banner */}
        {newKey && (
          <div className="border border-emerald-800 bg-emerald-950/30 rounded-sm p-4 space-y-2">
            <p className="text-xs font-medium text-emerald-400">Key created — copy it now. It won&apos;t be shown again.</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 font-mono text-xs text-zinc-200 bg-zinc-900 border border-zinc-700 rounded-sm px-3 py-2 break-all">
                {newKey.raw_key}
              </code>
              <button onClick={copyKey}
                className="flex items-center gap-1 px-3 py-2 bg-emerald-700 text-white text-xs rounded-sm hover:bg-emerald-600"
              >
                {copied ? "Copied!" : <><Copy size={12} /> Copy</>}
              </button>
            </div>
            <button onClick={() => setNewKey(null)} className="text-xs text-zinc-500 hover:text-zinc-300">
              Dismiss
            </button>
          </div>
        )}

        {/* Create key form */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-sm p-4 space-y-3">
          <p className="text-xs font-medium text-zinc-300">Generate new API key</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="e.g. n8n-automation, Claude-agent"
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-sm px-3 py-2 text-sm text-zinc-50 placeholder:text-zinc-600 focus:outline-none focus:border-amber-400"
            />
            <button
              onClick={handleCreate}
              disabled={creating || !label.trim()}
              className="flex items-center gap-1.5 px-4 py-2 bg-amber-400 text-zinc-950 text-sm font-medium rounded-sm hover:bg-amber-300 disabled:opacity-50"
            >
              {creating ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
              Generate
            </button>
          </div>
        </div>

        {/* Keys table */}
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="animate-spin text-amber-400" size={20} />
          </div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                  <th className="px-4 py-2">Label</th>
                  <th className="px-4 py-2">Key</th>
                  <th className="px-4 py-2">Created</th>
                  <th className="px-4 py-2">Last used</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {keys.map(k => (
                  <tr key={k.id} className="border-b border-zinc-800 last:border-0">
                    <td className="px-4 py-2.5 text-zinc-200">{k.label}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-zinc-400">{k.key_preview}</td>
                    <td className="px-4 py-2.5 text-xs text-zinc-500">
                      {new Date(k.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-zinc-500">
                      {k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : "Never"}
                    </td>
                    <td className="px-4 py-2.5">
                      <button
                        onClick={() => handleRevoke(k.id)}
                        disabled={revoking === k.id}
                        className="text-zinc-500 hover:text-red-400"
                        title="Revoke key"
                      >
                        {revoking === k.id
                          ? <Loader2 size={12} className="animate-spin" />
                          : <Trash2 size={12} />
                        }
                      </button>
                    </td>
                  </tr>
                ))}
                {keys.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-xs text-zinc-500">
                      No API keys yet. Generate one above.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/app/enterprise/api-keys/
git commit -m "feat(enterprise): /enterprise/api-keys — generate, list, revoke org API keys"
```

---

## Task 10: Frontend — Wire /enterprise/sla Page

**Files:**
- Modify: `apps/web/app/enterprise/sla/page.tsx`

- [ ] **Step 1: Read current sla/page.tsx**

Read `apps/web/app/enterprise/sla/page.tsx` completely.

- [ ] **Step 2: Replace demo data with real analytics**

The existing `sla/page.tsx` uses a `SlaTile`-based component with different props — it does NOT have a `KpiTile`. Replace the entire file with the following (which introduces a `KpiTile` matching the enterprise dashboard style):

```tsx
// apps/web/app/enterprise/sla/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { TrendingUp, Loader2, ChevronLeft } from "lucide-react";
import { getMyOrg, getOrgAnalytics, OrgAnalytics } from "@/lib/enterpriseApi";

type SlaHealth = "ON-TRACK" | "AT-RISK" | "BREACHED";
interface KpiData { label: string; target: string; actual: string; health: SlaHealth; }

function healthStyle(h: SlaHealth) {
  if (h === "ON-TRACK") return { border: "border-green-800", text: "text-green-400", bg: "bg-green-950/30" };
  if (h === "AT-RISK")  return { border: "border-amber-800", text: "text-amber-400", bg: "bg-amber-950/30" };
  return                       { border: "border-red-900",   text: "text-red-400",   bg: "bg-red-950/30"   };
}

function KpiTile({ kpi }: { kpi: KpiData }) {
  const s = healthStyle(kpi.health);
  return (
    <div className={`border rounded-sm p-4 space-y-2 ${s.border} ${s.bg}`}>
      <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">{kpi.label}</p>
      <p className={`font-mono text-2xl font-medium tabular-nums ${s.text}`}>{kpi.actual}</p>
      <div className="flex items-center justify-between">
        <span className="font-mono text-[9px] text-zinc-600">Target: {kpi.target}</span>
        <span className={`font-mono text-[9px] px-1.5 py-0.5 rounded-sm border ${s.border} ${s.text}`}>
          {kpi.health}
        </span>
      </div>
    </div>
  );
}

function buildKpis(a: OrgAnalytics): KpiData[] {
  return [
    {
      label: "Total Deployments",
      target: "—",
      actual: String(a.total_deployments),
      health: "ON-TRACK",
    },
    {
      label: "Active Deployments",
      target: "—",
      actual: String(a.active_deployments),
      health: "ON-TRACK",
    },
    {
      label: "DoD Pass Rate",
      target: "95%",
      actual: `${a.avg_dod_pass_rate}%`,
      health: a.avg_dod_pass_rate >= 95 ? "ON-TRACK" : a.avg_dod_pass_rate >= 80 ? "AT-RISK" : "BREACHED",
    },
    {
      label: "Drift Incidents (30d)",
      target: "0",
      actual: String(a.drift_incidents_30d),
      health: a.drift_incidents_30d === 0 ? "ON-TRACK" : a.drift_incidents_30d <= 2 ? "AT-RISK" : "BREACHED",
    },
    {
      label: "Total Spend",
      target: "—",
      actual: `$${(a.total_spend_cents / 100).toLocaleString()}`,
      health: "ON-TRACK",
    },
  ];
}

export default function EnterpriseSla() {
  const { data: session } = useSession();
  const profileId = (session?.user as { profileId?: string })?.profileId;
  const [kpis, setKpis]     = useState<KpiData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profileId) return;
    getMyOrg(profileId)
      .then(org => getOrgAnalytics(org.id))
      .then(a => setKpis(buildKpis(a)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [profileId]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 px-4 py-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <a href="/enterprise" className="text-zinc-500 hover:text-zinc-300">
            <ChevronLeft size={16} />
          </a>
          <TrendingUp className="text-amber-400" size={16} />
          <h1 className="text-base font-semibold">SLA Dashboard</h1>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="animate-spin text-amber-400" size={20} />
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {kpis.map(k => <KpiTile key={k.label} kpi={k} />)}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/enterprise/sla/
git commit -m "feat(enterprise): wire /enterprise/sla to real analytics data"
```

---

## Task 11: Admin — Enterprise Orgs Overview + Sidebar Nav

**Files:**
- Create: `apps/web/app/admin/enterprise/page.tsx`
- Modify: `apps/web/app/admin/layout.tsx`
- Create: `apps/web/app/api/admin/enterprises/route.ts`

- [ ] **Step 1: Create /api/admin/enterprises proxy**

```typescript
// apps/web/app/api/admin/enterprises/route.ts
import { auth } from "@/auth";
import { NextResponse } from "next/server";
const IDENTITY = process.env.IDENTITY_SERVICE_URL ?? "http://localhost:3001";

export async function GET() {
  const session = await auth();
  const user = session?.user as { isAdmin?: boolean } | undefined;
  if (!user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const r = await fetch(`${IDENTITY}/admin/enterprises`);
  return NextResponse.json(await r.json().catch(() => []), { status: r.status });
}
```

- [ ] **Step 2: Create /admin/enterprise/page.tsx**

```tsx
// apps/web/app/admin/enterprise/page.tsx
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { adminListOrgs, AdminOrgRow } from "@/lib/enterpriseApi";
import { Building2 } from "lucide-react";

const tierColor: Record<string, string> = {
  PLATINUM:   "text-violet-400",
  ENTERPRISE: "text-amber-400",
  GROWTH:     "text-zinc-400",
};

export default async function AdminEnterprise() {
  const session = await auth();
  const user = session?.user as { isAdmin?: boolean } | undefined;
  if (!user?.isAdmin) redirect("/dashboard");

  const orgs: AdminOrgRow[] = await adminListOrgs().catch(() => []);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Building2 size={16} className="text-amber-400" />
        <h1 className="text-base font-semibold text-zinc-50">
          Enterprise Orgs ({orgs.length})
        </h1>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
              <th className="px-4 py-2">Organisation</th>
              <th className="px-4 py-2">Owner</th>
              <th className="px-4 py-2">Tier</th>
              <th className="px-4 py-2">Members</th>
              <th className="px-4 py-2">Contract</th>
              <th className="px-4 py-2">Renewal</th>
              <th className="px-4 py-2">Created</th>
            </tr>
          </thead>
          <tbody>
            {orgs.map((org) => (
              <tr key={org.id} className="border-b border-zinc-800 last:border-0 hover:bg-zinc-800/40">
                <td className="px-4 py-2.5 font-medium text-zinc-200">{org.name}</td>
                <td className="px-4 py-2.5 text-xs text-zinc-400">{org.owner_email}</td>
                <td className="px-4 py-2.5">
                  <span className={`font-mono text-[10px] ${tierColor[org.plan_tier] ?? "text-zinc-400"}`}>
                    {org.plan_tier}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-zinc-300">{org.member_count}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-zinc-300">
                  {org.contract_value_cents > 0
                    ? `$${(org.contract_value_cents / 100).toLocaleString()}`
                    : "—"}
                </td>
                <td className="px-4 py-2.5 text-xs text-zinc-500">
                  {org.renewal_date ?? "—"}
                </td>
                <td className="px-4 py-2.5 text-xs text-zinc-500">
                  {new Date(org.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
            {orgs.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-xs text-zinc-500">
                  No enterprise organisations yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add Enterprise to admin sidebar**

Read `apps/web/app/admin/layout.tsx`. Find the `NAV` array. Add after the Revenue item:
```tsx
{ href: "/admin/enterprise", label: "Enterprise", icon: Building2 },
```

Also add `Building2` to the Lucide import.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/api/admin/enterprises/ apps/web/app/admin/enterprise/ apps/web/app/admin/layout.tsx
git commit -m "feat(enterprise): admin enterprise orgs overview + sidebar nav item"
```

---

## Task 12: Final Cargo Check + Push

- [ ] **Step 1: Full workspace cargo check**

```bash
cd /d/AiStaffApp
SQLX_OFFLINE=true cargo check 2>&1 | grep "^error" | head -20
```
Expected: Zero errors. Fix any type mismatches before proceeding.

- [ ] **Step 2: Next.js build check**

```bash
cd /d/AiStaffApp/apps/web
npm run build 2>&1 | tail -30
```
Expected: Build succeeds (warnings ok, errors not ok).

- [ ] **Step 3: Push**

```bash
cd /d/AiStaffApp
git push origin master
```

---

## Post-Deploy Checklist

After Dokploy redeploys:

- [ ] Run migration 0028 (auto via `sqlx migrate run` in deploy pipeline)
- [ ] Log in as `eduard.cleofe@gmail.com`
- [ ] Navigate to `/enterprise/setup` → create org "AiStaff Global"
- [ ] Check `/enterprise` → should show real org data (not demo)
- [ ] Navigate to `/admin/enterprise` → should show the org row
- [ ] Navigate to `/enterprise/api-keys` → generate a key, verify one-time display
- [ ] Navigate to `/enterprise/members` → invite a test email
- [ ] Verify `ERR_CERT_AUTHORITY_INVALID` doesn't appear (Traefik stable after deploy — if it does, restart Traefik)
