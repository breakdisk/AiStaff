use anyhow::Result;
use serde_json::Value;
use uuid::Uuid;

use crate::{
    handlers::{CreateEventRequest, CreateHubRequest, CreatePostRequest, CreateThreadRequest},
    Db,
};

// ── Hub CRUD ──────────────────────────────────────────────────────────────────

pub async fn list_hubs(db: &Db, category: Option<&str>, limit: i64) -> Result<Vec<Value>> {
    let rows = if let Some(cat) = category {
        sqlx::query!(
            r#"SELECT id, slug, name, description, category, timezone,
                      owner_id, member_count, is_private, created_at
               FROM community_hubs
               WHERE category = $1
               ORDER BY member_count DESC, created_at DESC
               LIMIT $2"#,
            cat, limit
        )
        .fetch_all(db)
        .await?
        .into_iter()
        .map(|r| serde_json::json!({
            "id": r.id, "slug": r.slug, "name": r.name,
            "description": r.description, "category": r.category,
            "timezone": r.timezone, "owner_id": r.owner_id,
            "member_count": r.member_count, "is_private": r.is_private,
            "created_at": r.created_at,
        }))
        .collect()
    } else {
        sqlx::query!(
            r#"SELECT id, slug, name, description, category, timezone,
                      owner_id, member_count, is_private, created_at
               FROM community_hubs
               ORDER BY member_count DESC, created_at DESC
               LIMIT $1"#,
            limit
        )
        .fetch_all(db)
        .await?
        .into_iter()
        .map(|r| serde_json::json!({
            "id": r.id, "slug": r.slug, "name": r.name,
            "description": r.description, "category": r.category,
            "timezone": r.timezone, "owner_id": r.owner_id,
            "member_count": r.member_count, "is_private": r.is_private,
            "created_at": r.created_at,
        }))
        .collect()
    };
    Ok(rows)
}

pub async fn create_hub(db: &Db, req: CreateHubRequest) -> Result<Uuid> {
    let id = sqlx::query_scalar!(
        r#"INSERT INTO community_hubs (owner_id, slug, name, description, category, timezone, is_private)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id"#,
        req.owner_id,
        req.slug,
        req.name,
        req.description.unwrap_or_default(),
        req.category.as_deref().unwrap_or("general"),
        req.timezone.as_deref().unwrap_or("UTC"),
        req.is_private.unwrap_or(false),
    )
    .fetch_one(db)
    .await?;

    // Automatically make the owner a member
    sqlx::query!(
        "INSERT INTO hub_memberships (hub_id, user_id, role) VALUES ($1, $2, 'owner') ON CONFLICT DO NOTHING",
        id, req.owner_id
    )
    .execute(db)
    .await?;

    Ok(id)
}

pub async fn get_hub(db: &Db, hub_id: Uuid) -> Result<Option<Value>> {
    let row = sqlx::query!(
        r#"SELECT id, slug, name, description, category, timezone,
                  owner_id, member_count, is_private, created_at
           FROM community_hubs WHERE id = $1"#,
        hub_id
    )
    .fetch_optional(db)
    .await?;

    Ok(row.map(|r| serde_json::json!({
        "id": r.id, "slug": r.slug, "name": r.name,
        "description": r.description, "category": r.category,
        "timezone": r.timezone, "owner_id": r.owner_id,
        "member_count": r.member_count, "is_private": r.is_private,
        "created_at": r.created_at,
    })))
}

pub async fn join_hub(db: &Db, hub_id: Uuid, user_id: Uuid) -> Result<()> {
    sqlx::query!(
        "INSERT INTO hub_memberships (hub_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        hub_id, user_id
    )
    .execute(db)
    .await?;

    sqlx::query!(
        "UPDATE community_hubs SET member_count = member_count + 1 WHERE id = $1",
        hub_id
    )
    .execute(db)
    .await?;
    Ok(())
}

pub async fn leave_hub(db: &Db, hub_id: Uuid, user_id: Uuid) -> Result<()> {
    let rows = sqlx::query!(
        "DELETE FROM hub_memberships WHERE hub_id = $1 AND user_id = $2 AND role != 'owner'",
        hub_id, user_id
    )
    .execute(db)
    .await?
    .rows_affected();

    if rows > 0 {
        sqlx::query!(
            "UPDATE community_hubs SET member_count = GREATEST(member_count - 1, 0) WHERE id = $1",
            hub_id
        )
        .execute(db)
        .await?;
    }
    Ok(())
}

// ── Events ────────────────────────────────────────────────────────────────────

