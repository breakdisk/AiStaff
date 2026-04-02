use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::PgPool;
use uuid::Uuid;

// ── Types ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct AuditBatchRequest {
    pub profile_id: Uuid,
    pub events: Vec<AuditEvent>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct AuditEvent {
    pub event_type: String,
    pub event_data: Value,
}

const ALLOWED_EVENT_TYPES: &[&str] = &[
    "ROLE_SELECTED",
    "TOS_ACCEPTED",
    "ONBOARDING_COMPLETE",
    "PROVIDER_CONNECTED",
    "TIER_CHANGED",
];

pub(crate) fn validate_event_types(events: &[AuditEvent]) -> Result<(), String> {
    for ev in events {
        if !ALLOWED_EVENT_TYPES.contains(&ev.event_type.as_str()) {
            return Err(format!("invalid event_type: {}", ev.event_type));
        }
    }
    Ok(())
}

// ── Handler ───────────────────────────────────────────────────────────────────

pub async fn batch_audit_events(
    State(pool): State<PgPool>,
    Json(body): Json<AuditBatchRequest>,
) -> StatusCode {
    if body.events.is_empty() {
        return StatusCode::NO_CONTENT;
    }
    if body.events.len() > 10 {
        return StatusCode::UNPROCESSABLE_ENTITY;
    }
    if let Err(e) = validate_event_types(&body.events) {
        tracing::warn!("audit_events rejected: {e}");
        return StatusCode::UNPROCESSABLE_ENTITY;
    }

    // Verify profile exists — propagate DB errors as 500, not 404
    let exists: Option<(Uuid,)> =
        match sqlx::query_as("SELECT id FROM unified_profiles WHERE id = $1")
            .bind(body.profile_id)
            .fetch_optional(&pool)
            .await
        {
            Ok(row) => row,
            Err(e) => {
                tracing::error!("audit_events profile check: {e:#}");
                return StatusCode::INTERNAL_SERVER_ERROR;
            }
        };

    if exists.is_none() {
        return StatusCode::NOT_FOUND;
    }

    // Insert all rows in one transaction
    let mut tx = match pool.begin().await {
        Ok(t) => t,
        Err(e) => {
            tracing::error!("audit_events tx begin: {e:#}");
            return StatusCode::INTERNAL_SERVER_ERROR;
        }
    };

    for ev in &body.events {
        let res = sqlx::query(
            "INSERT INTO identity_audit_log
               (id, profile_id, event_type, event_data, created_at)
             VALUES ($1, $2, $3, $4, NOW())",
        )
        .bind(Uuid::now_v7())
        .bind(body.profile_id)
        .bind(&ev.event_type)
        .bind(&ev.event_data)
        .execute(&mut *tx)
        .await;

        if let Err(e) = res {
            tracing::error!("audit_events insert: {e:#}");
            let _ = tx.rollback().await;
            return StatusCode::INTERNAL_SERVER_ERROR;
        }
    }

    match tx.commit().await {
        Ok(_) => StatusCode::NO_CONTENT,
        Err(e) => {
            tracing::error!("audit_events commit: {e:#}");
            StatusCode::INTERNAL_SERVER_ERROR
        }
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn ev(event_type: &str) -> AuditEvent {
        AuditEvent {
            event_type: event_type.to_string(),
            event_data: json!({}),
        }
    }

    #[test]
    fn allowlist_accepts_valid_types() {
        let events = vec![
            ev("ROLE_SELECTED"),
            ev("TOS_ACCEPTED"),
            ev("ONBOARDING_COMPLETE"),
        ];
        assert!(validate_event_types(&events).is_ok());
    }

    #[test]
    fn allowlist_rejects_unknown_type() {
        let events = vec![ev("DROP_TABLE_users")];
        assert!(validate_event_types(&events).is_err());
    }

    #[test]
    fn allowlist_rejects_empty_string() {
        let events = vec![ev("")];
        assert!(validate_event_types(&events).is_err());
    }
}
