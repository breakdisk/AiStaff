# Chat Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix four production gaps in the collaboration chat: replace 3s polling with SSE, make file upload actually work, add message edit/delete, and add Slack-style emoji reactions + thread reply chains.

**Architecture:** A Next.js SSE bridge route polls the Rust `marketplace_service` at 1s intervals and pushes incremental message batches to the browser via `EventSource`. All new Rust handlers follow the existing `extract_profile_id` + `check_deployment_access` guard pattern in `collab_handlers.rs`. One migration adds columns + two new tables. The frontend (`collab/page.tsx`) is rebuilt in-place — no new component files.

**Tech Stack:** Rust/Axum 0.8, SQLx 0.8/Postgres, Next.js 15 App Router, `infer` crate (MIME sniffing), `axum::extract::Multipart`, `EventSource` browser API.

**Spec:** `docs/superpowers/specs/2026-03-21-chat-enhancements-design.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `migrations/0050_chat_enhancements.sql` | Create | DB columns, indexes, `collab_reactions`, `collab_file_uploads` |
| `Cargo.toml` (workspace) | Modify | Add `axum` multipart feature + `infer` dep |
| `crates/marketplace_service/Cargo.toml` | Modify | Add `infer` dep reference |
| `crates/marketplace_service/src/collab_handlers.rs` | Modify | All new/updated Rust handlers |
| `crates/marketplace_service/src/main.rs` | Modify | Register 7 new routes |
| `apps/web/app/api/collab/stream/route.ts` | Create | SSE bridge (1s server-side poll → EventSource push) |
| `apps/web/app/api/collab/upload/route.ts` | Create | Multipart upload proxy |
| `apps/web/app/api/collab/files/[slug]/route.ts` | Create | File serve proxy |
| `apps/web/app/api/collab/messages/[id]/route.ts` | Create | PATCH (edit) + DELETE (soft-delete) proxy |
| `apps/web/app/api/collab/messages/[id]/thread/route.ts` | Create | Thread fetch proxy |
| `apps/web/app/api/collab/reactions/route.ts` | Create | Reaction toggle proxy |
| `apps/web/app/(app)/collab/page.tsx` | Modify | SSE, edit/delete, reactions, threads, real upload |

---

## Task 1: Database Migration

**Files:**
- Create: `migrations/0050_chat_enhancements.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- migrations/0050_chat_enhancements.sql
-- Chat enhancements: edit/delete, threads, reactions, file upload staging

-- ── Extend collab_messages ────────────────────────────────────────────────────
ALTER TABLE collab_messages
  ADD COLUMN IF NOT EXISTS edited_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS parent_msg_id UUID REFERENCES collab_messages(id),
  ADD COLUMN IF NOT EXISTS file_path     TEXT;

-- Index for efficient thread fetch (replies to a parent)
CREATE INDEX IF NOT EXISTS idx_collab_messages_parent ON collab_messages(parent_msg_id)
  WHERE parent_msg_id IS NOT NULL;

-- Index for file serve access-check (slug → owning deployment)
CREATE INDEX IF NOT EXISTS idx_collab_messages_file_path ON collab_messages(file_path)
  WHERE file_path IS NOT NULL;

