-- Client onboarding: agencies invite clients via magic link; tracks pending + accepted links
CREATE TABLE org_client_links (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id         UUID        NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    client_id      UUID        REFERENCES unified_profiles(id),  -- NULL until accepted
    invited_email  TEXT,
    token_hash     TEXT        NOT NULL UNIQUE,  -- SHA-256 of JWT token
    accepted_at    TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON org_client_links (org_id);
