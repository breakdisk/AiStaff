//! Listing media handlers — video URL, proof-of-work images, requirements, deliverables.
//!
//! Routes:
//!   GET    /listings/:id/media                — fetch all media for a listing
//!   POST   /listings/:id/media                — add a media item
//!   DELETE /listings/:id/media/:media_id      — remove a media item

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::Deserialize;
use sqlx::Row;
use uuid::Uuid;

use crate::AppState;
use std::sync::Arc;

type SharedState = State<Arc<AppState>>;

// ── Request / Response types ──────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct AddMediaRequest {
    pub media_type: String,   // "video_url" | "image" | "requirement" | "deliverable"
    pub content:    String,
    pub required:   Option<bool>,
    pub sort_order: Option<i32>,
}

// Note: response rows are serialised inline via serde_json::json!() in each handler.

// ── GET /listings/:id/media ───────────────────────────────────────────────────

pub async fn list_listing_media(
    State(state): SharedState,
    Path(listing_id): Path<Uuid>,
) -> impl IntoResponse {
    let rows = sqlx::query(
        "SELECT id, listing_id, media_type, content, required, sort_order, created_at
         FROM listing_media
         WHERE listing_id = $1
         ORDER BY media_type, sort_order, created_at",
    )
    .bind(listing_id)
    .fetch_all(&state.db)
    .await;

    match rows {
        Ok(rs) => {
            let items: Vec<serde_json::Value> = rs.iter().map(|r| {
                let id:         Uuid   = r.get("id");
                let lid:        Uuid   = r.get("listing_id");
                let media_type: &str   = r.get("media_type");
                let content:    &str   = r.get("content");
                let required:   bool   = r.get("required");
                let sort_order: i32    = r.get("sort_order");
                let created:    chrono::DateTime<chrono::Utc> = r.get("created_at");
                serde_json::json!({
                    "id":         id,
                    "listing_id": lid,
                    "media_type": media_type,
                    "content":    content,
                    "required":   required,
                    "sort_order": sort_order,
                    "created_at": created.to_rfc3339(),
                })
            }).collect();
            (StatusCode::OK, Json(serde_json::json!({ "media": items }))).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

// ── POST /listings/:id/media ──────────────────────────────────────────────────

pub async fn add_listing_media(
    State(state): SharedState,
    Path(listing_id): Path<Uuid>,
    Json(req): Json<AddMediaRequest>,
) -> impl IntoResponse {
    // Validate media_type
    let valid_types = ["video_url", "image", "requirement", "deliverable"];
    if !valid_types.contains(&req.media_type.as_str()) {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "invalid media_type" })),
        )
            .into_response();
    }

    if req.content.trim().is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "content is required" })),
        )
            .into_response();
    }

    // Enforce one video_url per listing
    if req.media_type == "video_url" {
        let exists = sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS(SELECT 1 FROM listing_media WHERE listing_id = $1 AND media_type = 'video_url')",
        )
        .bind(listing_id)
        .fetch_one(&state.db)
        .await
        .unwrap_or(false);

        if exists {
            // Replace existing video_url instead of inserting duplicate
            let update = sqlx::query(
                "UPDATE listing_media SET content = $1 WHERE listing_id = $2 AND media_type = 'video_url'",
            )
            .bind(&req.content)
            .bind(listing_id)
            .execute(&state.db)
            .await;

            return match update {
                Ok(_) => (StatusCode::OK, Json(serde_json::json!({ "updated": true }))).into_response(),
                Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
            };
        }
    }

    let media_id   = Uuid::now_v7();
    let required   = req.required.unwrap_or(true);
    let sort_order = req.sort_order.unwrap_or(0);

    let insert = sqlx::query(
        "INSERT INTO listing_media (id, listing_id, media_type, content, required, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6)",
    )
    .bind(media_id)
    .bind(listing_id)
    .bind(&req.media_type)
    .bind(&req.content)
    .bind(required)
    .bind(sort_order)
    .execute(&state.db)
    .await;

    match insert {
        Ok(_) => (
            StatusCode::CREATED,
            Json(serde_json::json!({ "media_id": media_id })),
        )
            .into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

// ── DELETE /listings/:id/media/:media_id ─────────────────────────────────────

pub async fn delete_listing_media(
    State(state): SharedState,
    Path((listing_id, media_id)): Path<(Uuid, Uuid)>,
) -> impl IntoResponse {
    let result = sqlx::query(
        "DELETE FROM listing_media WHERE id = $1 AND listing_id = $2",
    )
    .bind(media_id)
    .bind(listing_id)
    .execute(&state.db)
    .await;

    match result {
        Ok(r) if r.rows_affected() == 0 => {
            (StatusCode::NOT_FOUND, "media item not found").into_response()
        }
        Ok(_) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}
