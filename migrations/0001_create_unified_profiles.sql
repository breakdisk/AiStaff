CREATE TYPE identity_tier AS ENUM (
    'UNVERIFIED',
    'SOCIAL_VERIFIED',
    'BIOMETRIC_VERIFIED'
);

CREATE TABLE unified_profiles (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    github_uid           TEXT NOT NULL UNIQUE,
    linkedin_uid         TEXT,
    display_name         TEXT NOT NULL,
    email                TEXT NOT NULL,
    trust_score          SMALLINT NOT NULL DEFAULT 0
                         CONSTRAINT trust_score_range CHECK (trust_score BETWEEN 0 AND 100),
    biometric_commitment TEXT,           -- Blake3(nonce || proof) hash only; no raw biometric
    identity_tier        identity_tier NOT NULL DEFAULT 'UNVERIFIED',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_unified_profiles_github_uid ON unified_profiles (github_uid);
CREATE INDEX idx_unified_profiles_tier       ON unified_profiles (identity_tier);
