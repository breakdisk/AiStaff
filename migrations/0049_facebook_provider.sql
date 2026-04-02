-- migrations/0049_facebook_provider.sql
-- Add Facebook OAuth columns to unified_profiles

ALTER TABLE unified_profiles
    ADD COLUMN IF NOT EXISTS facebook_uid          TEXT,
    ADD COLUMN IF NOT EXISTS facebook_connected_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_unified_profiles_facebook_uid
    ON unified_profiles(facebook_uid) WHERE facebook_uid IS NOT NULL;
