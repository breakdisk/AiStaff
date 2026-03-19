-- migrations/0043_skill_suggestions.sql
CREATE TABLE skill_suggestions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tag          TEXT        NOT NULL,
  domain       TEXT        NOT NULL,
  suggested_by UUID        NOT NULL REFERENCES unified_profiles(id) ON DELETE CASCADE,
  status       TEXT        NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at  TIMESTAMPTZ,
  UNIQUE(tag)
);

CREATE INDEX idx_skill_suggestions_status ON skill_suggestions(status);
