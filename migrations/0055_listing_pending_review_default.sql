-- 0055: Listings now start inactive, requiring admin approval before going live.
-- Rollback: this is append-only per project policy — to revert, create a new
-- migration that sets defaults back to 'APPROVED' and TRUE. Never edit this file.
ALTER TABLE agent_listings
    ALTER COLUMN listing_status SET DEFAULT 'PENDING_REVIEW',
    ALTER COLUMN active          SET DEFAULT FALSE;
