-- migrations/0060_agency_escrow_splits.sql
-- Option B: platform distributes agency split directly to each worker.
-- Agencies pay 12% platform fee (vs 15% for freelancers).
-- agency_pct = agency's management cut of the post-platform remainder.
-- When agency_pct = 0 or agency_id IS NULL: standard freelancer flow (15%).

ALTER TABLE deployments
    ADD COLUMN IF NOT EXISTS agency_id  UUID REFERENCES organisations(id),
    ADD COLUMN IF NOT EXISTS agency_pct SMALLINT NOT NULL DEFAULT 0
        CHECK (agency_pct >= 0 AND agency_pct <= 100);

CREATE INDEX IF NOT EXISTS idx_deployments_agency
    ON deployments (agency_id) WHERE agency_id IS NOT NULL;
