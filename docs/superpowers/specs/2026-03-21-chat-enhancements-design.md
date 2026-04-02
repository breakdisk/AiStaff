# Chat Enhancements Design
**Date:** 2026-03-21
**Status:** Approved (v2 — post spec-review)
**Scope:** `apps/web/app/(app)/collab/`, `crates/marketplace_service/`, `migrations/`

---

## Problem

The Collaboration chat has four gaps that prevent it from being a production-ready tool:

1. **Polling only** — client polls every 3 seconds; messages feel delayed and every open tab burns requests.
2. **File upload is demo-only** — the paperclip button captures a filename string but never uploads the binary. The Files tab upload only updates local React state. No bytes ever leave the browser.
3. **No edit or delete** — messages are immutable once sent. No correction path.
4. **No reactions or threads** — no Slack-style emoji reactions or reply chains.

---

## Approach: SSE + Full Feature Set (Approach A)

Replace polling with a Next.js SSE stream. Implement real file upload (multipart → disk → serve). Add edit/soft-delete, Slack-style emoji reactions, and Slack-style thread reply chains. One migration covers all DB changes. New Rust handlers follow existing `extract_profile_id` + `check_deployment_access` patterns.

---

## Section 1: Database (`migrations/0050_chat_enhancements.sql`)

```sql
-- Edit + soft delete + thread parent + file path on existing messages table
ALTER TABLE collab_messages
  ADD COLUMN IF NOT EXISTS edited_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS parent_msg_id UUID REFERENCES collab_messages(id),
  ADD COLUMN IF NOT EXISTS file_path     TEXT;

-- Index for efficient thread fetch (replies to a parent message)
CREATE INDEX IF NOT EXISTS idx_collab_messages_parent ON collab_messages(parent_msg_id)
  WHERE parent_msg_id IS NOT NULL;

-- Index for file serve access-check (slug → owning deployment)
CREATE INDEX IF NOT EXISTS idx_collab_messages_file_path ON collab_messages(file_path)
  WHERE file_path IS NOT NULL;

-- Slack-style reactions: toggle semantics via PRIMARY KEY upsert
CREATE TABLE IF NOT EXISTS collab_reactions (
  message_id  UUID        NOT NULL REFERENCES collab_messages(id) ON DELETE CASCADE,
  profile_id  UUID        NOT NULL,
  emoji       TEXT        NOT NULL CHECK (char_length(emoji) <= 16),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (message_id, profile_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_collab_reactions_msg ON collab_reactions(message_id);
```

### Column semantics

| Column | Meaning |
|---|---|
| `file_name` (existing) | Original display filename (e.g. `brief_v1.pdf`) |
| `file_path` (new) | UUID slug served at `/api/collab/files/[slug]` (e.g. `a1b2c3.pdf`) |
| `parent_msg_id NULL` | Top-level message |
| `parent_msg_id SET` | Thread reply — excluded from main message list |
| `deleted_at IS NOT NULL` | Soft-deleted — body replaced with `"[deleted]"` in API; row never hard-deleted |
| `edited_at IS NOT NULL` | Shows "(edited)" label in UI |

**Note:** `ON DELETE CASCADE` on `collab_reactions.message_id` will never fire because messages are soft-deleted, not hard-deleted. This is intentional — reactions remain in the DB alongside the soft-deleted message row.

---

## Section 2: Backend (`crates/marketplace_service/src/`)

All handlers live in `collab_handlers.rs`. All follow the existing pattern: extract `X-Profile-Id` via `extract_profile_id()`, call `check_deployment_access()`, then execute business logic. No new auth primitives.

### Updated: `GET /collab/messages`

**New query param:** `after` (RFC 3339 UTC timestamp, e.g. `2026-03-21T10:00:00.000Z`, optional). When provided, returns only messages where `created_at > $after`. Used by SSE stream for incremental fetches. Implementers must use `chrono::DateTime<chrono::Utc>` for parsing.

**Both full and incremental queries must filter `AND parent_msg_id IS NULL`** — thread replies must never appear in the main message list.

**New fields in response:**
- `edited_at: Option<String>` — RFC 3339 if edited, else null
- `deleted_at: Option<String>` — RFC 3339 if deleted; body replaced with `"[deleted]"`, `file_path` nulled in response (bytes not exposed)
- `parent_msg_id: Option<Uuid>` — set for thread replies (will always be null in this response due to the filter, kept for thread fetch reuse)
- `file_path: Option<String>` — UUID slug
- `reply_count: i64` — count of rows with `parent_msg_id = this.id AND deleted_at IS NULL` (soft-deleted replies are excluded)
- `reactions: Vec<ReactionGroup>` — `{ emoji: String, count: i64, profile_ids: Vec<Uuid> }` aggregated from `collab_reactions`

