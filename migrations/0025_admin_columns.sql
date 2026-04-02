-- migrations/0025_admin_columns.sql

-- Platform-owner flag on unified_profiles
ALTER TABLE unified_profiles
    ADD COLUMN IF NOT EXISTS is_admin        BOOLEAN      NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS suspended_at    TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS suspended_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_unified_profiles_admin
    ON unified_profiles (is_admin) WHERE is_admin = TRUE;

-- Listing moderation status
ALTER TABLE agent_listings
    ADD COLUMN IF NOT EXISTS listing_status   TEXT NOT NULL DEFAULT 'APPROVED',
    ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_agent_listings_status
    ON agent_listings (listing_status);

-- Seed: set the first admin by email (replace with real email before deploy)
-- UPDATE unified_profiles SET is_admin = TRUE WHERE email = 'owner@aistaffglobal.com';
