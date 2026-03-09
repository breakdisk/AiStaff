CREATE TYPE contract_status AS ENUM ('DRAFT', 'PENDING_SIGNATURE', 'SIGNED', 'EXPIRED', 'REVOKED');

CREATE TABLE contracts (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_type TEXT NOT NULL,
    party_a       UUID NOT NULL,
    party_b       UUID NOT NULL,
    deployment_id UUID REFERENCES deployments(id),
    status        contract_status NOT NULL DEFAULT 'DRAFT',
    document_hash TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    signed_at     TIMESTAMPTZ
);
