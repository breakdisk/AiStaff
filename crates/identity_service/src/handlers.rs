use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::{IntoResponse, Json, Redirect},
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

use crate::{
    openid4vp::{build_liveness_vp_request, build_wallet_deep_link},
    stitch_logic::StitchService,
};
use common::types::identity::{GitHubIdentity, LinkedInIdentity};

// ── GET /health ───────────────────────────────────────────────────────────────
pub async fn health() -> impl IntoResponse {
    (StatusCode::OK, "OK")
}

// ── POST /identity/stitch ─────────────────────────────────────────────────────
#[derive(Debug, Deserialize)]
pub struct StitchRequest {
    pub github:   GitHubIdentity,
    pub linkedin: LinkedInIdentity,
    pub email:    String,
}

#[derive(Debug, Serialize)]
pub struct StitchResponse {
    pub profile_id:    Uuid,
    pub trust_score:   i16,
    pub identity_tier: String,
    pub deep_link_url: String,
}

pub async fn stitch_identity(
    State(svc): State<Arc<StitchService>>,
    Json(req):  Json<StitchRequest>,
) -> impl IntoResponse {
    match svc.stitch_social(req.github, req.linkedin, req.email).await {
        Ok(profile) => {
            let callback = format!(
                "https://api.aistaffapp.com/identity/biometric-callback?profile_id={}",
                profile.id
            );
            let deep_link = build_wallet_deep_link(&format!(
                "https://api.aistaffapp.com/identity/vp-request?profile_id={}",
                profile.id
            ));

            // Build VP request (stored/cached in production; returned inline here for simplicity)
            let _vp_req = build_liveness_vp_request("aistaffapp", &callback);

            Json(StitchResponse {
                profile_id:    profile.id,
                trust_score:   profile.trust_score,
                identity_tier: format!("{:?}", profile.identity_tier),
                deep_link_url: deep_link,
            })
            .into_response()
        }
        Err(e) => {
            tracing::error!("stitch_identity: {e:#}");
            (StatusCode::INTERNAL_SERVER_ERROR, "Stitch failed").into_response()
        }
    }
}

// ── GET /identity/wallet-redirect ─────────────────────────────────────────────
#[derive(Debug, Deserialize)]
pub struct WalletRedirectQuery {
    pub profile_id: Uuid,
}

pub async fn wallet_redirect(Query(q): Query<WalletRedirectQuery>) -> impl IntoResponse {
    let vp_request_url = format!(
        "https://api.aistaffapp.com/identity/vp-request?profile_id={}",
        q.profile_id
    );
    Redirect::temporary(&build_wallet_deep_link(&vp_request_url))
}

// ── POST /identity/biometric-callback ─────────────────────────────────────────
#[derive(Debug, Deserialize)]
pub struct BiometricCallbackRequest {
    pub profile_id:  Uuid,
    /// Base64-encoded VP token containing the ZK proof from the wallet.
    pub vp_token:    String,
    pub nonce:       String,
    pub issuer_did:  String,
}

pub async fn biometric_callback(
    State(svc): State<Arc<StitchService>>,
    Json(req):  Json<BiometricCallbackRequest>,
) -> impl IntoResponse {
    let proof_bytes = match base64::decode(&req.vp_token) {
        Ok(b) => b,
        Err(_) => {
            return (StatusCode::BAD_REQUEST, "Invalid base64 vp_token").into_response()
        }
    };

    let nonce_bytes = req.nonce.as_bytes().to_vec();
    let expires_at  = chrono::Utc::now() + chrono::Duration::days(365);

    match svc
        .apply_biometric_proof(req.profile_id, proof_bytes, nonce_bytes, req.issuer_did, expires_at)
        .await
    {
        Ok(profile) => Json(serde_json::json!({
            "identity_tier": format!("{:?}", profile.identity_tier),
            "trust_score":   profile.trust_score,
            "commitment":    profile.biometric_commitment,
        }))
        .into_response(),
        Err(e) => {
            tracing::error!("biometric_callback: {e:#}");
            (StatusCode::UNPROCESSABLE_ENTITY, e.to_string()).into_response()
        }
    }
}

// base64 helper (re-export from base64 crate)
mod base64 {
    pub fn decode(s: &str) -> Result<Vec<u8>, base64::DecodeError> {
        use base64::Engine as _;
        base64::engine::general_purpose::STANDARD.decode(s)
    }
}
