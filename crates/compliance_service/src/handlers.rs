use crate::contracts::ContractService;
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

pub type AppState = Arc<ContractService>;

#[derive(Deserialize)]
pub struct CreateContractRequest {
    pub contract_type: String,
    pub party_a: Uuid,
    pub party_b: Uuid,
    pub deployment_id: Option<Uuid>,
    /// Base64-encoded document bytes.
    pub document_b64: String,
    pub party_b_email: Option<String>,
    pub party_a_email: Option<String>,
}

#[derive(Serialize)]
pub struct CreateContractResponse {
    pub contract_id: Uuid,
    pub document_hash: String,
}

pub async fn create_contract(
    State(svc): State<AppState>,
    Json(req): Json<CreateContractRequest>,
) -> impl IntoResponse {
    use base64::Engine;
    let bytes = match base64::engine::general_purpose::STANDARD.decode(&req.document_b64) {
        Ok(b) => b,
        Err(_) => return (StatusCode::BAD_REQUEST, "invalid base64").into_response(),
    };

    match svc
        .create_draft(
            &req.contract_type,
            req.party_a,
            req.party_b,
            req.deployment_id,
            &bytes,
            req.party_b_email.as_deref(),
            req.party_a_email.as_deref(),
        )
        .await
    {
        Ok((id, hash)) => (
            StatusCode::CREATED,
            Json(CreateContractResponse {
                contract_id: id,
                document_hash: hash,
            }),
        )
            .into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

#[derive(Deserialize)]
pub struct SignRequest {
    pub signer_id: Uuid,
}

pub async fn sign_contract(
    State(svc): State<AppState>,
    Path(id): Path<Uuid>,
    Json(req): Json<SignRequest>,
) -> impl IntoResponse {
    match svc.record_signature(id, req.signer_id).await {
        Ok(_) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => (StatusCode::UNPROCESSABLE_ENTITY, e.to_string()).into_response(),
    }
}

pub async fn get_contract(State(svc): State<AppState>, Path(id): Path<Uuid>) -> impl IntoResponse {
    let row = sqlx::query!(
        "SELECT id, contract_type, status::TEXT AS status, document_hash, created_at, signed_at
         FROM contracts WHERE id = $1",
        id
    )
    .fetch_optional(&svc.db)
    .await;

    match row {
        Ok(Some(r)) => (
            StatusCode::OK,
            Json(serde_json::json!({
                "id":            r.id,
                "contract_type": r.contract_type,
                "status":        r.status,
                "document_hash": r.document_hash,
                "created_at":    r.created_at.to_rfc3339(),
                "signed_at":     r.signed_at.map(|d| d.to_rfc3339()),
            })),
        )
            .into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

// ── Warranty claim endpoints ──────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct WarrantyListQuery {
    pub deployment_id: Option<Uuid>,
}

pub async fn list_warranty_claims(
    State(svc): State<AppState>,
    Query(q): Query<WarrantyListQuery>,
) -> impl IntoResponse {
    use sqlx::Row;

    let rows = if let Some(dep_id) = q.deployment_id {
        sqlx::query(
            "SELECT id, deployment_id, claimant_id, drift_proof,
                    claimed_at, resolved_at, resolution::TEXT AS resolution
             FROM warranty_claims WHERE deployment_id = $1 ORDER BY claimed_at DESC",
        )
        .bind(dep_id)
        .fetch_all(&svc.db)
        .await
    } else {
        sqlx::query(
            "SELECT id, deployment_id, claimant_id, drift_proof,
                    claimed_at, resolved_at, resolution::TEXT AS resolution
             FROM warranty_claims ORDER BY claimed_at DESC LIMIT 100",
        )
        .fetch_all(&svc.db)
        .await
    };

    match rows {
        Ok(rows) => {
            let data: Vec<_> = rows
                .iter()
                .map(|r| {
                    let id: Uuid = r.get("id");
                    let dep_id: Uuid = r.get("deployment_id");
                    let claimant: Uuid = r.get("claimant_id");
                    let drift_proof: &str = r.get("drift_proof");
                    let claimed_at: chrono::DateTime<chrono::Utc> = r.get("claimed_at");
                    let resolved_at: Option<chrono::DateTime<chrono::Utc>> = r.get("resolved_at");
                    let resolution: Option<&str> = r.get("resolution");
                    serde_json::json!({
                        "id":            id,
                        "deployment_id": dep_id,
                        "claimant_id":   claimant,
                        "drift_proof":   drift_proof,
                        "claimed_at":    claimed_at.to_rfc3339(),
                        "resolved_at":   resolved_at.map(|d| d.to_rfc3339()),
                        "resolution":    resolution,
                    })
                })
                .collect();
            (StatusCode::OK, Json(data)).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

#[derive(Deserialize)]
pub struct ResolveRequest {
    /// "REMEDIATED" | "REFUNDED" | "REJECTED"
    pub resolution: String,
}

pub async fn resolve_warranty_claim(
    State(svc): State<AppState>,
    Path(id): Path<Uuid>,
    Json(req): Json<ResolveRequest>,
) -> impl IntoResponse {
    let valid = matches!(
        req.resolution.as_str(),
        "REMEDIATED" | "REFUNDED" | "REJECTED"
    );
    if !valid {
        return (
            StatusCode::BAD_REQUEST,
            "resolution must be REMEDIATED, REFUNDED, or REJECTED",
        )
            .into_response();
    }

    let result = sqlx::query(
        "UPDATE warranty_claims
         SET resolved_at = NOW(), resolution = $2::warranty_resolution
         WHERE id = $1 AND resolved_at IS NULL",
    )
    .bind(id)
    .bind(&req.resolution)
    .execute(&svc.db)
    .await;

    match result {
        Ok(r) if r.rows_affected() == 0 => {
            (StatusCode::NOT_FOUND, "claim not found or already resolved").into_response()
        }
        Ok(_) => (StatusCode::OK, Json(serde_json::json!({ "ok": true }))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

// ── Contract list endpoint ────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct ContractListQuery {
    pub profile_id: Option<Uuid>,
}

pub async fn list_contracts(
    State(svc): State<AppState>,
    Query(q): Query<ContractListQuery>,
) -> impl IntoResponse {
    let rows = if let Some(pid) = q.profile_id {
        sqlx::query(
            "SELECT id, contract_type, status::TEXT AS status, document_hash,
                    party_a, party_b, deployment_id, created_at, signed_at,
                    party_a_email, party_b_email, party_a_signed_at, party_b_signed_at
             FROM contracts
             WHERE party_a = $1 OR party_b = $1
             ORDER BY created_at DESC
             LIMIT 200",
        )
        .bind(pid)
        .fetch_all(&svc.db)
        .await
    } else {
        sqlx::query(
            "SELECT id, contract_type, status::TEXT AS status, document_hash,
                    party_a, party_b, deployment_id, created_at, signed_at,
                    party_a_email, party_b_email, party_a_signed_at, party_b_signed_at
             FROM contracts
             ORDER BY created_at DESC
             LIMIT 200",
        )
        .fetch_all(&svc.db)
        .await
    };

    match rows {
        Ok(rows) => {
            use sqlx::Row;
            let data: Vec<_> = rows
                .iter()
                .map(|r| {
                    let id: Uuid = r.get("id");
                    let party_a: Uuid = r.get("party_a");
                    let party_b: Uuid = r.get("party_b");
                    let dep_id: Option<Uuid> = r.get("deployment_id");
                    let created_at: chrono::DateTime<chrono::Utc> = r.get("created_at");
                    let signed_at: Option<chrono::DateTime<chrono::Utc>> = r.get("signed_at");
                    let party_a_signed_at: Option<chrono::DateTime<chrono::Utc>> =
                        r.get("party_a_signed_at");
                    let party_b_signed_at: Option<chrono::DateTime<chrono::Utc>> =
                        r.get("party_b_signed_at");
                    serde_json::json!({
                        "id":               id,
                        "contract_type":    r.get::<&str, _>("contract_type"),
                        "status":           r.get::<Option<&str>, _>("status"),
                        "document_hash":    r.get::<&str, _>("document_hash"),
                        "party_a":          party_a,
                        "party_b":          party_b,
                        "deployment_id":    dep_id,
                        "created_at":       created_at.to_rfc3339(),
                        "signed_at":        signed_at.map(|d| d.to_rfc3339()),
                        "party_a_email":    r.get::<Option<&str>, _>("party_a_email"),
                        "party_b_email":    r.get::<Option<&str>, _>("party_b_email"),
                        "party_a_signed_at": party_a_signed_at.map(|d| d.to_rfc3339()),
                        "party_b_signed_at": party_b_signed_at.map(|d| d.to_rfc3339()),
                    })
                })
                .collect();
            (StatusCode::OK, Json(data)).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

// ── E-signature endpoints ─────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct RequestSignatureBody {
    pub party_b_email: String,
}

pub async fn request_signature(
    State(svc): State<AppState>,
    Path(id): Path<Uuid>,
    Json(req): Json<RequestSignatureBody>,
) -> impl IntoResponse {
    match svc.request_signature_token(id, &req.party_b_email).await {
        Ok(token) => (
            StatusCode::OK,
            Json(serde_json::json!({ "sign_token": token })),
        )
            .into_response(),
        Err(e) => (StatusCode::UNPROCESSABLE_ENTITY, e.to_string()).into_response(),
    }
}

#[derive(Deserialize)]
pub struct TokenQuery {
    pub token: Option<String>,
}

pub async fn preview_token(
    State(svc): State<AppState>,
    Path(id): Path<Uuid>,
    Query(q): Query<TokenQuery>,
) -> impl IntoResponse {
    let token = match q.token {
        Some(t) => t,
        None => return (StatusCode::BAD_REQUEST, "missing token").into_response(),
    };
    match svc.preview_for_token(id, &token).await {
        Ok(data) => (StatusCode::OK, Json(data)).into_response(),
        Err(e) => {
            let msg = e.to_string();
            let code = if msg.contains("not found") {
                StatusCode::NOT_FOUND
            } else {
                StatusCode::UNAUTHORIZED
            };
            (code, Json(serde_json::json!({ "error": msg }))).into_response()
        }
    }
}

#[derive(Deserialize)]
pub struct SignExternalBody {
    pub token: String,
    pub signer_name: String,
}

pub async fn sign_external(
    State(svc): State<AppState>,
    Path(id): Path<Uuid>,
    Json(req): Json<SignExternalBody>,
) -> impl IntoResponse {
    match svc.sign_external(id, &req.token, &req.signer_name).await {
        Ok((party_a_email, party_b_email)) => (
            StatusCode::OK,
            Json(serde_json::json!({
                "ok":            true,
                "party_a_email": party_a_email,
                "party_b_email": party_b_email,
                "signer_name":   req.signer_name,
            })),
        )
            .into_response(),
        Err(e) => {
            let msg = e.to_string();
            let code = if msg.contains("already signed") {
                StatusCode::CONFLICT
            } else if msg.contains("invalid") || msg.contains("expired") {
                StatusCode::UNAUTHORIZED
            } else {
                StatusCode::UNPROCESSABLE_ENTITY
            };
            (code, Json(serde_json::json!({ "error": msg }))).into_response()
        }
    }
}

pub async fn health() -> StatusCode {
    StatusCode::OK
}

// ── POST /admin/contracts/:id/revoke ─────────────────────────────────────────

/// Returns true if the contract state allows revocation.
#[allow(dead_code)]
pub fn revoke_allowed_states(status: &str) -> bool {
    matches!(status, "DRAFT" | "PENDING_SIGNATURE")
}

pub async fn revoke_contract(
    State(svc): State<AppState>,
    Path(contract_id): Path<Uuid>,
) -> impl IntoResponse {
    let updated = sqlx::query(
        "UPDATE contracts
         SET status = 'REVOKED'::contract_status
         WHERE id = $1
           AND status IN ('DRAFT'::contract_status, 'PENDING_SIGNATURE'::contract_status)
         RETURNING id",
    )
    .bind(contract_id)
    .fetch_optional(&svc.db)
    .await;

    match updated {
        Ok(Some(_)) => StatusCode::NO_CONTENT.into_response(),
        Ok(None) => (
            StatusCode::CONFLICT,
            "Contract is not in a revocable state (must be DRAFT or PENDING_SIGNATURE)",
        )
            .into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

#[cfg(test)]
mod tests {
    use super::revoke_allowed_states;

    #[test]
    fn only_draft_and_pending_are_revocable() {
        assert!(revoke_allowed_states("DRAFT"));
        assert!(revoke_allowed_states("PENDING_SIGNATURE"));
        assert!(!revoke_allowed_states("SIGNED"));
        assert!(!revoke_allowed_states("EXPIRED"));
        assert!(!revoke_allowed_states("REVOKED"));
    }
}
