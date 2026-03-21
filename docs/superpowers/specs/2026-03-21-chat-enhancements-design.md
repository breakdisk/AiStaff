# Chat Enhancements Design
**Date:** 2026-03-21
**Status:** Approved
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

-- Index for efficient thread fetch
CREATE INDEX IF NOT EXISTS idx_collab_messages_parent ON collab_messages(parent_msg_id)
  WHERE parent_msg_id IS NOT NULL;

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

---

## Section 2: Backend (`crates/marketplace_service/src/`)

All handlers live in `collab_handlers.rs`. All follow the existing `extract_profile_id` + `check_deployment_access` guard pattern. No new auth primitives.

### Updated: `GET /collab/messages`

**New query param:** `after` (ISO 8601 timestamp, optional) — returns only messages where `created_at > after`. Used by SSE stream for incremental fetches.

**New fields in response:**
- `edited_at: Option<String>` — RFC 3339 if edited
- `deleted_at: Option<String>` — RFC 3339 if deleted (body replaced with `"[deleted]"`, `file_path` nulled)
- `parent_msg_id: Option<Uuid>` — set for thread replies
- `file_path: Option<String>` — UUID slug
- `reply_count: i64` — COUNT of rows with `parent_msg_id = this.id`
- `reactions: Vec<ReactionGroup>` — `{ emoji, count, profile_ids: Vec<Uuid> }`

**Main list filter:** `WHERE parent_msg_id IS NULL` — thread replies excluded from main view.

### New: `GET /collab/messages/:id/thread`

Returns all replies where `parent_msg_id = :id`, ordered `created_at ASC`. Same response shape as `list_messages`. No `after` param needed (threads are short).

### New: `PATCH /collab/messages/:id`

Body: `{ body: String }`
- Caller must be the original sender (`sender_id = profile_id`).
- Forbidden if `deleted_at IS NOT NULL`.
- Sets `body = $new_body`, `edited_at = NOW()`.
- Returns `204 No Content`.

### New: `DELETE /collab/messages/:id`

- Caller must be the original sender.
- Sets `deleted_at = NOW()` (soft delete — never hard-deletes).
- Returns `204 No Content`.

### New: `POST /collab/reactions`

Body: `{ message_id: Uuid, emoji: String }`
- Toggle semantics: if `(message_id, profile_id, emoji)` row exists → DELETE it; else → INSERT.
- Returns `{ action: "added" | "removed" }`.

### New: `POST /collab/files`

- Accepts `multipart/form-data` with fields: `file` (binary), `deployment_id`.
- Validates `Content-Length <= 26_214_400` (25 MB).
- Saves to `$COLLAB_UPLOAD_DIR/{uuid}.{ext}` (default `/tmp/collab-uploads`).
- Does **not** insert a DB row — upload returns URL, the message insert happens on send.
- Returns `{ file_name: String, file_path: String, url: String }`.

### New: `GET /collab/files/:slug`

- Looks up which `collab_messages` row owns this `file_path` (index on `file_path`).
- Validates caller is a participant of that deployment.
- Streams file bytes from disk with correct `Content-Type`.
- Returns `404` if slug not found; `403` if not a participant.

**Required:** Add `CREATE INDEX idx_collab_messages_file_path ON collab_messages(file_path) WHERE file_path IS NOT NULL;` to migration (included above).

---

## Section 3: SSE Stream + Next.js API Layer

### New: `GET /api/collab/stream`

**Route:** `apps/web/app/api/collab/stream/route.ts`

```
Client connects once via EventSource
  → Next.js fetches /collab/messages (initial batch)
  → sends: data: [...]\n\n
  → every 1s: fetches /collab/messages?deployment_id=X&after=<last_ts>
  → if new messages → sends: data: [...]\n\n
  → every 15s: sends: ": ping\n\n"  (prevents proxy timeout)
  → on abort signal: clears interval, closes stream
```

