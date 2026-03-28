-- Platform revenue ledger.
-- Populated atomically alongside escrow_payouts on every EscrowRelease event.
-- Append-only: no DELETE or UPDATE is ever issued by the application.
-- fee_pct is always 15 for MVP; stored for future variable-rate support.

CREATE TABLE platform_fees (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    deployment_id UUID        NOT NULL REFERENCES deployments(id),
    fee_cents     BIGINT      NOT NULL CHECK (fee_cents > 0),
    fee_pct       SMALLINT    NOT NULL DEFAULT 15,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX platform_fees_deployment_idx ON platform_fees (deployment_id);
CREATE INDEX platform_fees_created_at_idx ON platform_fees (created_at);