### Updated: `GET /collab/unread` (`unread_count` handler)

Add `AND parent_msg_id IS NULL` to the count query. Thread replies must not inflate the badge count.

### New: `GET /collab/messages/:id/thread`

Returns all replies where `parent_msg_id = :id`, ordered `created_at ASC`. Same response shape as `list_messages` (without the `parent_msg_id IS NULL` filter). No `after` param. Thread panel is refresh-on-open only — no SSE stream for thread content.

### New: `PATCH /collab/messages/:id`

Body: `{ body: String }`
- Call `extract_profile_id` + `check_deployment_access`.
- Caller must be the original sender (`sender_id = profile_id`); return `403` otherwise.
- Return `403` if `deleted_at IS NOT NULL` ("Cannot edit a deleted message").
- Sets `body = $new_body`, `edited_at = NOW()`.
- Returns `204 No Content`.

### New: `DELETE /collab/messages/:id`

- Call `extract_profile_id` + `check_deployment_access`.
- Caller must be the original sender; return `403` otherwise.
- Sets `deleted_at = NOW()` (soft delete — row never hard-deleted, per audit requirements).
- Returns `204 No Content`.
- **Thread replies remain visible.** Soft-deleted parent shows `"[deleted]"` placeholder; reply count is hidden in UI when parent is deleted (see Section 4). This matches Slack behaviour.

### New: `POST /collab/reactions`

Body: `{ message_id: Uuid, emoji: String }`
- Call `extract_profile_id`.
- Look up which `deployment_id` owns `message_id`; call `check_deployment_access` with that deployment.
- **Validate `emoji`:** must be one of the 40 allowed emoji in the server-side allowlist (same set as UI picker). Return `422 Unprocessable Entity` if not in list. Do not rely on `CHECK` constraint alone — validate in handler before INSERT.
- **Check `deleted_at`:** if the target message is soft-deleted, return `403` ("Cannot react to a deleted message").
- Look up `collab_messages` row by `message_id`. If not found, return `404` ("Message not found") — do this before the access check.
- Toggle: if `(message_id, profile_id, emoji)` row exists → `DELETE`; else → `INSERT`.
- Returns `{ action: "added" | "removed" }`.

**Allowed emoji allowlist (40 entries — identical on server and client):**
```
👍 👎 ❤️ 🔥 🎉 😂 😮 😢 🙏 ✅
❌ ⚠️ 🚀 💡 🐛 🔒 📎 📋 ⏳ ✏️
💬 🔄 📌 🏆 💪 👀 🤔 😅 🎯 🛡️
💰 📊 🔗 🧪 ⚡ 🌍 🤝 📢 🔔 💎
```

### New: `POST /collab/files`

- Call `extract_profile_id` + `check_deployment_access(deployment_id, profile_id)` **before accepting any bytes**.
- Enforce 25 MB limit on the **actual byte stream** (use `axum::body::Body` with `http_body_util::Limited` or a streaming byte counter) — do not rely solely on `Content-Length` header, which is client-supplied and bypassable.
- Derive file extension via **MIME sniffing** (consistent with CLAUDE.md: "File uploads: MIME sniffing + max size enforcement"). Use a sanitised extension from a known allowlist derived from the detected MIME type. Never derive extension from the user-supplied filename.
- Save to `$COLLAB_UPLOAD_DIR/{uuid_v4}.{safe_ext}` (env var, default `/tmp/collab-uploads`). The UUID ensures no path traversal.
- **Orphaned file cleanup:** Insert a `collab_file_uploads` staging row `(file_path, deployment_id, profile_id, uploaded_at)` at upload time. A background task (or next startup scan) purges staging rows + disk files where `uploaded_at < NOW() - INTERVAL '24 hours'` and no `collab_messages.file_path` references the slug. This prevents unbounded disk growth from abandoned uploads. See migration note below.
- Returns `{ file_name: String, file_path: String, url: String }`.

**Additional migration for staging table:**
```sql
-- Staging table for uploaded-but-not-yet-sent files (24h TTL cleanup)
CREATE TABLE IF NOT EXISTS collab_file_uploads (
  file_path    TEXT        PRIMARY KEY,
  deployment_id UUID       NOT NULL,
  profile_id   UUID        NOT NULL,
  uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_collab_file_uploads_at ON collab_file_uploads(uploaded_at);
```
Add this to `0050_chat_enhancements.sql`.