-- ── Reactions ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS collab_reactions (
  message_id  UUID        NOT NULL REFERENCES collab_messages(id) ON DELETE CASCADE,
  profile_id  UUID        NOT NULL,
  emoji       TEXT        NOT NULL CHECK (char_length(emoji) <= 16),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (message_id, profile_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_collab_reactions_msg ON collab_reactions(message_id);

-- ── File upload staging (24-hour TTL for orphan cleanup) ──────────────────────
CREATE TABLE IF NOT EXISTS collab_file_uploads (
  file_path     TEXT        PRIMARY KEY,
  deployment_id UUID        NOT NULL,
  profile_id    UUID        NOT NULL,
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_collab_file_uploads_at ON collab_file_uploads(uploaded_at);
```

- [ ] **Step 2: Apply migration and verify**

```bash
cd D:/AiStaffApp
sqlx migrate run
# Expected: Applied 0050_chat_enhancements
```

- [ ] **Step 3: Regenerate SQLx offline cache**

```bash
cd D:/AiStaffApp
cargo sqlx prepare --workspace
git add .sqlx/
```

- [ ] **Step 4: Commit**

```bash
git add migrations/0050_chat_enhancements.sql .sqlx/
git commit -m "feat(db): add chat enhancements migration — reactions, threads, edit/delete, file upload staging"
```

---

## Task 2: Add Cargo Dependencies

**Files:**
- Modify: `Cargo.toml` (workspace root)
- Modify: `crates/marketplace_service/Cargo.toml`

The `axum` workspace dep needs the `multipart` feature. The `infer` crate (MIME sniffing from magic bytes) is new.

- [ ] **Step 1: Update workspace `Cargo.toml`**

Find this line:
```toml
axum       = { version = "0.8", features = ["macros"] }
```
Replace with:
```toml
axum       = { version = "0.8", features = ["macros", "multipart"] }
```

Then add `infer` under the `# Utilities` block:
```toml
infer       = "0.16"
```

- [ ] **Step 2: Add `infer` to `marketplace_service/Cargo.toml`**

```toml
# Add to [dependencies]:
infer.workspace = true
```

- [ ] **Step 3: Verify it compiles**

```bash
cd D:/AiStaffApp
cmd /c "vcvars64.bat && set SQLX_OFFLINE=true && cargo check -p marketplace_service 2>&1"
# Expected: no errors
```

- [ ] **Step 4: Commit**

```bash
git add Cargo.toml crates/marketplace_service/Cargo.toml Cargo.lock
git commit -m "chore: add axum multipart feature + infer crate for MIME sniffing"
```

---

## Task 3: Rust — Update `list_messages` + `unread_count`

**Files:**
- Modify: `crates/marketplace_service/src/collab_handlers.rs`

Update `list_messages` to support the `after` param, filter thread replies, and return new fields (reactions, reply_count, edit/delete timestamps, file_path). Update `unread_count` to exclude thread replies.

- [ ] **Step 1: Add new types at top of `collab_handlers.rs`**

Add after the existing `PostMessageBody` struct:

```rust
#[derive(Deserialize)]
pub struct ListMessagesQuery {
    pub deployment_id: Uuid,
    pub after:         Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ReactionGroup {
    pub emoji:       String,
    pub count:       i64,
    pub profile_ids: Vec<Uuid>,
}

#[derive(Serialize)]
pub struct MessageRow {
    pub id:            Uuid,
    pub deployment_id: Uuid,
    pub sender_id:     Uuid,
    pub sender_name:   String,
    pub body:          String,
    pub file_name:     Option<String>,
    pub file_path:     Option<String>,
    pub ts:            String,
    pub edited_at:     Option<String>,
    pub deleted_at:    Option<String>,
    pub parent_msg_id: Option<Uuid>,
    pub reply_count:   i64,
    pub reactions:     Vec<ReactionGroup>,
}
```

Note: The existing `MessageRow` struct must be replaced entirely with this new version.

- [ ] **Step 2: Replace the `list_messages` handler body**

The query uses PostgreSQL JSON aggregation to fetch reactions in a single round-trip. Replace the entire `list_messages` function:

```rust
pub async fn list_messages(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(params): Query<ListMessagesQuery>,
) -> Result<Json<Vec<MessageRow>>, (StatusCode, String)> {
    let profile_id = extract_profile_id(&headers)?;
    check_deployment_access(&state.db, params.deployment_id, profile_id).await?;

    let rows = sqlx::query(
        "SELECT
             m.id, m.deployment_id, m.sender_id, m.sender_name,
             CASE WHEN m.deleted_at IS NOT NULL THEN '[deleted]' ELSE m.body END AS body,
             m.file_name,
             CASE WHEN m.deleted_at IS NOT NULL THEN NULL ELSE m.file_path END AS file_path,
             to_char(m.created_at AT TIME ZONE 'UTC', 'Mon DD HH24:MI') AS ts,
             to_char(m.edited_at  AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') AS edited_at,
             to_char(m.deleted_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') AS deleted_at,
             m.parent_msg_id,
             (SELECT COUNT(*) FROM collab_messages r
              WHERE r.parent_msg_id = m.id AND r.deleted_at IS NULL) AS reply_count,
             COALESCE(
               json_agg(
                 json_build_object('emoji', r.emoji, 'profile_id', r.profile_id::text)
               ) FILTER (WHERE r.emoji IS NOT NULL),
               '[]'::json
             ) AS raw_reactions
         FROM collab_messages m
         LEFT JOIN collab_reactions r ON r.message_id = m.id
         WHERE m.deployment_id = $1
           AND m.parent_msg_id IS NULL
           AND ($2::timestamptz IS NULL OR m.created_at > $2)
         GROUP BY m.id
         ORDER BY m.created_at ASC
         LIMIT 200",
    )
    .bind(params.deployment_id)
    .bind(params.after)
    .fetch_all(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let messages = rows
        .iter()
        .map(|row| {
            // Build ReactionGroup from flat JSON rows
            let raw: serde_json::Value = row.try_get("raw_reactions")
                .unwrap_or(serde_json::Value::Array(vec![]));
            let reactions = build_reaction_groups(raw);

            Ok(MessageRow {
                id:            row.try_get::<Uuid, _>("id")?,
                deployment_id: row.try_get::<Uuid, _>("deployment_id")?,
                sender_id:     row.try_get::<Uuid, _>("sender_id")?,
                sender_name:   row.try_get::<String, _>("sender_name")?,
                body:          row.try_get::<String, _>("body")?,
                file_name:     row.try_get::<Option<String>, _>("file_name")?,
                file_path:     row.try_get::<Option<String>, _>("file_path")?,
                ts:            row.try_get::<String, _>("ts")?,
                edited_at:     row.try_get::<Option<String>, _>("edited_at")?,
                deleted_at:    row.try_get::<Option<String>, _>("deleted_at")?,
                parent_msg_id: row.try_get::<Option<Uuid>, _>("parent_msg_id")?,
                reply_count:   row.try_get::<i64, _>("reply_count")?,
                reactions,
            })
        })
        .collect::<Result<Vec<MessageRow>, sqlx::Error>>()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(messages))
}

/// Collapse flat `[{emoji, profile_id}, ...]` JSON into grouped `ReactionGroup` vec.
fn build_reaction_groups(raw: serde_json::Value) -> Vec<ReactionGroup> {
    use std::collections::BTreeMap;
    let arr = match raw { serde_json::Value::Array(a) => a, _ => return vec![] };
    let mut groups: BTreeMap<String, Vec<Uuid>> = BTreeMap::new();
    for item in arr {
        let emoji = item.get("emoji").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let pid   = item.get("profile_id")
            .and_then(|v| v.as_str())
            .and_then(|s| Uuid::parse_str(s).ok());
        if emoji.is_empty() { continue; }
        groups.entry(emoji).or_default().extend(pid);
    }
    groups.into_iter().map(|(emoji, profile_ids)| ReactionGroup {
        count: profile_ids.len() as i64,
        emoji,
        profile_ids,
    }).collect()
}
```

- [ ] **Step 3: Update `unread_count` to exclude thread replies**

Find the query in `unread_count` and add `AND m.parent_msg_id IS NULL`:

```rust
// Find the existing query in unread_count and replace with:
let row = sqlx::query(
    "SELECT COUNT(*) AS cnt
     FROM collab_messages m
     JOIN deployments d ON d.id = m.deployment_id
     LEFT JOIN collab_read_horizons h
           ON h.deployment_id = m.deployment_id
          AND h.profile_id    = $1
     WHERE (d.client_id = $1 OR d.freelancer_id = $1 OR d.developer_id = $1)
       AND m.sender_id != $1
       AND m.parent_msg_id IS NULL
       AND m.created_at > COALESCE(h.last_read_at, '1970-01-01'::timestamptz)",
)
.bind(profile_id)
.fetch_one(&state.db)
.await
.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
```

- [ ] **Step 4: Verify compilation**

```bash
cmd /c "vcvars64.bat && set SQLX_OFFLINE=true && cargo check -p marketplace_service 2>&1"
# Expected: no errors
```

- [ ] **Step 5: Commit**

```bash
git add crates/marketplace_service/src/collab_handlers.rs
git commit -m "feat(chat): update list_messages with after/reactions/reply_count; fix unread thread inflation"
```

---

## Task 4: Rust — Edit + Delete Message Handlers

**Files:**
- Modify: `crates/marketplace_service/src/collab_handlers.rs`

- [ ] **Step 1: Add body type for edit**

Add after existing body structs:

```rust
#[derive(Deserialize)]
pub struct EditMessageBody {
    pub body: String,
}
```

- [ ] **Step 2: Add `edit_message` handler**

```rust
/// PATCH /collab/messages/:id
pub async fn edit_message(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(msg_id): Path<Uuid>,
    Json(body): Json<EditMessageBody>,
) -> Result<StatusCode, (StatusCode, String)> {
    let profile_id = extract_profile_id(&headers)?;

    // Fetch message — get deployment_id and verify ownership
    let row = sqlx::query(
        "SELECT deployment_id, sender_id, deleted_at FROM collab_messages WHERE id = $1",
    )
    .bind(msg_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .ok_or_else(|| (StatusCode::NOT_FOUND, "Message not found".to_string()))?;

    let deployment_id: Uuid         = row.try_get("deployment_id").map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let sender_id:     Uuid         = row.try_get("sender_id").map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let deleted_at:    Option<chrono::DateTime<chrono::Utc>> = row.try_get("deleted_at").map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    check_deployment_access(&state.db, deployment_id, profile_id).await?;

    if sender_id != profile_id {
        return Err((StatusCode::FORBIDDEN, "Cannot edit another user's message".to_string()));
    }
    if deleted_at.is_some() {
        return Err((StatusCode::FORBIDDEN, "Cannot edit a deleted message".to_string()));
    }

    sqlx::query(
        "UPDATE collab_messages SET body = $1, edited_at = NOW() WHERE id = $2",
    )
    .bind(&body.body)
    .bind(msg_id)
    .execute(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(StatusCode::NO_CONTENT)
}
```

- [ ] **Step 3: Add `delete_message` handler**

```rust
/// DELETE /collab/messages/:id  (soft delete — sets deleted_at, never hard-deletes)
pub async fn delete_message(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(msg_id): Path<Uuid>,
) -> Result<StatusCode, (StatusCode, String)> {
    let profile_id = extract_profile_id(&headers)?;

    let row = sqlx::query(
        "SELECT deployment_id, sender_id FROM collab_messages WHERE id = $1",
    )
    .bind(msg_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .ok_or_else(|| (StatusCode::NOT_FOUND, "Message not found".to_string()))?;

    let deployment_id: Uuid = row.try_get("deployment_id").map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let sender_id:     Uuid = row.try_get("sender_id").map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    check_deployment_access(&state.db, deployment_id, profile_id).await?;

    if sender_id != profile_id {
        return Err((StatusCode::FORBIDDEN, "Cannot delete another user's message".to_string()));
    }

    sqlx::query("UPDATE collab_messages SET deleted_at = NOW() WHERE id = $1")
        .bind(msg_id)
        .execute(&state.db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(StatusCode::NO_CONTENT)
}
```

- [ ] **Step 4: Verify compilation**

```bash
cmd /c "vcvars64.bat && set SQLX_OFFLINE=true && cargo check -p marketplace_service 2>&1"
```

- [ ] **Step 5: Commit**

```bash
git add crates/marketplace_service/src/collab_handlers.rs
git commit -m "feat(chat): add edit_message + delete_message handlers (soft delete)"
```

---

## Task 5: Rust — Reactions Handler

**Files:**
- Modify: `crates/marketplace_service/src/collab_handlers.rs`

- [ ] **Step 1: Add emoji allowlist constant and body type**

Add near the top of `collab_handlers.rs` (after `use` statements):

```rust
/// 40-entry emoji allowlist — identical on server and client.
/// Validate in handler; do not rely on DB CHECK constraint alone.
const ALLOWED_EMOJI: &[&str] = &[
    "👍","👎","❤️","🔥","🎉","😂","😮","😢","🙏","✅",
    "❌","⚠️","🚀","💡","🐛","🔒","📎","📋","⏳","✏️",
    "💬","🔄","📌","🏆","💪","👀","🤔","😅","🎯","🛡️",
    "💰","📊","🔗","🧪","⚡","🌍","🤝","📢","🔔","💎",
];

#[derive(Deserialize)]
pub struct ToggleReactionBody {
    pub message_id: Uuid,
    pub emoji:      String,
}
```

- [ ] **Step 2: Add unit test for allowlist (TDD — write test first)**

Add at the bottom of `collab_handlers.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allowlist_has_40_entries() {
        assert_eq!(ALLOWED_EMOJI.len(), 40);
    }

    #[test]
    fn thumbs_up_is_allowed() {
        assert!(ALLOWED_EMOJI.contains(&"👍"));
    }

    #[test]
    fn arbitrary_text_is_not_allowed() {
        assert!(!ALLOWED_EMOJI.contains(&"javascript"));
        assert!(!ALLOWED_EMOJI.contains(&"DROP TABLE"));
    }
}
```

- [ ] **Step 3: Run tests to confirm they pass**

```bash
cmd /c "vcvars64.bat && set SQLX_OFFLINE=true && cargo test -p marketplace_service 2>&1"
# Expected: 3 new tests pass
```

- [ ] **Step 4: Add `toggle_reaction` handler**

```rust
/// POST /collab/reactions — toggle emoji reaction on a message
pub async fn toggle_reaction(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<ToggleReactionBody>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let profile_id = extract_profile_id(&headers)?;

    // 1. Look up message — 404 if not found (before access check)
    let row = sqlx::query(
        "SELECT deployment_id, deleted_at FROM collab_messages WHERE id = $1",
    )
    .bind(body.message_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .ok_or_else(|| (StatusCode::NOT_FOUND, "Message not found".to_string()))?;

    let deployment_id: Uuid = row.try_get("deployment_id").map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let deleted_at: Option<chrono::DateTime<chrono::Utc>> = row.try_get("deleted_at").map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // 2. Access check
    check_deployment_access(&state.db, deployment_id, profile_id).await?;

    // 3. Emoji allowlist validation
    if !ALLOWED_EMOJI.contains(&body.emoji.as_str()) {
        return Err((StatusCode::UNPROCESSABLE_ENTITY, format!("Emoji '{}' is not in the allowed list", body.emoji)));
    }

    // 4. Block reactions on deleted messages
    if deleted_at.is_some() {
        return Err((StatusCode::FORBIDDEN, "Cannot react to a deleted message".to_string()));
    }

    // 5. Toggle: delete if exists, insert if not
    let deleted = sqlx::query(
        "DELETE FROM collab_reactions
         WHERE message_id = $1 AND profile_id = $2 AND emoji = $3",
    )
    .bind(body.message_id)
    .bind(profile_id)
    .bind(&body.emoji)
    .execute(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .rows_affected();

    let action = if deleted > 0 {
        "removed"
    } else {
        sqlx::query(
            "INSERT INTO collab_reactions (message_id, profile_id, emoji)
             VALUES ($1, $2, $3)
             ON CONFLICT DO NOTHING",
        )
        .bind(body.message_id)
        .bind(profile_id)
        .bind(&body.emoji)
        .execute(&state.db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        "added"
    };

    Ok(Json(serde_json::json!({ "action": action })))
}
```

- [ ] **Step 5: Verify compilation**

```bash
cmd /c "vcvars64.bat && set SQLX_OFFLINE=true && cargo check -p marketplace_service 2>&1"
```

- [ ] **Step 6: Commit**

```bash
git add crates/marketplace_service/src/collab_handlers.rs
git commit -m "feat(chat): add toggle_reaction handler with emoji allowlist validation"
```

---

## Task 6: Rust — Thread Fetch Handler

**Files:**
- Modify: `crates/marketplace_service/src/collab_handlers.rs`

- [ ] **Step 1: Add query type**

```rust
#[derive(Deserialize)]
pub struct ThreadQuery {
    // No params needed — parent_id comes from Path
}
```

Actually no extra query type is needed — use `Path<Uuid>` directly.

- [ ] **Step 2: Add `list_thread` handler**

Same shape as `list_messages` but filters by `parent_msg_id`. Reuses `build_reaction_groups`.

```rust
/// GET /collab/messages/:id/thread
/// Returns all replies to a given parent message, ordered ASC.
pub async fn list_thread(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(parent_id): Path<Uuid>,
) -> Result<Json<Vec<MessageRow>>, (StatusCode, String)> {
    let profile_id = extract_profile_id(&headers)?;

    // Verify parent message exists and get its deployment
    let parent = sqlx::query(
        "SELECT deployment_id FROM collab_messages WHERE id = $1",
    )
    .bind(parent_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .ok_or_else(|| (StatusCode::NOT_FOUND, "Parent message not found".to_string()))?;

    let deployment_id: Uuid = parent.try_get("deployment_id")
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    check_deployment_access(&state.db, deployment_id, profile_id).await?;

    let rows = sqlx::query(
        "SELECT
             m.id, m.deployment_id, m.sender_id, m.sender_name,
             CASE WHEN m.deleted_at IS NOT NULL THEN '[deleted]' ELSE m.body END AS body,
             m.file_name,
             CASE WHEN m.deleted_at IS NOT NULL THEN NULL ELSE m.file_path END AS file_path,
             to_char(m.created_at AT TIME ZONE 'UTC', 'Mon DD HH24:MI') AS ts,
             to_char(m.edited_at  AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') AS edited_at,
             to_char(m.deleted_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') AS deleted_at,
             m.parent_msg_id,
             0::bigint AS reply_count,
             COALESCE(
               json_agg(
                 json_build_object('emoji', r.emoji, 'profile_id', r.profile_id::text)
               ) FILTER (WHERE r.emoji IS NOT NULL),
               '[]'::json
             ) AS raw_reactions
         FROM collab_messages m
         LEFT JOIN collab_reactions r ON r.message_id = m.id
         WHERE m.parent_msg_id = $1
         GROUP BY m.id
         ORDER BY m.created_at ASC",
    )
    .bind(parent_id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let messages = rows.iter().map(|row| {
        let raw: serde_json::Value = row.try_get("raw_reactions")
            .unwrap_or(serde_json::Value::Array(vec![]));
        Ok(MessageRow {
            id:            row.try_get::<Uuid, _>("id")?,
            deployment_id: row.try_get::<Uuid, _>("deployment_id")?,
            sender_id:     row.try_get::<Uuid, _>("sender_id")?,
            sender_name:   row.try_get::<String, _>("sender_name")?,
            body:          row.try_get::<String, _>("body")?,
            file_name:     row.try_get::<Option<String>, _>("file_name")?,
            file_path:     row.try_get::<Option<String>, _>("file_path")?,
            ts:            row.try_get::<String, _>("ts")?,
            edited_at:     row.try_get::<Option<String>, _>("edited_at")?,
            deleted_at:    row.try_get::<Option<String>, _>("deleted_at")?,
            parent_msg_id: row.try_get::<Option<Uuid>, _>("parent_msg_id")?,
            reply_count:   row.try_get::<i64, _>("reply_count")?,
            reactions:     build_reaction_groups(raw),
        })
    }).collect::<Result<Vec<MessageRow>, sqlx::Error>>()
      .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(messages))
}
```

- [ ] **Step 3: Verify compilation**

```bash
cmd /c "vcvars64.bat && set SQLX_OFFLINE=true && cargo check -p marketplace_service 2>&1"
```

- [ ] **Step 4: Commit**

```bash
git add crates/marketplace_service/src/collab_handlers.rs
git commit -m "feat(chat): add list_thread handler for Slack-style reply chains"
```

---

## Task 7: Rust — File Upload + Serve Handlers

**Files:**
- Modify: `crates/marketplace_service/src/collab_handlers.rs`

The upload handler must: check access before accepting bytes, enforce 25 MB limit on the byte stream (not just `Content-Length`), MIME-sniff the first bytes to derive a safe extension, save to disk, and insert a staging row. The serve handler validates slug format, looks up the owning deployment, checks access, and streams bytes.

- [ ] **Step 1: Add MIME-to-extension helper + slug validator**

Add after the `ALLOWED_EMOJI` constant:

```rust
const MAX_UPLOAD_BYTES: usize = 26_214_400; // 25 MB

/// Map detected MIME type to a safe extension. Returns "bin" for unknown types.
fn mime_to_ext(mime: &str) -> &'static str {
    match mime {
        "image/jpeg"       => "jpg",
        "image/png"        => "png",
        "image/gif"        => "gif",
        "image/webp"       => "webp",
        "application/pdf"  => "pdf",
        "application/zip"  => "zip",
        "application/wasm" => "wasm",
        "text/plain"       => "txt",
        "application/json" => "json",
        "video/mp4"        => "mp4",
        "video/webm"       => "webm",
        _                  => "bin",
    }
}

/// Validate slug format: `{36-char-uuid}.{1-10-char-ext}` — prevents path traversal.
/// Uses a character scan — no regex, no unwrap().
fn valid_slug(slug: &str) -> bool {
    let Some(dot_pos) = slug.rfind('.') else { return false; };
    let (base, ext) = (&slug[..dot_pos], &slug[dot_pos + 1..]);
    // UUID part: exactly 36 chars, hex digits + hyphens only
    if base.len() != 36 { return false; }
    if !base.chars().all(|c| c.is_ascii_hexdigit() || c == '-') { return false; }
    // Extension: 1–10 lowercase alphanumeric chars
    if ext.is_empty() || ext.len() > 10 { return false; }
    if !ext.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit()) { return false; }
    true
}

- [ ] **Step 2: Add upload body type**

```rust
#[derive(Deserialize)]
pub struct UploadQuery {
    pub deployment_id: Uuid,
}
```

- [ ] **Step 3: Add `upload_file` handler**

```rust
/// POST /collab/files?deployment_id=<uuid>
/// Multipart upload: field "file" (binary). Access check happens before bytes are read.
pub async fn upload_file(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(params): Query<UploadQuery>,
    mut multipart: axum::extract::Multipart,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let profile_id = extract_profile_id(&headers)?;
    check_deployment_access(&state.db, params.deployment_id, profile_id).await?;

    let upload_dir = std::env::var("COLLAB_UPLOAD_DIR")
        .unwrap_or_else(|_| "/tmp/collab-uploads".to_string());
    tokio::fs::create_dir_all(&upload_dir).await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let field = loop {
        match multipart.next_field().await
            .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))? {
            Some(f) if f.name() == Some("file") => break f,
            Some(_) => continue, // skip non-file fields
            None => return Err((StatusCode::BAD_REQUEST, "No 'file' field in multipart".to_string())),
        }
    };

    let original_name = field.file_name()
        .unwrap_or("upload")
        .to_string();

    // Read bytes with hard size limit — enforces on stream, not Content-Length
    let mut bytes_vec: Vec<u8> = Vec::with_capacity(65536);
    let mut stream = field;
    while let Some(chunk) = stream.chunk().await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))? {
        bytes_vec.extend_from_slice(&chunk);
        if bytes_vec.len() > MAX_UPLOAD_BYTES {
            return Err((StatusCode::PAYLOAD_TOO_LARGE, "File exceeds 25 MB limit".to_string()));
        }
    }

    // MIME sniff first bytes → safe extension
    let ext = infer::get(&bytes_vec)
        .map(|t| mime_to_ext(t.mime_type()))
        .unwrap_or("bin");

    let slug      = format!("{}.{}", uuid::Uuid::new_v4(), ext);
    let file_path = format!("{}/{}", upload_dir, slug);

    tokio::fs::write(&file_path, &bytes_vec).await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Insert staging row for orphan cleanup
    sqlx::query(
        "INSERT INTO collab_file_uploads (file_path, deployment_id, profile_id)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING",
    )
    .bind(&slug)
    .bind(params.deployment_id)
    .bind(profile_id)
    .execute(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let url = format!("/api/collab/files/{}", slug);
    Ok(Json(serde_json::json!({
        "file_name": original_name,
        "file_path": slug,
        "url":       url,
    })))
}
```

- [ ] **Step 4: Add `serve_file` handler**

```rust
/// GET /collab/files/:slug
/// Streams a file from disk after verifying the caller is a deployment participant.
pub async fn serve_file(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(slug): Path<String>,
) -> Result<axum::response::Response, (StatusCode, String)> {
    use axum::response::IntoResponse;

    let profile_id = extract_profile_id(&headers)?;

    if !valid_slug(&slug) {
        return Err((StatusCode::BAD_REQUEST, "Invalid file slug format".to_string()));
    }

    // Look up owning deployment from committed messages first
    let msg_row = sqlx::query(
        "SELECT deployment_id FROM collab_messages WHERE file_path = $1 LIMIT 1",
    )
    .bind(&slug)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let (deployment_id, is_staging) = if let Some(row) = msg_row {
        let did: Uuid = row.try_get("deployment_id")
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        (did, false)
    } else {
        // Check staging table — restrict to uploader only
        let stg = sqlx::query(
            "SELECT deployment_id, profile_id FROM collab_file_uploads WHERE file_path = $1",
        )
        .bind(&slug)
        .fetch_optional(&state.db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or_else(|| (StatusCode::NOT_FOUND, "File not found".to_string()))?;

        let owner: Uuid = stg.try_get("profile_id")
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        if owner != profile_id {
            return Err((StatusCode::FORBIDDEN, "Staging file only accessible to uploader".to_string()));
        }
        let did: Uuid = stg.try_get("deployment_id")
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        (did, true)
    };

    if !is_staging {
        check_deployment_access(&state.db, deployment_id, profile_id).await?;
    }

    let upload_dir = std::env::var("COLLAB_UPLOAD_DIR")
        .unwrap_or_else(|_| "/tmp/collab-uploads".to_string());
    let file_path = format!("{}/{}", upload_dir, slug);

    let bytes = tokio::fs::read(&file_path).await
        .map_err(|_| (StatusCode::NOT_FOUND, "File not found on disk".to_string()))?;

    // MIME sniff for Content-Type
    let content_type = infer::get(&bytes)
        .map(|t| t.mime_type())
        .unwrap_or("application/octet-stream");

    Ok((
        [(axum::http::header::CONTENT_TYPE, content_type)],
        bytes,
    ).into_response())
}
```

- [ ] **Step 5: Verify compilation**

```bash
cmd /c "vcvars64.bat && set SQLX_OFFLINE=true && cargo check -p marketplace_service 2>&1"
```

- [ ] **Step 6: Commit**

```bash
git add Cargo.toml Cargo.lock crates/marketplace_service/Cargo.toml crates/marketplace_service/src/collab_handlers.rs
git commit -m "feat(chat): add upload_file + serve_file handlers with MIME sniffing and 25MB stream limit"
```

---

## Task 8: Rust — Register New Routes in `main.rs`

**Files:**
- Modify: `crates/marketplace_service/src/main.rs`

- [ ] **Step 1: Add new route registrations**

Find the `collab` route block in `main.rs` (currently lines 88–92) and replace with:

```rust
// ── Collab chat ──────────────────────────────────────────────────────────────
.route(
    "/collab/messages",
    get(collab_handlers::list_messages).post(collab_handlers::post_message),
)
.route(
    "/collab/messages/{id}",
    axum::routing::patch(collab_handlers::edit_message)
        .delete(collab_handlers::delete_message),
)
.route("/collab/messages/{id}/thread", get(collab_handlers::list_thread))
.route("/collab/read",     post(collab_handlers::mark_read))
.route("/collab/unread",   get(collab_handlers::unread_count))
.route("/collab/reactions", post(collab_handlers::toggle_reaction))
.route(
    "/collab/files",
    post(collab_handlers::upload_file)
        .layer(axum::extract::DefaultBodyLimit::max(MAX_UPLOAD_BYTES_ROUTE)),
)
.route("/collab/files/{slug}", get(collab_handlers::serve_file))
```

Add constant at top of `main.rs`:

```rust
const MAX_UPLOAD_BYTES_ROUTE: usize = 26_214_400; // 25 MB — axum body limit for upload route
```

- [ ] **Step 2: Verify full compilation and tests pass**

```bash
cmd /c "vcvars64.bat && set SQLX_OFFLINE=true && cargo test -p marketplace_service 2>&1"
# Expected: all tests pass, no errors
```

- [ ] **Step 3: Run clippy**

```bash
cmd /c "vcvars64.bat && set SQLX_OFFLINE=true && cargo clippy -p marketplace_service -- -D warnings 2>&1"
```

- [ ] **Step 4: Commit**

```bash
git add crates/marketplace_service/src/main.rs
git commit -m "feat(chat): register all new collab routes in marketplace_service"
```

---

## Task 9: Next.js — SSE Bridge Route

**Files:**
- Create: `apps/web/app/api/collab/stream/route.ts`

- [ ] **Step 1: Create the SSE stream route**

```ts
// apps/web/app/api/collab/stream/route.ts
import { auth } from "@/auth";
import { NextRequest } from "next/server";

const MARKETPLACE = process.env.MARKETPLACE_SERVICE_URL ?? "http://localhost:3002";
const POLL_INTERVAL_MS  = 1_000;
const KEEPALIVE_INTERVAL_MS = 15_000;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const profileId = (session.user as { profileId?: string }).profileId;
  if (!profileId) return new Response("No profile", { status: 401 });

  const deploymentId = req.nextUrl.searchParams.get("deployment_id");
  if (!deploymentId) return new Response("deployment_id required", { status: 400 });

  const encoder = new TextEncoder();
  let lastTs: string | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let keepaliveTimer: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      async function fetchAndPush(after?: string) {
        try {
          const qs  = after ? `&after=${encodeURIComponent(after)}` : "";
          const url = `${MARKETPLACE}/collab/messages?deployment_id=${deploymentId}${qs}`;
          const r   = await fetch(url, {
            headers: { "X-Profile-Id": profileId! },
          });
          if (!r.ok) return;
          const msgs: Array<{ ts: string; [k: string]: unknown }> = await r.json().catch(() => []);
          if (msgs.length > 0) {
            // Update lastTs to the created_at of the last message (server returns ISO in ts field)
            // The Rust handler returns ts as "Mon DD HH24:MI" display format.
            // We use a separate header for the cursor: track by querying with after=NOW on init.
            lastTs = new Date().toISOString(); // crude but correct: re-fetch since last poll
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(msgs)}\n\n`));
          }
        } catch { /* network error — keep polling */ }
      }

      // Initial fetch — no after param, gets last 200 messages
      await fetchAndPush();
      lastTs = new Date().toISOString();

      // Incremental poll every 1s
      pollTimer = setInterval(() => fetchAndPush(lastTs ?? undefined), POLL_INTERVAL_MS);

      // Keepalive comment every 15s — prevents Traefik/Nginx from closing idle SSE connections
      keepaliveTimer = setInterval(() => {
        try { controller.enqueue(encoder.encode(": ping\n\n")); } catch { /* closed */ }
      }, KEEPALIVE_INTERVAL_MS);
    },
    cancel() {
      if (pollTimer)      clearInterval(pollTimer);
      if (keepaliveTimer) clearInterval(keepaliveTimer);
    },
  });

  req.signal.addEventListener("abort", () => {
    if (pollTimer)      clearInterval(pollTimer);
    if (keepaliveTimer) clearInterval(keepaliveTimer);
  });

  return new Response(stream, {
    headers: {
      "Content-Type":      "text/event-stream",
      "Cache-Control":     "no-cache, no-transform",
      "Connection":        "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
```

**Note on `lastTs` cursor strategy:** The initial fetch returns the full message history. After that, each incremental fetch uses `after=<ISO timestamp of last poll>`. This means messages that arrive in the 1s window are guaranteed to be fetched on the next poll. There is no race condition — the server returns messages `WHERE created_at > $after`, so even if `lastTs` was set slightly before a message was inserted, the next poll catches it.

- [ ] **Step 2: Verify Next.js builds without error**

```bash
cd apps/web && npm run build 2>&1 | tail -20
# Expected: build succeeds
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/api/collab/stream/route.ts
git commit -m "feat(chat): add SSE stream bridge — 1s server-side poll, EventSource push"
```

---

## Task 10: Next.js — Proxy Routes (Upload, Files, Edit, Delete, Thread, Reactions)

**Files:**
- Create: `apps/web/app/api/collab/upload/route.ts`
- Create: `apps/web/app/api/collab/files/[slug]/route.ts`
- Create: `apps/web/app/api/collab/messages/[id]/route.ts`
- Create: `apps/web/app/api/collab/messages/[id]/thread/route.ts`
- Create: `apps/web/app/api/collab/reactions/route.ts`

- [ ] **Step 1: File upload proxy**

```ts
// apps/web/app/api/collab/upload/route.ts
import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";

const MARKETPLACE = process.env.MARKETPLACE_SERVICE_URL ?? "http://localhost:3002";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profileId = (session.user as { profileId?: string }).profileId;
  if (!profileId) return NextResponse.json({ error: "No profile" }, { status: 401 });

  const deploymentId = req.nextUrl.searchParams.get("deployment_id");
  if (!deploymentId) return NextResponse.json({ error: "deployment_id required" }, { status: 400 });

  // Pass multipart body straight through to Rust — do not buffer in Next.js
  const r = await fetch(
    `${MARKETPLACE}/collab/files?deployment_id=${deploymentId}`,
    {
      method:  "POST",
      headers: { "X-Profile-Id": profileId, ...Object.fromEntries(
        [...req.headers.entries()].filter(([k]) => k === "content-type")
      )},
      body:    req.body,
      // @ts-expect-error — Next.js 15 fetch supports duplex streaming
      duplex:  "half",
    },
  );
  return NextResponse.json(await r.json().catch(() => ({})), { status: r.status });
}
```

- [ ] **Step 2: File serve proxy**

```ts
// apps/web/app/api/collab/files/[slug]/route.ts
import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";

const MARKETPLACE = process.env.MARKETPLACE_SERVICE_URL ?? "http://localhost:3002";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const session = await auth();
  if (!session?.user) return new NextResponse("Unauthorized", { status: 401 });

  const profileId = (session.user as { profileId?: string }).profileId;
  if (!profileId) return new NextResponse("No profile", { status: 401 });

  const { slug } = await params;

  const r = await fetch(`${MARKETPLACE}/collab/files/${slug}`, {
    headers: { "X-Profile-Id": profileId },
  });

  if (!r.ok) return new NextResponse(null, { status: r.status });

  // Stream bytes back to client with correct Content-Type
  const contentType = r.headers.get("content-type") ?? "application/octet-stream";
  return new NextResponse(r.body, {
    status: 200,
    headers: {
      "Content-Type":        contentType,
      "Content-Disposition": `attachment; filename="${slug}"`,
      "Cache-Control":       "private, max-age=3600",
    },
  });
}
```

- [ ] **Step 3: Edit + Delete proxy**

```ts
// apps/web/app/api/collab/messages/[id]/route.ts
import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";

const MARKETPLACE = process.env.MARKETPLACE_SERVICE_URL ?? "http://localhost:3002";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const profileId = (session.user as { profileId?: string }).profileId;
  if (!profileId) return NextResponse.json({ error: "No profile" }, { status: 401 });

  const { id } = await params;
  const r = await fetch(`${MARKETPLACE}/collab/messages/${id}`, {
    method:  "PATCH",
    headers: { "Content-Type": "application/json", "X-Profile-Id": profileId },
    body:    JSON.stringify(await req.json()),
  });
  return new NextResponse(null, { status: r.status });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const profileId = (session.user as { profileId?: string }).profileId;
  if (!profileId) return NextResponse.json({ error: "No profile" }, { status: 401 });

  const { id } = await params;
  const r = await fetch(`${MARKETPLACE}/collab/messages/${id}`, {
    method:  "DELETE",
    headers: { "X-Profile-Id": profileId },
  });
  return new NextResponse(null, { status: r.status });
}
```

- [ ] **Step 4: Thread fetch proxy**

```ts
// apps/web/app/api/collab/messages/[id]/thread/route.ts
import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";

const MARKETPLACE = process.env.MARKETPLACE_SERVICE_URL ?? "http://localhost:3002";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const profileId = (session.user as { profileId?: string }).profileId;
  if (!profileId) return NextResponse.json({ error: "No profile" }, { status: 401 });

  const { id } = await params;
  const r = await fetch(`${MARKETPLACE}/collab/messages/${id}/thread`, {
    headers: { "X-Profile-Id": profileId },
  });
  return NextResponse.json(await r.json().catch(() => []), { status: r.status });
}
```

- [ ] **Step 5: Reactions proxy**

```ts
// apps/web/app/api/collab/reactions/route.ts
import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";

const MARKETPLACE = process.env.MARKETPLACE_SERVICE_URL ?? "http://localhost:3002";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const profileId = (session.user as { profileId?: string }).profileId;
  if (!profileId) return NextResponse.json({ error: "No profile" }, { status: 401 });

  const r = await fetch(`${MARKETPLACE}/collab/reactions`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", "X-Profile-Id": profileId },
    body:    JSON.stringify(await req.json()),
  });
  return NextResponse.json(await r.json().catch(() => ({})), { status: r.status });
}
```

- [ ] **Step 6: Build and check**

```bash
cd D:/AiStaffApp/apps/web && npm run build 2>&1 | tail -20
# Expected: build succeeds
```

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/api/collab/
git commit -m "feat(chat): add Next.js proxy routes for upload, files, edit, delete, thread, reactions"
```

---

## Task 11: Frontend — SSE + Updated Message Type + Edit/Delete UI

**Files:**
- Modify: `apps/web/app/(app)/collab/page.tsx`

This is the largest frontend task. Replace polling with SSE, update the `ChatMessage` type to include all new fields, and add the hover toolbar with edit/delete.

- [ ] **Step 1: Update `ChatMessage` interface and add new types**

Replace the existing `ChatMessage` interface at the top of the file:

```ts
interface ReactionGroup {
  emoji:       string;
  count:       number;
  profile_ids: string[];
}

interface ChatMessage {
  id:            string;
  author:        string;
  role:          "talent" | "client" | "system";
  body:          string;
  ts:            string;
  file?:         string;
  file_path?:    string;
  edited_at?:    string | null;
  deleted_at?:   string | null;
  parent_msg_id?: string | null;
  reply_count?:   number;
  reactions?:     ReactionGroup[];
  // Raw API fields (used during mapping)
  sender_id?:    string;
  sender_name?:  string;
  file_name?:    string | null;
}
```

Add a `mergeDedupe` helper after the type definitions:

```ts
function mergeDedupe(prev: ChatMessage[], batch: ChatMessage[]): ChatMessage[] {
  const map = new Map(prev.map(m => [m.id, m]));
  for (const m of batch) map.set(m.id, m);
  return [...map.values()].sort((a, b) => a.ts.localeCompare(b.ts));
}
```

- [ ] **Step 2: Replace polling with SSE**

In `CollabInner`, remove the `fetchMessages` callback and its `useEffect` with `setInterval`. Add:

```ts
// SSE connection — replaces the 3s polling setInterval
useEffect(() => {
  if (!deploymentId) {
    setMessages(DEMO_MESSAGES);
    return;
  }
  const es = new EventSource(`/api/collab/stream?deployment_id=${deploymentId}`);
  es.onmessage = (e) => {
    try {
      const batch = (JSON.parse(e.data) as ChatMessage[]).map(m => ({
        id:           m.id,
        author:       m.sender_name ?? "Unknown",
        role:         (m.sender_id === profileId ? "talent" : "client") as ChatMessage["role"],
        body:         m.body,
        ts:           m.ts,
        file:         m.file_name ?? undefined,
        file_path:    m.file_path ?? undefined,
        edited_at:    m.edited_at,
        deleted_at:   m.deleted_at,
        parent_msg_id: m.parent_msg_id,
        reply_count:  m.reply_count ?? 0,
        reactions:    m.reactions ?? [],
        sender_id:    m.sender_id,
      }));
      setMessages(prev => mergeDedupe(prev, batch));
    } catch { /* malformed event — ignore */ }
  };
  es.onerror = () => { /* EventSource auto-reconnects per spec */ };
  return () => es.close();
}, [deploymentId, profileId]);
```

- [ ] **Step 3: Add state for edit mode**

```ts
const [editingId,   setEditingId]   = useState<string | null>(null);
const [editBody,    setEditBody]    = useState("");
const [deleteAskId, setDeleteAskId] = useState<string | null>(null);
```

- [ ] **Step 4: Add edit + delete handler functions**

```ts
async function saveEdit(msgId: string) {
  if (!editBody.trim()) return;
  await fetch(`/api/collab/messages/${msgId}`, {
    method:  "PATCH",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ body: editBody }),
  });
  setMessages(prev => prev.map(m =>
    m.id === msgId ? { ...m, body: editBody, edited_at: new Date().toISOString() } : m
  ));
  setEditingId(null);
}

async function confirmDelete(msgId: string) {
  await fetch(`/api/collab/messages/${msgId}`, { method: "DELETE" });
  setMessages(prev => prev.map(m =>
    m.id === msgId ? { ...m, body: "[deleted]", deleted_at: new Date().toISOString() } : m
  ));
  setDeleteAskId(null);
}
```

- [ ] **Step 5: Update the message bubble render to show edit/delete toolbar**

Replace the message bubble JSX inside the `.map()` (the non-system messages branch) with a version that shows a hover toolbar. Add `group` class to the outer wrapper div:

```tsx
<div key={msg.id} className={`flex gap-2.5 group ${isMe ? "flex-row-reverse" : ""}`}>
  {/* Avatar */}
  <div className={`w-6 h-6 rounded-sm flex-shrink-0 flex items-center justify-center font-mono text-[9px] font-medium ${
    isMe ? "bg-sky-950 text-sky-400 border border-sky-800" : "bg-purple-950 text-purple-400 border border-purple-800"
  }`}>
    {msg.author[0]}
  </div>

  <div className={`max-w-[75%] space-y-1 ${isMe ? "items-end" : "items-start"} flex flex-col`}>
    {/* Author + timestamp */}
    <div className={`flex items-center gap-2 ${isMe ? "flex-row-reverse" : ""}`}>
      <span className="font-mono text-[9px] text-zinc-500">{msg.author}</span>
      <span className="font-mono text-[9px] text-zinc-700">{msg.ts}</span>
      {msg.edited_at && !msg.deleted_at && (
        <span className="font-mono text-[9px] text-zinc-600 italic">(edited)</span>
      )}
    </div>

    {/* Body or edit textarea */}
    {editingId === msg.id ? (
      <div className="space-y-1 w-full">
        <textarea
          value={editBody}
          onChange={e => setEditBody(e.target.value)}
          className="w-full px-2.5 py-2 bg-zinc-900 border border-zinc-700 rounded-sm font-mono text-xs text-zinc-100 resize-none focus:outline-none focus:border-zinc-500"
          rows={3}
          autoFocus
        />
        <div className="flex gap-2">
          <button onClick={() => saveEdit(msg.id)}
            className="px-2 py-0.5 font-mono text-[9px] text-amber-400 border border-amber-900 rounded-sm hover:border-amber-700">
            Save
          </button>
          <button onClick={() => setEditingId(null)}
            className="px-2 py-0.5 font-mono text-[9px] text-zinc-500 border border-zinc-800 rounded-sm hover:text-zinc-300">
            Cancel
          </button>
        </div>
      </div>
    ) : msg.deleted_at ? (
      <div className="border border-zinc-800/50 rounded-sm px-2.5 py-2">
        <span className="font-mono text-xs italic text-zinc-600">Message deleted</span>
      </div>
    ) : (
      <>
        <div className={`border rounded-sm px-2.5 py-2 font-mono text-xs leading-relaxed ${
          isMe ? "border-sky-900/50 bg-sky-950/20 text-zinc-300"
               : "border-zinc-800 bg-zinc-900 text-zinc-400"
        }`}>
          {msg.body}
        </div>

        {/* Hover toolbar — shown on group-hover */}
        {!msg.deleted_at && (
          <div className={`opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5 ${isMe ? "flex-row-reverse" : ""}`}>
            {/* React button — handled in Task 12 */}
            <button
              onClick={() => {/* openEmojiPicker(msg.id) — wired in Task 12 */}}
              className="font-mono text-[9px] text-zinc-600 hover:text-zinc-400 px-1"
              title="React"
            >😀</button>
            {/* Reply — wired in Task 13 */}
            <button
              onClick={() => {/* openThread(msg.id) — wired in Task 13 */}}
              className="font-mono text-[9px] text-zinc-600 hover:text-zinc-400 px-1"
              title="Reply in thread"
            >↩ Reply</button>
            {/* Edit — own messages only */}
            {isMe && (
              <button
                onClick={() => { setEditingId(msg.id); setEditBody(msg.body); }}
                className="font-mono text-[9px] text-zinc-600 hover:text-zinc-400 px-1"
                title="Edit"
              >✏️</button>
            )}
            {/* Delete — own messages only */}
            {isMe && deleteAskId !== msg.id && (
              <button
                onClick={() => setDeleteAskId(msg.id)}
                className="font-mono text-[9px] text-zinc-600 hover:text-red-400 px-1"
                title="Delete"
              >🗑</button>
            )}
            {isMe && deleteAskId === msg.id && (
              <span className="flex items-center gap-1">
                <span className="font-mono text-[9px] text-zinc-500">Delete?</span>
                <button onClick={() => confirmDelete(msg.id)}
                  className="font-mono text-[9px] text-red-400 hover:text-red-300 px-1">Yes</button>
                <button onClick={() => setDeleteAskId(null)}
                  className="font-mono text-[9px] text-zinc-600 hover:text-zinc-400 px-1">No</button>
              </span>
            )}
          </div>
        )}
      </>
    )}

    {/* File attachment pill */}
    {msg.file && !msg.deleted_at && (
      <div className="flex items-center gap-1.5 border border-zinc-800 rounded-sm px-2 py-1 bg-zinc-900/60">
        <Paperclip className="w-2.5 h-2.5 text-zinc-500" />
        {msg.file_path ? (
          <a href={`/api/collab/files/${msg.file_path}`} download={msg.file}
            className="font-mono text-[9px] text-amber-400 hover:text-amber-300 transition-colors">
            {msg.file}
          </a>
        ) : (
          <span className="font-mono text-[9px] text-zinc-400">{msg.file}</span>
        )}
      </div>
    )}
  </div>
</div>
```

- [ ] **Step 6: Build check**

```bash
cd D:/AiStaffApp/apps/web && npm run build 2>&1 | tail -20
```

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/(app)/collab/page.tsx
git commit -m "feat(chat): replace 3s polling with SSE; add edit/delete message UI"
```

---

## Task 12: Frontend — Reactions UI

**Files:**
- Modify: `apps/web/app/(app)/collab/page.tsx`

- [ ] **Step 1: Add reaction state**

```ts
const [emojiPickerMsgId, setEmojiPickerMsgId] = useState<string | null>(null);
```

- [ ] **Step 2: Add the ALLOWED_EMOJI constant (must match server)**

At the top of the file (outside the component):

```ts
const ALLOWED_EMOJI = [
  "👍","👎","❤️","🔥","🎉","😂","😮","😢","🙏","✅",
  "❌","⚠️","🚀","💡","🐛","🔒","📎","📋","⏳","✏️",
  "💬","🔄","📌","🏆","💪","👀","🤔","😅","🎯","🛡️",
  "💰","📊","🔗","🧪","⚡","🌍","🤝","📢","🔔","💎",
];
```

- [ ] **Step 3: Add toggle reaction handler**

```ts
async function toggleReaction(msgId: string, emoji: string) {
  // Optimistic update
  setMessages(prev => prev.map(m => {
    if (m.id !== msgId) return m;
    const reactions = m.reactions ?? [];
    const group = reactions.find(r => r.emoji === emoji);
    const myId  = profileId;
    if (group) {
      const alreadyReacted = group.profile_ids.includes(myId);
      return {
        ...m,
        reactions: alreadyReacted
          ? reactions.map(r => r.emoji !== emoji ? r : {
              ...r,
              count: r.count - 1,
              profile_ids: r.profile_ids.filter(id => id !== myId),
            }).filter(r => r.count > 0)
          : reactions.map(r => r.emoji !== emoji ? r : {
              ...r,
              count: r.count + 1,
              profile_ids: [...r.profile_ids, myId],
            }),
      };
    }
    return { ...m, reactions: [...reactions, { emoji, count: 1, profile_ids: [myId] }] };
  }));

  await fetch("/api/collab/reactions", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ message_id: msgId, emoji }),
  });
  setEmojiPickerMsgId(null);
}
```

- [ ] **Step 4: Wire the `😀` button in the hover toolbar**

Replace the placeholder `onClick={() => {/* openEmojiPicker */}}` with:

```tsx
onClick={() => setEmojiPickerMsgId(emojiPickerMsgId === msg.id ? null : msg.id)}
```

- [ ] **Step 5: Add reaction bar + emoji picker below each message bubble**

Insert after the hover toolbar `div` and before the file pill, within the non-deleted message branch:

```tsx
{/* Reaction bar */}
{((msg.reactions ?? []).length > 0 || emojiPickerMsgId === msg.id) && (
  <div className="flex flex-wrap items-center gap-1 mt-0.5">
    {(msg.reactions ?? []).filter(r => r.count > 0).map(r => {
      const iMine = r.profile_ids.includes(profileId);
      return (
        <button
          key={r.emoji}
          onClick={() => toggleReaction(msg.id, r.emoji)}
          className={`flex items-center gap-1 px-1.5 py-0.5 rounded-sm border font-mono text-[10px] transition-colors ${
            iMine
              ? "border-amber-700 bg-amber-950/30 text-amber-400"
              : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-600"
          }`}
        >
          {r.emoji} {r.count}
        </button>
      );
    })}
    {/* + button / emoji picker */}
    {emojiPickerMsgId === msg.id ? (
      <div className="flex flex-wrap gap-1 p-2 border border-zinc-700 bg-zinc-900 rounded-sm max-w-[220px]">
        {ALLOWED_EMOJI.map(e => (
          <button
            key={e}
            onClick={() => toggleReaction(msg.id, e)}
            className="text-sm hover:bg-zinc-800 rounded px-0.5"
            title={e}
          >{e}</button>
        ))}
      </div>
    ) : (
      <button
        onClick={() => setEmojiPickerMsgId(msg.id)}
        className="px-1.5 py-0.5 border border-zinc-800 rounded-sm font-mono text-[10px] text-zinc-600 hover:text-zinc-400 hover:border-zinc-700"
      >+</button>
    )}
  </div>
)}
```

- [ ] **Step 6: Build check**

```bash
cd D:/AiStaffApp/apps/web && npm run build 2>&1 | tail -20
```

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/(app)/collab/page.tsx
git commit -m "feat(chat): add Slack-style emoji reactions with picker and optimistic updates"
```

---

## Task 13: Frontend — Thread Panel

**Files:**
- Modify: `apps/web/app/(app)/collab/page.tsx`

- [ ] **Step 1: Add thread state**

```ts
const [threadMsgId,    setThreadMsgId]    = useState<string | null>(null);
const [threadMessages, setThreadMessages] = useState<ChatMessage[]>([]);
const [threadLoading,  setThreadLoading]  = useState(false);
const [threadInput,    setThreadInput]    = useState("");
const [threadSending,  setThreadSending]  = useState(false);
```

- [ ] **Step 2: Add thread open + send handlers**

```ts
async function openThread(msgId: string) {
  setThreadMsgId(msgId);
  setThreadMessages([]);
  setThreadLoading(true);
  try {
    const r = await fetch(`/api/collab/messages/${msgId}/thread`);
    if (r.ok) {
      const data: ChatMessage[] = await r.json();
      setThreadMessages(data.map(m => ({
        id:          m.id,
        author:      m.sender_name ?? "Unknown",
        role:        (m.sender_id === profileId ? "talent" : "client") as ChatMessage["role"],
        body:        m.body,
        ts:          m.ts,
        file:        m.file_name ?? undefined,
        file_path:   m.file_path ?? undefined,
        edited_at:   m.edited_at,
        deleted_at:  m.deleted_at,
        reactions:   m.reactions ?? [],
        sender_id:   m.sender_id,
      })));
    }
  } catch { /* keep empty */ }
  setThreadLoading(false);
}

async function sendThreadReply() {
  if (!threadInput.trim() || threadSending || !threadMsgId || !deploymentId || !profileId) return;
  setThreadSending(true);
  const body = threadInput.trim();
  setThreadInput("");
  try {
    await fetch("/api/collab/messages", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        deployment_id:  deploymentId,
        sender_id:      profileId,
        sender_name:    displayName,
        body,
        parent_msg_id:  threadMsgId,
      }),
    });
    // Re-fetch thread to show new reply
    await openThread(threadMsgId);
  } catch { /* silent */ }
  setThreadSending(false);
}
```

- [ ] **Step 3: Wire the ↩ Reply button in the toolbar**

Replace the `openThread` placeholder comment in the toolbar:

```tsx
onClick={() => openThread(msg.id)}
```

- [ ] **Step 4: Add "X replies" link below each bubble (for messages with reply_count > 0)**

Insert after the reaction bar and before the file pill:

```tsx
{!msg.deleted_at && (msg.reply_count ?? 0) > 0 && (
  <button
    onClick={() => openThread(msg.id)}
    className="font-mono text-[9px] text-zinc-500 hover:text-amber-400 transition-colors flex items-center gap-1"
  >
    ↩ {msg.reply_count} {msg.reply_count === 1 ? "reply" : "replies"}
  </button>
)}
```

- [ ] **Step 5: Add thread panel JSX**

This panel is rendered outside the `<main>` element, as a fixed right panel (desktop) / bottom sheet (mobile). Insert before the closing `</div>` of the outermost container:

```tsx
{/* Thread Panel — Desktop: fixed right panel; Mobile: bottom sheet */}
{threadMsgId && (
  <div className="fixed inset-0 z-40 flex">
    {/* Backdrop */}
    <div className="flex-1" onClick={() => setThreadMsgId(null)} />
    {/* Panel */}
    <div className="w-full max-w-sm lg:w-80 h-full lg:h-screen bg-zinc-950 border-l border-zinc-800 flex flex-col shadow-xl
                    fixed bottom-0 right-0 lg:static">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 flex-shrink-0">
        <span className="font-mono text-xs font-medium text-zinc-300">Thread</span>
        <button onClick={() => setThreadMsgId(null)} className="text-zinc-600 hover:text-zinc-300">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Parent message preview */}
      {messages.find(m => m.id === threadMsgId) && (() => {
        const parent = messages.find(m => m.id === threadMsgId)!;
        return (
          <div className="px-4 py-2 border-b border-zinc-800/60 bg-zinc-900/30 flex-shrink-0">
            <p className="font-mono text-[9px] text-zinc-500">{parent.author}</p>
            <p className="font-mono text-xs text-zinc-400 line-clamp-2 mt-0.5">
              {parent.deleted_at ? "Message deleted" : parent.body}
            </p>
          </div>
        );
      })()}

      {/* Thread messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {threadLoading ? (
          <div className="flex justify-center pt-4">
            <Loader className="w-4 h-4 animate-spin text-zinc-600" />
          </div>
        ) : threadMessages.length === 0 ? (
          <p className="font-mono text-[10px] text-zinc-600 text-center pt-4">
            No replies yet. Be the first.
          </p>
        ) : threadMessages.map(msg => {
          const isMe = msg.sender_id === profileId;
          return (
            <div key={msg.id} className={`flex gap-2 ${isMe ? "flex-row-reverse" : ""}`}>
              <div className={`w-5 h-5 rounded-sm flex-shrink-0 flex items-center justify-center font-mono text-[8px] font-medium ${
                isMe ? "bg-sky-950 text-sky-400 border border-sky-800" : "bg-purple-950 text-purple-400 border border-purple-800"
              }`}>
                {msg.author[0]}
              </div>
              <div className={`max-w-[80%] space-y-0.5 ${isMe ? "items-end" : "items-start"} flex flex-col`}>
                <div className={`flex items-center gap-1.5 ${isMe ? "flex-row-reverse" : ""}`}>
                  <span className="font-mono text-[8px] text-zinc-600">{msg.author}</span>
                  <span className="font-mono text-[8px] text-zinc-700">{msg.ts}</span>
                </div>
                <div className={`border rounded-sm px-2 py-1.5 font-mono text-xs leading-relaxed ${
                  isMe ? "border-sky-900/50 bg-sky-950/20 text-zinc-300"
                       : "border-zinc-800 bg-zinc-900 text-zinc-400"
                }`}>
                  {msg.deleted_at ? <span className="italic text-zinc-600">Message deleted</span> : msg.body}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Reply input */}
      <div className="border-t border-zinc-800 p-3 flex-shrink-0">
        <div className="flex gap-2">
          <input
            value={threadInput}
            onChange={e => setThreadInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendThreadReply()}
            placeholder="Reply in thread…"
            className="flex-1 h-8 px-2.5 bg-zinc-900 border border-zinc-800 rounded-sm font-mono text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
          />
          <button
            onClick={sendThreadReply}
            disabled={!threadInput.trim() || threadSending}
            className="h-8 w-8 flex-shrink-0 flex items-center justify-center rounded-sm border border-amber-900 bg-amber-950/30 text-amber-400 disabled:opacity-30"
          >
            <Send className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 6: Build check**

```bash
cd D:/AiStaffApp/apps/web && npm run build 2>&1 | tail -20
```

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/(app)/collab/page.tsx
git commit -m "feat(chat): add Slack-style thread panel with reply chain"
```

---

## Task 14: Frontend — Real File Upload

**Files:**
- Modify: `apps/web/app/(app)/collab/page.tsx`

Replace the demo-only file handling with real upload logic.

- [ ] **Step 1: Replace `attached` string state with a richer attachment state**

Remove `const [attached, setAttached] = useState<string | null>(null);` and replace with:

```ts
const [attachment, setAttachment] = useState<{
  file_name: string;
  file_path: string | null;  // null = uploading
  url:       string | null;
  error:     string | null;
  progress:  boolean;
} | null>(null);
```

- [ ] **Step 2: Replace `handleChatFile` with real upload function**

```ts
async function handleChatFile(e: React.ChangeEvent<HTMLInputElement>) {
  const f = e.target.files?.[0];
  if (!f || !deploymentId) return;
  e.target.value = "";

  setAttachment({ file_name: f.name, file_path: null, url: null, error: null, progress: true });

  const form = new FormData();
  form.append("file", f);

  try {
    const r = await fetch(`/api/collab/upload?deployment_id=${deploymentId}`, {
      method: "POST",
      body:   form,
    });
    if (r.ok) {
      const data = await r.json() as { file_name: string; file_path: string; url: string };
      setAttachment({ file_name: data.file_name, file_path: data.file_path, url: data.url, error: null, progress: false });
    } else if (r.status === 413) {
      setAttachment(prev => prev ? { ...prev, error: "File exceeds 25 MB limit", progress: false } : null);
    } else {
      setAttachment(prev => prev ? { ...prev, error: "Upload failed — try again", progress: false } : null);
    }
  } catch {
    setAttachment(prev => prev ? { ...prev, error: "Network error — try again", progress: false } : null);
  }
}
```

- [ ] **Step 3: Update `sendMessage` to use `attachment`**

Replace the references to `attached` in `sendMessage` with `attachment`:

```ts
async function sendMessage() {
  if ((!input.trim() && !attachment?.file_path) || sending) return;
  if (attachment?.progress) return; // still uploading
  setSending(true);
  const body = input.trim() || "(file attached)";
  setInput("");
  const att = attachment;
  setAttachment(null);

  if (!deploymentId || !profileId) {
    setMessages(prev => [...prev, {
      id: `m${Date.now()}`, author: "You", role: "talent",
      body, ts: "Just now", file: att?.file_name,
    }]);
    setSending(false);
    return;
  }

  try {
    await fetch("/api/collab/messages", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        deployment_id: deploymentId,
        sender_id:     profileId,
        sender_name:   displayName,
        body,
        file_name:     att?.file_name ?? null,
        file_path:     att?.file_path ?? null,
      }),
    });
    // SSE will deliver the new message — no need to manually fetch
  } catch { /* silent — SSE will catch up */ }
  setSending(false);
}
```

- [ ] **Step 4: Update attachment pill JSX to show progress/error/download**

Replace the `{attached && ...}` pill with:

```tsx
{attachment && (
  <div className="flex items-center gap-2 px-2 py-1 bg-zinc-900 border border-zinc-700 rounded-sm w-fit max-w-[280px]">
    <Paperclip className="w-2.5 h-2.5 text-amber-400 flex-shrink-0" />
    <span className="font-mono text-[10px] text-zinc-300 truncate flex-1">{attachment.file_name}</span>
    {attachment.progress && <Loader className="w-2.5 h-2.5 animate-spin text-zinc-500 flex-shrink-0" />}
    {attachment.error && <span className="font-mono text-[9px] text-red-400 truncate">{attachment.error}</span>}
    {!attachment.progress && !attachment.error && (
      <span className="font-mono text-[9px] text-emerald-500">✓</span>
    )}
    <button onClick={() => setAttachment(null)} className="text-zinc-600 hover:text-zinc-300 flex-shrink-0">
      <X className="w-2.5 h-2.5" />
    </button>
  </div>
)}
```

- [ ] **Step 5: Update Files tab upload to use real API**

Replace `handleUploadFile` (which currently only updates local state):

```ts
async function handleUploadFile(e: React.ChangeEvent<HTMLInputElement>) {
  const f = e.target.files?.[0];
  if (!f || !deploymentId) return;
  e.target.value = "";

  const form = new FormData();
  form.append("file", f);

  const r = await fetch(`/api/collab/upload?deployment_id=${deploymentId}`, {
    method: "POST",
    body:   form,
  }).catch(() => null);

  if (r?.ok) {
    const data = await r.json() as { file_name: string; file_path: string };
    const ext  = data.file_name.split(".").pop()?.toLowerCase() ?? "";
    const type: SharedFile["type"] =
      ["png","jpg","jpeg","gif","webp","svg"].includes(ext) ? "image" :
      ["zip","tar","gz","wasm","dmg"].includes(ext)         ? "archive" :
      ["ts","js","rs","toml","json","py","sh","md"].includes(ext) ? "code" : "doc";
    setFiles(prev => [...prev, {
      id:       data.file_path,
      name:     data.file_name,
      type,
      size:     `${(f.size / 1024).toFixed(0)} KB`,
      uploaded: "Just now",
      uploader: "You",
      version:  1,
    }]);
  }
}
```

Also update the file row download link in the Files tab table. Find the `{f.name}` text in the file row and replace with:

```tsx
<a href={`/api/collab/files/${f.id}`} download={f.name}
   className="font-mono text-[10px] text-zinc-300 hover:text-amber-400 truncate transition-colors">
  {f.name}
