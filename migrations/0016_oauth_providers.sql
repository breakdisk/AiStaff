-- Migration 0016: Multi-provider OAuth support
-- Makes github_uid optional (Google-only users have no GitHub account)
-- Adds google_uid for Google OAuth, and provider-linked-at timestamps.

-- Allow Google-only signups (no GitHub UID on file yet)
ALTER TABLE unified_profiles
    ALTER COLUMN github_uid DROP NOT NULL;

-- Google OAuth provider column
ALTER TABLE unified_profiles
    ADD COLUMN IF NOT EXISTS google_uid            TEXT UNIQUE,
    ADD COLUMN IF NOT EXISTS github_connected_at   TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS linkedin_connected_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS google_connected_at   TIMESTAMPTZ;

-- Fast lookup by Google UID
CREATE INDEX IF NOT EXISTS idx_unified_profiles_google_uid
    ON unified_profiles (google_uid);

-- Email must be unique — used as account-linking key across providers
CREATE UNIQUE INDEX IF NOT EXISTS idx_unified_profiles_email
    ON unified_profiles (email);
