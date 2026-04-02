-- platform_fees table was already created in migration 0024_platform_fees.sql.
-- This migration is intentionally a no-op to preserve the sqlx migration history
-- for databases that were seeded before 0024 was committed to the repo.
-- The table definition lives in 0024_platform_fees.sql.

CREATE TABLE IF NOT EXISTS platform_fees (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    deployment_id UUID        NOT NULL REFERENCES deployments(id),
    fee_cents     BIGINT      NOT NULL CHECK (fee_cents > 0),
    fee_pct       SMALLINT    NOT NULL DEFAULT 15,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS platform_fees_deployment_idx ON platform_fees (deployment_id);
CREATE INDEX IF NOT EXISTS platform_fees_created_at_idx ON platform_fees (created_at);
