//! OpenID4VP — Verifiable Presentation request generation.
//! Spec: https://openid.net/specs/openid-4-verifiable-presentations-1_0.html

use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// The VP request object sent to the mobile wallet.
#[derive(Debug, Serialize, Deserialize)]
pub struct VpRequest {
    pub client_id: String,
    pub response_type: String,
    pub response_mode: String,
    pub nonce: String,
    pub presentation_definition: PresentationDefinition,
    /// Callback URL — wallet POSTs the signed VP response here.
    pub response_uri: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PresentationDefinition {
    pub id: String,
    pub input_descriptors: Vec<InputDescriptor>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct InputDescriptor {
    pub id: String,
    pub name: String,
    pub purpose: String,
    pub constraints: ConstraintFilter,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ConstraintFilter {
    pub fields: Vec<FieldConstraint>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FieldConstraint {
    pub path: Vec<String>,
    pub filter: serde_json::Value,
}

/// Constructs a VP request for the `LivenessProofCredential` type.
pub fn build_liveness_vp_request(client_id: &str, callback_url: &str) -> VpRequest {
    VpRequest {
        client_id: client_id.to_string(),
        response_type: "vp_token".into(),
        response_mode: "direct_post".into(),
        nonce: Uuid::new_v4().to_string(),
        response_uri: callback_url.to_string(),
        presentation_definition: PresentationDefinition {
            id: Uuid::new_v4().to_string(),
            input_descriptors: vec![InputDescriptor {
                id: "liveness_proof".into(),
                name: "Biometric Liveness Proof".into(),
                purpose: "Prove humanity via ZK liveness without disclosing biometric template"
                    .into(),
                constraints: ConstraintFilter {
                    fields: vec![
                        FieldConstraint {
                            path: vec!["$.type".into()],
                            filter: serde_json::json!({
                                "type":    "string",
                                "pattern": "LivenessProofCredential"
                            }),
                        },
                        FieldConstraint {
                            path: vec!["$.credentialSubject.zkProof".into()],
                            filter: serde_json::json!({ "type": "string" }),
                        },
                    ],
                },
            }],
        },
    }
}

/// Builds an `openid4vp://` deep link to redirect the mobile browser to the
/// user's identity wallet app for credential presentation.
pub fn build_wallet_deep_link(vp_request_url: &str) -> String {
    let encoded = urlencoding::encode(vp_request_url);
    format!("openid4vp://?request_uri={encoded}")
}
