-- 0019: Agency account system + fix agent_listings metadata gap
--
-- Fixes a critical schema bug: agent_listings was missing category and
-- seller_type columns that the frontend has always expected. Also adds
-- agency-level identity (account_type, org_name on unified_profiles) and
-- creates the agencies table for org-level account management.

-- ── Fix agent_listings ──────────────────────────────────────────────────────
-- TEXT (not PG enum) avoids $2::enum_type cast complexity in non-macro queries.
-- NOT NULL DEFAULT means existing rows get valid values with no data migration.

ALTER TABLE agent_listings
    ADD COLUMN IF NOT EXISTS category    TEXT NOT NULL DEFAULT 'AiStaff',
    ADD COLUMN IF NOT EXISTS seller_type TEXT NOT NULL DEFAULT 'Freelancer';

CREATE INDEX IF NOT EXISTS idx_agent_listings_category    ON agent_listings (category);
CREATE INDEX IF NOT EXISTS idx_agent_listings_seller_type ON agent_listings (seller_type);

-- ── Agency profile fields on unified_profiles ───────────────────────────────

ALTER TABLE unified_profiles
    ADD COLUMN IF NOT EXISTS account_type TEXT NOT NULL DEFAULT 'individual',
    ADD COLUMN IF NOT EXISTS org_name     TEXT;

-- ── Agency organisation records ─────────────────────────────────────────────
-- ON DELETE RESTRICT: deleting an account that owns an agency is a
-- business-level decision, not a cascade.

CREATE TABLE IF NOT EXISTS agencies (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id    UUID        NOT NULL REFERENCES unified_profiles (id) ON DELETE RESTRICT,
    name        TEXT        NOT NULL,
    handle      TEXT        NOT NULL UNIQUE,   -- URL-safe slug, e.g. "acme-ai"
    description TEXT,
    website_url TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agencies_owner ON agencies (owner_id);