Response headers:
```
Content-Type: text/event-stream
Cache-Control: no-cache, no-transform
Connection: keep-alive
X-Accel-Buffering: no   ← tells Nginx/Traefik not to buffer
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
- `✏️ Edit` — own messages only
- `🗑 Delete` — own messages only

**Edit flow:** bubble replaced with inline `<textarea>` pre-filled with body. Save → `PATCH /api/collab/messages/[id]`, optimistic update. `(edited)` label shown after timestamp.

**Delete flow:** inline "Delete?" + Yes / No (no modal). Yes → `DELETE /api/collab/messages/[id]`, bubble replaced with italic "Message deleted" in `text-zinc-600`.

### Reaction bar

Shown below each message bubble when reactions exist (or always on hover as `+` only):

- Pills: `👍 3` (amber-tinted if you reacted). Click to toggle → `POST /api/collab/reactions`.
- `+` button: opens inline emoji picker grid (~40 common emoji, no third-party library).
- Optimistic update: add/remove locally, sync on next SSE batch.

### Thread panel

- Top-level messages with `reply_count > 0` show `↩ {N} replies` link below bubble.
- Clicking "Reply" or the replies link opens:
  - **Desktop:** fixed right panel `w-80`, slides in over content (not displacing layout).
  - **Mobile:** bottom sheet, full width, ~60vh.
- Panel header: "Thread" + first 60 chars of parent message.
- Thread messages in same bubble style. Own input at bottom — `POST /api/collab/messages` with `parent_msg_id` set.
- Closing panel: `×` button or clicking backdrop.

### File upload — chat attachment

1. Paperclip click → file picker.
2. File selected → immediately `POST /api/collab/upload` (FormData).
3. Attachment pill shows progress bar during upload.
4. On success: pill shows filename + green checkmark. `file_path` + `file_name` stored in state.
5. On send: message body includes both. Attachment pill becomes a download link via `/api/collab/files/[slug]`.

### Files tab

- On tab open: fetch files from `GET /api/collab/messages?deployment_id=X` filtered for rows where `file_path IS NOT NULL`.
- Upload button → file picker → `POST /api/collab/upload` → row appended to table with real API data.
- Each filename is an `<a>` to `/api/collab/files/[slug]` (`download` attribute).

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| SSE disconnects | `EventSource` auto-reconnects (browser spec); no message loss (server re-fetches from last timestamp) |
| File > 25 MB | Upload returns `413`; frontend shows inline error in attachment pill |
| Edit after delete | Rust returns `403`; frontend shows toast "Cannot edit a deleted message" |
| React to own deleted message | Reactions are blocked on `deleted_at IS NOT NULL` in Rust handler |
| Thread panel open during SSE update | `reply_count` in main list updates live; panel re-fetches thread on open |

---

## Testing

```bash
# 1. Migration
sqlx migrate run
cargo sqlx prepare --workspace

# 2. Rust unit tests
cargo test -p marketplace_service

# 3. End-to-end
# - Open /collab?deployment_id=<id> in two browser tabs
# - Send message in tab 1 → appears in tab 2 within ~1s (SSE)
# - Attach a file → verify upload progress → verify download link works
# - Hover message → Edit → change body → verify (edited) label
# - Hover message → Delete → verify "Message deleted" placeholder
# - React with 👍 → verify count increments in both tabs
# - Click Reply → thread panel opens → send reply → verify reply_count updates

# 4. Clippy + fmt
cargo clippy -- -D warnings
cargo fmt --all
```

---

## Files Changed Summary

| File | Change |
|---|---|
| `migrations/0050_chat_enhancements.sql` | New migration |
| `crates/marketplace_service/src/collab_handlers.rs` | Updated + 5 new handlers |
| `crates/marketplace_service/src/main.rs` | Register new routes |
| `apps/web/app/api/collab/stream/route.ts` | New SSE bridge |
| `apps/web/app/api/collab/upload/route.ts` | New file upload proxy |
| `apps/web/app/api/collab/files/[slug]/route.ts` | New file serve proxy |
| `apps/web/app/api/collab/messages/[id]/route.ts` | New PATCH + DELETE proxy |
| `apps/web/app/api/collab/messages/[id]/thread/route.ts` | New thread fetch proxy |
| `apps/web/app/api/collab/reactions/route.ts` | New reaction toggle proxy |
| `apps/web/app/(app)/collab/page.tsx` | SSE, reactions, threads, edit/delete, real upload |
