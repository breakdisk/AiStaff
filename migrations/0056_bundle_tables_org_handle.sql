-- migrations/0056_bundle_tables_org_handle.sql

-- Handle and public profile columns on organisations
ALTER TABLE organisations ADD COLUMN handle TEXT UNIQUE;
ALTER TABLE organisations ADD COLUMN description TEXT;
ALTER TABLE organisations ADD COLUMN website_url TEXT;
CREATE INDEX idx_organisations_handle ON organisations(handle);

-- org_id FK on agent_listings so verified badge can be shown on listing cards
ALTER TABLE agent_listings ADD COLUMN org_id UUID REFERENCES organisations(id) ON DELETE SET NULL;
CREATE INDEX idx_agent_listings_org ON agent_listings(org_id);

-- Bundle tables
CREATE TABLE listing_bundles (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id           UUID        NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    name             TEXT        NOT NULL,
    description      TEXT,
    price_cents      BIGINT      NOT NULL CHECK (price_cents > 0),
    listing_status   TEXT        NOT NULL DEFAULT 'PENDING_REVIEW',
    active           BOOLEAN     NOT NULL DEFAULT FALSE,
    rejection_reason TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE bundle_items (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bundle_id     UUID NOT NULL REFERENCES listing_bundles(id) ON DELETE CASCADE,
    listing_id    UUID NOT NULL REFERENCES agent_listings(id) ON DELETE CASCADE,
    display_order INT  NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (bundle_id, listing_id)
);

CREATE INDEX idx_bundle_items_bundle  ON bundle_items(bundle_id);
CREATE INDEX idx_bundle_items_listing ON bundle_items(listing_id);
CREATE INDEX idx_listing_bundles_org  ON listing_bundles(org_id);
