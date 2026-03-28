use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::Row;
use std::sync::Arc;
use uuid::Uuid;

use crate::handlers::AppState;

// ── Query params ──────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct ListScansQuery {
    pub deployment_id: Option<Uuid>,
    pub profile_id: Option<Uuid>,
}

// ── Request bodies ────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct CreateScanRequest {
    pub deployment_id: Option<Uuid>,
    pub uploaded_by: Uuid,
    pub file_name: String,
    pub file_size_bytes: i64,
    pub scan_type: String,
    pub milestone: Option<String>,
}

#[derive(Deserialize)]
pub struct UpdateStatusRequest {
    pub status: String,
    pub score: Option<i16>,
    pub blocks_release: bool,
    pub duration_ms: Option<i32>,
}

#[derive(Deserialize)]
pub struct IssueInput {
    pub severity: String,
    pub category: String,
    pub message: String,
    pub location: Option<String>,
    pub suggestion: Option<String>,
}

#[derive(Deserialize)]
pub struct BulkInsertIssuesRequest {
    pub issues: Vec<IssueInput>,
}

// ── Handlers ──────────────────────────────────────────────────────────────────

/// GET /quality-gate/scans?deployment_id=<uuid>  OR  ?profile_id=<uuid>
/// Returns scans with their issues aggregated via json_agg.
pub async fn list_scans(
    State(state): State<Arc<AppState>>,
    Query(q): Query<ListScansQuery>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let rows: Vec<serde_json::Value> = if let Some(dep_id) = q.deployment_id {
        sqlx::query(
            r#"
            SELECT
                s.id, s.deployment_id, s.uploaded_by, s.file_name,
                s.file_size_bytes, s.scan_type, s.milestone, s.status,
                s.score, s.blocks_release, s.scanned_at, s.duration_ms,
                s.created_at,
                COALESCE(
                    json_agg(
                        json_build_object(
                            'id',         i.id,
                            'severity',   i.severity,
                            'category',   i.category,
                            'message',    i.message,
                            'location',   i.location,
                            'suggestion', i.suggestion
                        ) ORDER BY
                            CASE i.severity
                                WHEN 'critical' THEN 1
                                WHEN 'high'     THEN 2
                                WHEN 'medium'   THEN 3
                                WHEN 'low'      THEN 4
                                ELSE 5
                            END
                    ) FILTER (WHERE i.id IS NOT NULL),
                    '[]'::json
                ) AS issues
            FROM quality_gate_scans s
            LEFT JOIN quality_gate_issues i ON i.scan_id = s.id
            WHERE s.deployment_id = $1
            GROUP BY s.id
            ORDER BY s.created_at DESC
            LIMIT 100
            "#,
        )
        .bind(dep_id)
        .fetch_all(&state.db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .iter()
        .map(row_to_json)
        .collect()
    } else if let Some(profile_id) = q.profile_id {
        sqlx::query(
            r#"
            SELECT
                s.id, s.deployment_id, s.uploaded_by, s.file_name,
                s.file_size_bytes, s.scan_type, s.milestone, s.status,
                s.score, s.blocks_release, s.scanned_at, s.duration_ms,
                s.created_at,
                COALESCE(
                    json_agg(
                        json_build_object(
                            'id',         i.id,
                            'severity',   i.severity,
                            'category',   i.category,
                            'message',    i.message,
                            'location',   i.location,
                            'suggestion', i.suggestion
                        ) ORDER BY
                            CASE i.severity
                                WHEN 'critical' THEN 1
                                WHEN 'high'     THEN 2
                                WHEN 'medium'   THEN 3
                                WHEN 'low'      THEN 4
                                ELSE 5
                            END
                    ) FILTER (WHERE i.id IS NOT NULL),
                    '[]'::json
                ) AS issues
            FROM quality_gate_scans s
            LEFT JOIN quality_gate_issues i ON i.scan_id = s.id
            WHERE s.uploaded_by = $1
            GROUP BY s.id
            ORDER BY s.created_at DESC
            LIMIT 100
            "#,
        )
        .bind(profile_id)
        .fetch_all(&state.db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .iter()
        .map(row_to_json)
        .collect()
    } else {
        return Err((
            StatusCode::BAD_REQUEST,
            "deployment_id or profile_id required".to_string(),
        ));
    };

    Ok(Json(json!({ "scans": rows })))
}

/// POST /quality-gate/scans — create a pending scan record, return scan_id
pub async fn create_scan(
    State(state): State<Arc<AppState>>,
    Json(body): Json<CreateScanRequest>,
) -> Result<(StatusCode, Json<Value>), (StatusCode, String)> {
    let valid_types = ["code", "security", "plagiarism", "text"];
    if !valid_types.contains(&body.scan_type.as_str()) {
        return Err((
            StatusCode::BAD_REQUEST,
            format!("Invalid scan_type: {}", body.scan_type),
        ));
    }

    let scan_id: Uuid = sqlx::query_scalar(
        r#"
        INSERT INTO quality_gate_scans
            (deployment_id, uploaded_by, file_name, file_size_bytes, scan_type, milestone)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
        "#,
    )
    .bind(body.deployment_id)
    .bind(body.uploaded_by)
    .bind(&body.file_name)
    .bind(body.file_size_bytes)
    .bind(&body.scan_type)
    .bind(body.milestone.unwrap_or_default())
    .fetch_one(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok((StatusCode::CREATED, Json(json!({ "scan_id": scan_id }))))
}

/// PATCH /quality-gate/scans/:id/status — set result after AI analysis
pub async fn update_scan_status(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateStatusRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let valid_statuses = ["pending", "scanning", "passed", "flagged", "skipped"];
    if !valid_statuses.contains(&body.status.as_str()) {
        return Err((
            StatusCode::BAD_REQUEST,
            format!("Invalid status: {}", body.status),
        ));
    }

    let rows_affected = sqlx::query(
        r#"
        UPDATE quality_gate_scans
        SET status         = $2,
            score          = $3,
            blocks_release = $4,
            duration_ms    = $5,
            scanned_at     = CASE WHEN $2 IN ('passed', 'flagged') THEN NOW() ELSE scanned_at END
        WHERE id = $1
        "#,
    )
    .bind(id)
    .bind(&body.status)
    .bind(body.score)
    .bind(body.blocks_release)
    .bind(body.duration_ms)
    .execute(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .rows_affected();

    if rows_affected == 0 {
        return Err((StatusCode::NOT_FOUND, "Scan not found".to_string()));
    }

    Ok(Json(json!({ "ok": true })))
}

/// POST /quality-gate/scans/:id/issues — bulk insert issues from AI analysis
pub async fn bulk_insert_issues(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    Json(body): Json<BulkInsertIssuesRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let valid_severities = ["critical", "high", "medium", "low", "info"];
    let mut inserted = 0usize;

    for issue in &body.issues {
        if !valid_severities.contains(&issue.severity.as_str()) {
            continue; // skip invalid severities rather than aborting
        }
        sqlx::query(
            r#"
            INSERT INTO quality_gate_issues
                (scan_id, severity, category, message, location, suggestion)
            VALUES ($1, $2, $3, $4, $5, $6)
            "#,
        )
        .bind(id)
        .bind(&issue.severity)
        .bind(&issue.category)
        .bind(&issue.message)
        .bind(issue.location.as_deref().unwrap_or(""))
        .bind(issue.suggestion.as_deref().unwrap_or(""))
        .execute(&state.db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        inserted += 1;
    }

    Ok(Json(json!({ "inserted": inserted })))
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn row_to_json(row: &sqlx::postgres::PgRow) -> serde_json::Value {
    json!({
        "id":              row.try_get::<Uuid, _>("id").ok().map(|u| u.to_string()),
        "deployment_id":   row.try_get::<Option<Uuid>, _>("deployment_id").ok().flatten().map(|u| u.to_string()),
        "uploaded_by":     row.try_get::<Uuid, _>("uploaded_by").ok().map(|u| u.to_string()),
        "file_name":       row.try_get::<String, _>("file_name").unwrap_or_default(),
        "file_size_bytes": row.try_get::<i64, _>("file_size_bytes").unwrap_or(0),
        "scan_type":       row.try_get::<String, _>("scan_type").unwrap_or_default(),
        "milestone":       row.try_get::<String, _>("milestone").unwrap_or_default(),
        "status":          row.try_get::<String, _>("status").unwrap_or_default(),
        "score":           row.try_get::<Option<i16>, _>("score").ok().flatten(),
        "blocks_release":  row.try_get::<bool, _>("blocks_release").unwrap_or(false),
        "scanned_at":      row.try_get::<Option<chrono::DateTime<chrono::Utc>>, _>("scanned_at").ok().flatten().map(|t| t.to_rfc3339()),
        "duration_ms":     row.try_get::<Option<i32>, _>("duration_ms").ok().flatten(),
        "created_at":      row.try_get::<chrono::DateTime<chrono::Utc>, _>("created_at").ok().map(|t| t.to_rfc3339()),
        "issues":          row.try_get::<serde_json::Value, _>("issues").unwrap_or(json!([])),
    })
}