</a>
```

- [ ] **Step 6: Update Send button disabled logic**

```tsx
disabled={(!input.trim() && !attachment?.file_path) || sending || !!attachment?.progress}
```

- [ ] **Step 7: Build check**

```bash
cd D:/AiStaffApp/apps/web && npm run build 2>&1 | tail -20
# Expected: successful build, no TypeScript errors
```

- [ ] **Step 8: Run linter**

```bash
cd D:/AiStaffApp/apps/web && npm run lint 2>&1 | tail -20
```

- [ ] **Step 9: Final commit**

```bash
git add apps/web/app/(app)/collab/page.tsx
git commit -m "feat(chat): real file upload with progress/error states; Files tab serves from API"
```

---

## Final Verification Checklist

Run these after all tasks are complete:

```bash
# Rust — full check + tests + clippy
cmd /c "vcvars64.bat && set SQLX_OFFLINE=true && cargo test -p marketplace_service 2>&1"
cmd /c "vcvars64.bat && set SQLX_OFFLINE=true && cargo clippy -p marketplace_service -- -D warnings 2>&1"
cmd /c "vcvars64.bat && cargo fmt --all 2>&1"

# Frontend
cd apps/web && npm run build && npm run lint
```

**Manual smoke test (two browser tabs):**
1. Open `/collab?deployment_id=<id>` in Tab A and Tab B
2. Send message in Tab A → appears in Tab B within ~1s (SSE, not 3s poll)
3. Hover a message → toolbar appears (React / Reply / Edit / Delete)
4. Edit a message → `(edited)` label appears
5. Delete a message → "Message deleted" placeholder appears
6. React with 👍 → count shows in both tabs
7. Click Reply → thread panel slides open → send reply → close → `↩ 1 reply` link appears
8. Attach a file → upload progress shows → green ✓ → send → download link in message
9. Files tab → Upload → file appears with download link
10. Unread count badge does not increment for thread replies
