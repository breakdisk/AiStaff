// crates/identity_service/src/enterprise_handlers.rs
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use blake3::Hasher;
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use std::collections::HashMap;
use uuid::Uuid;

// ── Request / Response types ───────────────────────────────────────────────

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
    pub display_name: String,
    pub email: String,
    pub member_role: String,
    pub identity_tier: String,
    pub trust_score: i32,
    pub joined_at: String,
}

#[derive(Serialize)]
pub struct ApiKeyResponse {
    pub id: String,
    pub label: String,
    pub key_preview: String,
    pub created_at: String,
    pub last_used_at: Option<String>,
}

#[derive(Serialize)]
pub struct CreatedKeyResponse {
    pub id: String,
    pub label: String,
    pub raw_key: String,
}

#[derive(Deserialize)]
pub struct CreateKeyBody {
    pub label: String,
    pub created_by: String,
}

#[derive(Deserialize)]
pub struct CreateOrgFullBody {
    pub owner_id: String,
    pub name: String,
    pub plan_tier: Option<String>,
}

// ── Handlers ───────────────────────────────────────────────────────────────

/// POST /enterprise/orgs-create
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

    let org_id: Uuid = sqlx::query_scalar(
        "INSERT INTO organisations (name, owner_id, plan_tier)
         VALUES ($1, $2, $3::org_plan_tier)
         RETURNING id",
    )
    .bind(&body.name)
    .bind(owner_id)
    .bind(plan_tier)
    .fetch_one(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    sqlx::query(
        "INSERT INTO org_members (org_id, profile_id, member_role)
         VALUES ($1, $2, 'ADMIN')
         ON CONFLICT (org_id, profile_id) DO NOTHING",
    )
    .bind(org_id)
    .bind(owner_id)
    .execute(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    sqlx::query(
        "UPDATE unified_profiles SET account_type = 'enterprise', updated_at = NOW()
         WHERE id = $1",
    )
    .bind(owner_id)
    .execute(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let org = fetch_org_response(&pool, org_id)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok((StatusCode::CREATED, Json(org)))
}

/// GET /enterprise/orgs/my?profile_id=<uuid>
pub async fn get_my_org(
    State(pool): State<PgPool>,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Json<OrgResponse>, StatusCode> {
    let profile_id = params
        .get("profile_id")
        .and_then(|s| Uuid::parse_str(s).ok())
        .ok_or(StatusCode::BAD_REQUEST)?;

    let org_id: Option<Uuid> = sqlx::query_scalar(
        "SELECT org_id FROM org_members WHERE profile_id = $1 LIMIT 1",
    )
    .bind(profile_id)
    .fetch_optional(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    match org_id {
        None => Err(StatusCode::NOT_FOUND),
        Some(id) => {
            let org = fetch_org_response(&pool, id)
                .await
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
    fetch_org_response(&pool, id)
        .await
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
            .bind(name)
            .bind(id)
            .execute(&pool)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }
    if let Some(v) = &body.csm_name {
        sqlx::query(
            "UPDATE organisations SET csm_name = $1, updated_at = NOW() WHERE id = $2",
        )
        .bind(v)
        .bind(id)
        .execute(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }
    if let Some(v) = &body.csm_email {
        sqlx::query(
            "UPDATE organisations SET csm_email = $1, updated_at = NOW() WHERE id = $2",
        )
        .bind(v)
        .bind(id)
        .execute(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }
    if let Some(v) = &body.csm_response_sla {
        sqlx::query(
            "UPDATE organisations SET csm_response_sla = $1, updated_at = NOW() WHERE id = $2",
        )
        .bind(v)
        .bind(id)
        .execute(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }
    if let Some(v) = body.veto_window_seconds {
        sqlx::query(
            "UPDATE organisations SET veto_window_seconds = $1, updated_at = NOW() WHERE id = $2",
        )
        .bind(v)
        .bind(id)
        .execute(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }
    if let Some(v) = body.contract_value_cents {
        sqlx::query(
            "UPDATE organisations SET contract_value_cents = $1, updated_at = NOW() WHERE id = $2",
        )
        .bind(v)
        .bind(id)
        .execute(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }
    if let Some(v) = &body.renewal_date {
        let d: chrono::NaiveDate = v.parse().map_err(|_| StatusCode::BAD_REQUEST)?;
        sqlx::query(
            "UPDATE organisations SET renewal_date = $1, updated_at = NOW() WHERE id = $2",
        )
        .bind(d)
        .bind(id)
        .execute(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }
    if let Some(tier) = &body.plan_tier {
        if !["GROWTH", "ENTERPRISE", "PLATINUM"].contains(&tier.as_str()) {
            return Err(StatusCode::BAD_REQUEST);
        }
        sqlx::query(
            "UPDATE organisations SET plan_tier = $1::org_plan_tier, updated_at = NOW() WHERE id = $2",
        )
        .bind(tier)
        .bind(id)
        .execute(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }

    fetch_org_response(&pool, id)
        .await
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

/// POST /enterprise/orgs/:id/invite
pub async fn invite_member(
    State(pool): State<PgPool>,
    Path(org_id): Path<Uuid>,
    Json(body): Json<InviteBody>,
) -> Result<(StatusCode, Json<InviteResponse>), StatusCode> {
    let inviter_id =
        Uuid::parse_str(&body.inviter_profile_id).map_err(|_| StatusCode::BAD_REQUEST)?;

    let (invite_id, token, expires_at): (Uuid, String, chrono::DateTime<chrono::Utc>) =
        sqlx::query_as(
            "INSERT INTO org_invites (org_id, inviter_id, invitee_email)
             VALUES ($1, $2, $3)
             RETURNING id, token, expires_at",
        )
        .bind(org_id)
        .bind(inviter_id)
        .bind(&body.invitee_email)
        .fetch_one(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok((
        StatusCode::CREATED,
        Json(InviteResponse {
            invite_id: invite_id.to_string(),
            token,
            invitee_email: body.invitee_email,
            expires_at: expires_at.to_rfc3339(),
        }),
    ))
}

/// POST /enterprise/invites/:token/accept
pub async fn accept_invite(
    State(pool): State<PgPool>,
    Path(token): Path<String>,
    Json(body): Json<AcceptInviteBody>,
) -> Result<StatusCode, StatusCode> {
    let profile_id =
        Uuid::parse_str(&body.profile_id).map_err(|_| StatusCode::BAD_REQUEST)?;

    let row: Option<(Uuid, Uuid)> = sqlx::query_as(
        "SELECT id, org_id FROM org_invites
         WHERE token = $1
           AND accepted_at IS NULL
           AND expires_at > NOW()
         LIMIT 1",
    )
    .bind(&token)
    .fetch_optional(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let (invite_id, org_id) = row.ok_or(StatusCode::NOT_FOUND)?;

    sqlx::query(
        "INSERT INTO org_members (org_id, profile_id, member_role)
         VALUES ($1, $2, 'MEMBER')
         ON CONFLICT (org_id, profile_id) DO NOTHING",
    )
    .bind(org_id)
    .bind(profile_id)
    .execute(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    sqlx::query("UPDATE org_invites SET accepted_at = NOW() WHERE id = $1")
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
    let rows: Vec<(Uuid, String, String, String, String, i32, chrono::DateTime<chrono::Utc>)> =
        sqlx::query_as(
            "SELECT om.profile_id,
                    COALESCE(up.display_name, up.email, '') AS display_name,
                    COALESCE(up.email, '') AS email,
                    om.member_role,
                    up.identity_tier::TEXT,
                    up.trust_score::INT,
                    om.joined_at
             FROM org_members om
             JOIN unified_profiles up ON up.id = om.profile_id
             WHERE om.org_id = $1
             ORDER BY om.joined_at",
        )
        .bind(org_id)
        .fetch_all(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let members = rows
        .into_iter()
        .map(
            |(pid, dn, email, role, tier, score, joined)| MemberResponse {
                profile_id: pid.to_string(),
                display_name: dn,
                email,
                member_role: role,
                identity_tier: tier,
                trust_score: score,
                joined_at: joined.to_rfc3339(),
            },
        )
        .collect();

    Ok(Json(members))
}

/// DELETE /enterprise/orgs/:id/members/:profile_id
pub async fn remove_member(
    State(pool): State<PgPool>,
    Path((org_id, profile_id)): Path<(Uuid, Uuid)>,
) -> Result<StatusCode, StatusCode> {
    let is_owner: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM organisations WHERE id = $1 AND owner_id = $2)",
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
    let rows: Vec<(
        Uuid,
        String,
        String,
        chrono::DateTime<chrono::Utc>,
        Option<chrono::DateTime<chrono::Utc>>,
    )> = sqlx::query_as(
        "SELECT id, label, key_hash, created_at, last_used_at
         FROM org_api_keys
         WHERE org_id = $1 AND revoked_at IS NULL
         ORDER BY created_at DESC",
    )
    .bind(org_id)
    .fetch_all(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let keys = rows
        .into_iter()
        .map(|(id, label, hash, created, last_used)| {
            let preview = format!("{}...", &hash[..hash.len().min(8)]);
            ApiKeyResponse {
                id: id.to_string(),
                label,
                key_preview: preview,
                created_at: created.to_rfc3339(),
                last_used_at: last_used.map(|d| d.to_rfc3339()),
            }
        })
        .collect();

    Ok(Json(keys))
}

/// POST /enterprise/orgs/:id/api-keys
pub async fn create_api_key(
    State(pool): State<PgPool>,
    Path(org_id): Path<Uuid>,
    Json(body): Json<CreateKeyBody>,
) -> Result<(StatusCode, Json<CreatedKeyResponse>), StatusCode> {
    let created_by =
        Uuid::parse_str(&body.created_by).map_err(|_| StatusCode::BAD_REQUEST)?;

    let raw_key = format!("ask_{}", Uuid::now_v7().to_string().replace('-', ""));

    let mut hasher = Hasher::new();
    hasher.update(raw_key.as_bytes());
    let key_hash = hasher.finalize().to_hex().to_string();

    let key_id: Uuid = sqlx::query_scalar(
        "INSERT INTO org_api_keys (org_id, label, key_hash, created_by)
         VALUES ($1, $2, $3, $4)
         RETURNING id",
    )
    .bind(org_id)
    .bind(&body.label)
    .bind(&key_hash)
    .bind(created_by)
    .fetch_one(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok((
        StatusCode::CREATED,
        Json(CreatedKeyResponse {
            id: key_id.to_string(),
            label: body.label,
            raw_key,
        }),
    ))
}

/// DELETE /enterprise/orgs/:id/api-keys/:kid
pub async fn revoke_api_key(
    State(pool): State<PgPool>,
    Path((_org_id, key_id)): Path<(Uuid, Uuid)>,
) -> Result<StatusCode, StatusCode> {
    sqlx::query(
        "UPDATE org_api_keys SET revoked_at = NOW() WHERE id = $1 AND revoked_at IS NULL",
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
    let rows: Vec<(
        Uuid,
        String,
        String,
        String,
        i64,
        i64,
        Option<chrono::NaiveDate>,
        chrono::DateTime<chrono::Utc>,
    )> = sqlx::query_as(
        "SELECT o.id, o.name, up.email, o.plan_tier::TEXT,
                COUNT(om.id) AS member_count,
                o.contract_value_cents, o.renewal_date, o.created_at
         FROM organisations o
         JOIN unified_profiles up ON up.id = o.owner_id
         LEFT JOIN org_members om ON om.org_id = o.id
         GROUP BY o.id, o.name, o.plan_tier, o.contract_value_cents, o.renewal_date, o.created_at, up.email
         ORDER BY o.created_at DESC",
    )
    .fetch_all(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let orgs = rows
        .into_iter()
        .map(
            |(id, name, email, tier, count, cv, renewal, created)| AdminOrgRow {
                id: id.to_string(),
                name,
                owner_email: email,
                plan_tier: tier,
                member_count: count,
                contract_value_cents: cv,
                renewal_date: renewal.map(|d| d.to_string()),
                created_at: created.to_rfc3339(),
            },
        )
        .collect();

    Ok(Json(orgs))
}

// ── Internal helper ────────────────────────────────────────────────────────

async fn fetch_org_response(pool: &PgPool, org_id: Uuid) -> Result<OrgResponse, sqlx::Error> {
    let row: (
        Uuid,
        String,
        Uuid,
        String,
        i64,
        Option<chrono::NaiveDate>,
        i32,
        i32,
        Option<String>,
        Option<String>,
        Option<String>,
        chrono::DateTime<chrono::Utc>,
    ) = sqlx::query_as(
        "SELECT o.id, o.name, o.owner_id, o.plan_tier::TEXT,
                o.contract_value_cents, o.renewal_date,
                o.veto_window_seconds, o.custom_escrow_platform_pct,
                o.csm_name, o.csm_email, o.csm_response_sla, o.created_at
         FROM organisations o
         WHERE o.id = $1",
    )
    .bind(org_id)
    .fetch_one(pool)
    .await?;

    let member_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM org_members WHERE org_id = $1")
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
