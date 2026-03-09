use chrono::Utc;
use serde_json::{json, Value};
use uuid::Uuid;

/// Issues a W3C Verifiable Credential JSON for a talent's reputation on the platform.
///
/// v1: Returns unsigned JSON-LD payload.
/// v2 roadmap: Sign with platform Ed25519 DID key using `did-key` crate.
pub fn issue_reputation_vc(
    talent_id:             Uuid,
    reputation_score:      f64,
    deployments_completed: i64,
    trust_tier:            &str,
    platform_did:          &str,
) -> Value {
    let now = Utc::now();
    json!({
        "@context": [
            "https://www.w3.org/2018/credentials/v1",
            "https://schema.aistaff.app/credentials/v1"
        ],
        "type": ["VerifiableCredential", "AiStaffReputationCredential"],
        "id": format!("urn:uuid:{}", Uuid::new_v4()),
        "issuer": platform_did,
        "issuanceDate": now.to_rfc3339(),
        "credentialSubject": {
            "id": format!("did:aistaff:{talent_id}"),
            "reputationScore": reputation_score,
            "deploymentsCompleted": deployments_completed,
            "identityTier": trust_tier,
            "platform": "AiStaffApp",
            "issuedAt": now.to_rfc3339(),
        }
    })
}
