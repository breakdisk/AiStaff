-- Platform revenue ledger: records the 15% commission on every escrow release.
-- Append-only — no row-level DELETE or UPDATE permitted after insert.
-- One row per deployment, inserted atomically with the escrow_payouts rows.

CREATE TABLE platform_fees (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    deployment_id UUID        NOT NULL REFERENCES deployments (id),
    fee_cents     BIGINT      NOT NULL CHECK (fee_cents > 0),
    -- Stored explicitly so future rate changes are auditable per row.
    fee_pct       SMALLINT    NOT NULL DEFAULT 15,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookup for revenue reporting queries.
CREATE INDEX idx_platform_fees_deployment ON platform_fees (deployment_id);
CREATE INDEX idx_platform_fees_created_at ON platform_fees (created_at);

-- Production note:
--   REVOKE UPDATE, DELETE ON platform_fees FROM app_user;
-- Run this once after applying the migration in production to enforce append-only.
