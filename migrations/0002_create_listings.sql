CREATE TABLE agent_listings (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    developer_id    UUID NOT NULL REFERENCES unified_profiles (id),
    name            TEXT NOT NULL,
    description     TEXT NOT NULL,
    wasm_hash       TEXT NOT NULL,          -- SHA-256 of the Wasm artifact
    price_cents     BIGINT NOT NULL CHECK (price_cents > 0),
    active          BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_agent_listings_developer ON agent_listings (developer_id);
CREATE INDEX idx_agent_listings_active    ON agent_listings (active);