### New: `GET /collab/files/:slug`

- Validate `slug` format: UUID + extension only (`[a-f0-9-]{36}\.[a-z0-9]{1,10}`). Return `400` on mismatch.
- Look up `collab_messages` by `file_path = slug` using `idx_collab_messages_file_path` index.
- If not found in messages, check `collab_file_uploads` (still in staging). Verify `profile_id = staging_row.profile_id`; return `403` if not — staging files are only accessible to their uploader before the message is sent.
- Call `check_deployment_access` with the owning `deployment_id`.
- Stream file bytes from disk with correct `Content-Type` derived from MIME sniffing (not filename extension).
- Return `404` if slug not found; `403` if not a participant.

---

## Section 3: SSE Stream + Next.js API Layer

### New: `GET /api/collab/stream`

**Route:** `apps/web/app/api/collab/stream/route.ts`

```
Client connects once via EventSource
  → Next.js extracts profileId from server-side auth() session
  → fetches GET /collab/messages?deployment_id=X with X-Profile-Id: profileId
  → sends: data: <JSON array of messages>\n\n
  → records last_ts = last message's created_at (RFC 3339 UTC)
     (if initial batch empty, last_ts = new Date().toISOString())
  → every 1s: fetches /collab/messages?deployment_id=X&after=<last_ts>
              with X-Profile-Id: profileId header
  → if new messages → updates last_ts → sends: data: <JSON array>\n\n
  → every 15s: sends: ": ping\n\n"  (prevents proxy timeout)
  → on abort signal: clears interval, closes stream
```

The Next.js route must call `auth()` to get the server-side session and forward `X-Profile-Id: profileId` on every Rust subrequest. This is required — the Rust `list_messages` handler returns `401` without it.

Response headers:
```
Content-Type: text/event-stream
Cache-Control: no-cache, no-transform
Connection: keep-alive
X-Accel-Buffering: no   ← tells Nginx/Traefik not to buffer the stream
```

### Updated: Frontend SSE connection (`collab/page.tsx`)

Replace `setInterval(fetchMessages, 3000)` with:

```ts
const es = new EventSource(`/api/collab/stream?deployment_id=${deploymentId}`);
es.onmessage = (e) => {
  const batch: ChatMessage[] = JSON.parse(e.data);
  setMessages(prev => mergeDedupe(prev, batch)); // merge by id, no duplicates
};
es.onerror = () => { /* EventSource auto-reconnects per browser spec */ };
return () => es.close();
```

### New/Updated Next.js proxy routes

| Route | Method | Proxies to |
|---|---|---|
| `/api/collab/stream` | GET | SSE bridge (polls Rust at 1s) |
| `/api/collab/upload` | POST | `POST /collab/files` (multipart passthrough) |
| `/api/collab/files/[slug]` | GET | `GET /collab/files/:slug` (stream passthrough) |
| `/api/collab/messages/[id]` | PATCH | `PATCH /collab/messages/:id` |
| `/api/collab/messages/[id]` | DELETE | `DELETE /collab/messages/:id` |
| `/api/collab/messages/[id]/thread` | GET | `GET /collab/messages/:id/thread` |
| `/api/collab/reactions` | POST | `POST /collab/reactions` |

---

## Section 4: Frontend UI

### Message bubble — hover toolbar

Appears on hover (desktop) / long-press (mobile). Rendered as a small row above the bubble:

- `😀` — opens emoji picker popover (react)
- `↩ Reply` — opens thread panel for this message
- `✏️ Edit` — own messages only; hidden if `deleted_at` set
- `🗑 Delete` — own messages only; hidden if `deleted_at` set

**Edit flow:** bubble replaced with inline `<textarea>` pre-filled with body. Save → `PATCH /api/collab/messages/[id]`, optimistic update. `(edited)` label shown after timestamp.

**Delete flow:** inline "Delete?" + Yes / No (no modal). Yes → `DELETE /api/collab/messages/[id]`, bubble replaced with italic "Message deleted" in `text-zinc-600`. Hover toolbar removed on deleted messages.

### Reaction bar

Shown below each message bubble when reactions exist (or `+` only button on hover):

- Pills: `👍 3` (amber-tinted if you reacted). Click to toggle → `POST /api/collab/reactions`.
- `+` button: opens inline emoji picker grid (40 emoji from the server allowlist — hardcoded in frontend to match).
- Hidden on soft-deleted messages (`deleted_at` set).
- Optimistic update: add/remove locally, confirmed on next SSE batch. Known gap: reaction state may be briefly stale during SSE reconnect window — acceptable for MVP.