pub async fn list_hub_events(db: &Db, hub_id: Uuid) -> Result<Vec<Value>> {
    let rows = sqlx::query!(
        r#"SELECT id, title, description, event_type, timezone,
                  starts_at, ends_at, max_attendees, attendee_count, meeting_url, created_at
           FROM community_events WHERE hub_id = $1
           ORDER BY starts_at ASC"#,
        hub_id
    )
    .fetch_all(db)
    .await?
    .into_iter()
    .map(|r| serde_json::json!({
        "id": r.id, "title": r.title, "description": r.description,
        "event_type": r.event_type, "timezone": r.timezone,
        "starts_at": r.starts_at, "ends_at": r.ends_at,
        "max_attendees": r.max_attendees, "attendee_count": r.attendee_count,
        "meeting_url": r.meeting_url, "created_at": r.created_at,
    }))
    .collect();
    Ok(rows)
}

pub async fn create_hub_event(db: &Db, hub_id: Uuid, req: CreateEventRequest) -> Result<Uuid> {
    let id = sqlx::query_scalar!(
        r#"INSERT INTO community_events
               (hub_id, organizer_id, title, description, event_type, timezone,
                starts_at, ends_at, max_attendees, meeting_url)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING id"#,
        hub_id,
        req.organizer_id,
        req.title,
        req.description.unwrap_or_default(),
        req.event_type.as_deref().unwrap_or("meetup"),
        req.timezone.as_deref().unwrap_or("UTC"),
        req.starts_at,
        req.ends_at,
        req.max_attendees,
        req.meeting_url,
    )
    .fetch_one(db)
    .await?;
    Ok(id)
}

pub async fn rsvp_event(db: &Db, event_id: Uuid, user_id: Uuid) -> Result<()> {
    sqlx::query!(
        "INSERT INTO event_attendees (event_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        event_id, user_id
    )
    .execute(db)
    .await?;
    sqlx::query!(
        "UPDATE community_events SET attendee_count = attendee_count + 1 WHERE id = $1",
        event_id
    )
    .execute(db)
    .await?;
    Ok(())
}

// ── Forum ─────────────────────────────────────────────────────────────────────

pub async fn list_threads(db: &Db, hub_id: Uuid) -> Result<Vec<Value>> {
    let rows = sqlx::query!(
        r#"SELECT id, author_id, title, body, reply_count, pinned, locked, created_at
           FROM forum_threads WHERE hub_id = $1
           ORDER BY pinned DESC, created_at DESC
           LIMIT 100"#,
        hub_id
    )
    .fetch_all(db)
    .await?
    .into_iter()
    .map(|r| serde_json::json!({
        "id": r.id, "author_id": r.author_id, "title": r.title,
        "body": r.body, "reply_count": r.reply_count,
        "pinned": r.pinned, "locked": r.locked, "created_at": r.created_at,
    }))
    .collect();
    Ok(rows)
}

pub async fn create_thread(db: &Db, hub_id: Uuid, req: CreateThreadRequest) -> Result<Uuid> {
    let id = sqlx::query_scalar!(
        "INSERT INTO forum_threads (hub_id, author_id, title, body) VALUES ($1, $2, $3, $4) RETURNING id",
        hub_id, req.author_id, req.title, req.body
    )
    .fetch_one(db)
    .await?;
    Ok(id)
}

pub async fn get_thread(db: &Db, thread_id: Uuid) -> Result<Option<Value>> {
    let row = sqlx::query!(
        "SELECT id, hub_id, author_id, title, body, reply_count, pinned, locked, created_at
         FROM forum_threads WHERE id = $1",
        thread_id
    )
    .fetch_optional(db)
    .await?;
    Ok(row.map(|r| serde_json::json!({
        "id": r.id, "hub_id": r.hub_id, "author_id": r.author_id,
        "title": r.title, "body": r.body, "reply_count": r.reply_count,
        "pinned": r.pinned, "locked": r.locked, "created_at": r.created_at,
    })))
}

pub async fn list_posts(db: &Db, thread_id: Uuid) -> Result<Vec<Value>> {
    let rows = sqlx::query!(
        "SELECT id, author_id, body, created_at FROM forum_posts WHERE thread_id = $1 ORDER BY created_at ASC",
        thread_id
    )
    .fetch_all(db)
    .await?
    .into_iter()
    .map(|r| serde_json::json!({
        "id": r.id, "author_id": r.author_id, "body": r.body, "created_at": r.created_at,
    }))
    .collect();
    Ok(rows)
}

pub async fn create_post(db: &Db, thread_id: Uuid, req: CreatePostRequest) -> Result<Uuid> {
    let id = sqlx::query_scalar!(
        "INSERT INTO forum_posts (thread_id, author_id, body) VALUES ($1, $2, $3) RETURNING id",
        thread_id, req.author_id, req.body
    )
    .fetch_one(db)
    .await?;
    // Increment reply count on the thread
    sqlx::query!(
        "UPDATE forum_threads SET reply_count = reply_count + 1, updated_at = NOW() WHERE id = $1",
        thread_id
    )
    .execute(db)
    .await?;
    Ok(id)
}
