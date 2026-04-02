-- migrations/0053_announcements.sql
CREATE TABLE announcements (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT        NOT NULL,
  body        TEXT        NOT NULL,
  severity    TEXT        NOT NULL DEFAULT 'info'
                CHECK (severity IN ('info', 'warning', 'urgent')),
  starts_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ,
  created_by  UUID        NOT NULL REFERENCES unified_profiles(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Partial index on expires_at for non-expired announcements.
-- Cannot use NOW() in index predicate (STABLE, not IMMUTABLE).
-- App queries filter dynamically: WHERE starts_at <= NOW() AND (expires_at IS NULL OR expires_at > NOW())
CREATE INDEX idx_announcements_active ON announcements(starts_at, expires_at);
