-- 0058: Microsoft Entra ID columns + verification_tokens for magic link
-- microsoft_entra_uid: Azure AD object ID (oid claim), stable across tenants
ALTER TABLE unified_profiles
    ADD COLUMN IF NOT EXISTS microsoft_entra_uid   TEXT UNIQUE,
    ADD COLUMN IF NOT EXISTS microsoft_connected_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_unified_profiles_microsoft_entra_uid
    ON unified_profiles (microsoft_entra_uid);

-- Auth.js adapter: stores one-time magic link tokens (email + token + expiry)
-- Deleted on use (single-use). Expired tokens safe to purge.
CREATE TABLE IF NOT EXISTS verification_tokens (
    identifier TEXT        NOT NULL,
    token      TEXT        NOT NULL,
    expires    TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (identifier, token)
);
