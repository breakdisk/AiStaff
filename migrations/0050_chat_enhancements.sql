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
