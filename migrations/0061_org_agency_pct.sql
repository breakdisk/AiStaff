-- migrations/0061_org_agency_pct.sql
-- Stores the agency management fee % directly on the organisation so agents
-- can configure it once and have it auto-applied to every deployment.
-- Capped at 50% by DB constraint to protect developer + talent workers.
-- 0 = no agency fee (standard freelancer split applies).

ALTER TABLE organisations
    ADD COLUMN IF NOT EXISTS agency_pct SMALLINT NOT NULL DEFAULT 0
        CHECK (agency_pct >= 0 AND agency_pct <= 50);
