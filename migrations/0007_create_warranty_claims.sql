CREATE TYPE warranty_resolution AS ENUM ('REMEDIATED', 'REFUNDED', 'REJECTED');

CREATE TABLE warranty_claims (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deployment_id UUID NOT NULL REFERENCES deployments(id),
    claimant_id   UUID NOT NULL,
    drift_proof   TEXT NOT NULL,
    claimed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at   TIMESTAMPTZ,
    resolution    warranty_resolution
);

CREATE INDEX idx_warranty_deployment ON warranty_claims (deployment_id);
