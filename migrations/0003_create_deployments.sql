CREATE TYPE deployment_status AS ENUM (
    'PENDING',
    'PROVISIONING',
    'INSTALLING',
    'VERIFYING',
    'VETO_WINDOW',
    'BIOMETRIC_PENDING',
    'RELEASED',
    'VETOED',
    'FAILED'
);

CREATE TABLE deployments (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id              UUID NOT NULL,
    client_id             UUID NOT NULL REFERENCES unified_profiles (id),
    freelancer_id         UUID NOT NULL REFERENCES unified_profiles (id),
    developer_id          UUID NOT NULL REFERENCES unified_profiles (id),
    agent_artifact_hash   TEXT NOT NULL,
    total_amount_cents    BIGINT NOT NULL CHECK (total_amount_cents > 0),
    escrow_amount_cents   BIGINT NOT NULL CHECK (escrow_amount_cents >= 0),
    state                 deployment_status NOT NULL DEFAULT 'PENDING',
    failure_reason        TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_deployments_state        ON deployments (state);
CREATE INDEX idx_deployments_freelancer   ON deployments (freelancer_id);
CREATE INDEX idx_deployments_client       ON deployments (client_id);
