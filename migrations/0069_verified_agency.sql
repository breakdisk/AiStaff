-- migrations/0069_verified_agency.sql
-- Verified Agency badge — admin-granted trust signal for premium agencies

ALTER TABLE organisations
    ADD COLUMN IF NOT EXISTS is_verified  BOOLEAN     NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS verified_at  TIMESTAMPTZ;

CREATE INDEX ON organisations (is_verified) WHERE is_verified = true;