### Thread panel

- Top-level messages with `reply_count > 0` show `↩ {N} replies` link below bubble. **Hidden if parent is soft-deleted** (Slack behaviour: deleted messages don't expose thread entry points).
- Clicking "Reply" or the replies link opens:
  - **Desktop:** fixed right panel `w-80`, slides in over content (not displacing layout).
  - **Mobile:** bottom sheet, full width, ~60vh.
- Panel header: "Thread" + first 60 chars of parent message.
- Thread messages in same bubble style. Own input at bottom — `POST /api/collab/messages` with `parent_msg_id` set.
- **Refresh-on-open only** — the thread panel fetches once on open; it does not poll or maintain an SSE connection. Users close and reopen to see new replies. `reply_count` in the main list updates live via SSE, signalling new replies exist.
- Closing panel: `×` button or clicking backdrop.

### File upload — chat attachment

1. Paperclip click → file picker.
2. File selected → immediately `POST /api/collab/upload` (FormData).
3. Attachment pill shows progress bar during upload.
4. On success: pill shows filename + green checkmark. `file_path` + `file_name` stored in state.
5. On send: message body includes both. Attachment pill becomes a download link via `/api/collab/files/[slug]`.
6. On upload error (413, 422, etc.): pill shows red error text; user can dismiss and try again.

### Files tab

- On tab open: fetch `GET /api/collab/messages?deployment_id=X`, filter client-side for rows where `file_path` is non-null.
- Upload button → file picker → `POST /api/collab/upload` → row appended to table with real API data.
- Each filename is an `<a>` to `/api/collab/files/[slug]` with `download` attribute.

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| SSE disconnects | `EventSource` auto-reconnects (browser spec); no message loss (server re-fetches from `last_ts`) |
| File > 25 MB | Upload returns `413`; frontend shows inline error in attachment pill |
| Edit after delete | Rust returns `403`; frontend shows inline "Cannot edit a deleted message" |
| React on deleted message | Rust returns `403`; frontend shows inline toast |
| Invalid emoji (not in allowlist) | Rust returns `422`; picker is hardcoded to allowlist so this only fires on API abuse |
| File slug invalid format | Rust returns `400` |
| Upload with no matching deployment access | Rust returns `403` before accepting bytes |
| Orphaned upload (tab closed mid-compose) | Staging row cleaned up after 24h by background scan |

---

## Testing

```bash
# 1. Migration
sqlx migrate run
cargo sqlx prepare --workspace

# 2. Rust unit tests
cargo test -p marketplace_service
# Includes: emoji allowlist validation, Content-Length bypass attempt, slug format check

# 3. End-to-end
# - Open /collab?deployment_id=<id> in two browser tabs
# - Send message in tab 1 → appears in tab 2 within ~1s (SSE, not 3s poll)
# - Attach a file → verify upload progress → verify download link works
# - Try uploading >25MB file → verify 413 error shown in pill
# - Hover message → Edit → change body → verify (edited) label
# - Hover message → Delete → verify "Message deleted" placeholder
# - React with 👍 → verify count increments in both tabs
# - Try reacting to deleted message → verify blocked
# - Click Reply → thread panel opens → send reply → close → verify reply_count +1
# - Verify thread reply does NOT appear in main message list
# - Verify unread count does not include thread replies

# 4. Clippy + fmt
cargo clippy -- -D warnings
cargo fmt --all
```

---

## Files Changed Summary

| File | Change |
|---|---|
| `migrations/0050_chat_enhancements.sql` | New migration (columns, indexes, reactions table, staging table) |
| `crates/marketplace_service/src/collab_handlers.rs` | Updated list_messages + unread_count; 6 new handlers |
| `crates/marketplace_service/src/main.rs` | Register new routes |
| `apps/web/app/api/collab/stream/route.ts` | New SSE bridge |
| `apps/web/app/api/collab/upload/route.ts` | New file upload proxy |
| `apps/web/app/api/collab/files/[slug]/route.ts` | New file serve proxy |
| `apps/web/app/api/collab/messages/[id]/route.ts` | New PATCH + DELETE proxy |
| `apps/web/app/api/collab/messages/[id]/thread/route.ts` | New thread fetch proxy |
| `apps/web/app/api/collab/reactions/route.ts` | New reaction toggle proxy |
| `apps/web/app/(app)/collab/page.tsx` | SSE, reactions, threads, edit/delete, real upload |
