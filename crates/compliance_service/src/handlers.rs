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

pub async fn health() -> StatusCode {
    StatusCode::OK
}
