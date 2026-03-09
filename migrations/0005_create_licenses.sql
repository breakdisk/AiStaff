CREATE TABLE licenses (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id       UUID NOT NULL REFERENCES agent_listings(id),
    licensee_id    UUID NOT NULL,
    jurisdiction   CHAR(2) NOT NULL,
    seats          INT NOT NULL DEFAULT 1,
    issued_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at     TIMESTAMPTZ NOT NULL,
    revoked_at     TIMESTAMPTZ,
    revoke_reason  TEXT,
    transaction_id UUID NOT NULL UNIQUE,
    CHECK (expires_at > issued_at)
);

CREATE INDEX idx_licenses_agent    ON licenses (agent_id);
CREATE INDEX idx_licenses_licensee ON licenses (licensee_id);
