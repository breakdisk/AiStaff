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
CREATE INDEX idx_announcements_active ON announcements(starts_at)
  WHERE expires_at IS NULL OR expires_at > NOW();
