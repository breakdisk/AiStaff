-- Listing media: demo video URL, proof-of-work images, custom requirements, deliverables.
-- Sellers fill this in via /marketplace/[slug]/edit after creating a listing.
CREATE TABLE IF NOT EXISTS listing_media (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id   UUID        NOT NULL REFERENCES agent_listings(id) ON DELETE CASCADE,
    media_type   VARCHAR(20) NOT NULL CHECK (media_type IN ('video_url','image','requirement','deliverable')),
    content      TEXT        NOT NULL,   -- URL for video/image; text for requirement/deliverable
    required     BOOLEAN     NOT NULL DEFAULT TRUE,   -- meaningful for 'requirement' type only
    sort_order   INT         NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS listing_media_listing_idx ON listing_media (listing_id);
CREATE INDEX IF NOT EXISTS listing_media_type_idx    ON listing_media (listing_id, media_type);
