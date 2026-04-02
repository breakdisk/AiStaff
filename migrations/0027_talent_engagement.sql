-- migrations/0027_talent_engagement.sql
-- AiTalent engagement: proposal lifecycle + talent deployment type + milestone submit/approve

-- 1. Proposal lifecycle columns
ALTER TABLE proposals
    ADD COLUMN IF NOT EXISTS job_listing_id  UUID REFERENCES agent_listings(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS freelancer_id   UUID REFERENCES unified_profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS status          TEXT NOT NULL DEFAULT 'PENDING',
    ADD COLUMN IF NOT EXISTS deployment_id   UUID REFERENCES deployments(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS rejected_at     TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS accepted_at     TIMESTAMPTZ;

ALTER TABLE proposals
    ADD CONSTRAINT proposals_status_check
    CHECK (status IN ('PENDING', 'ACCEPTED', 'REJECTED'));

-- 2. Deployment type: AGENT (existing AI Agent flow) vs TALENT (human freelancer)
ALTER TABLE deployments
    ADD COLUMN IF NOT EXISTS deployment_type TEXT NOT NULL DEFAULT 'AGENT';

ALTER TABLE deployments
    ADD CONSTRAINT deployments_type_check
    CHECK (deployment_type IN ('AGENT', 'TALENT'));

-- 3. Milestone submit/approve columns on dod_checklist_steps
--    completed_at made nullable so pending milestones can be inserted without a timestamp
ALTER TABLE dod_checklist_steps
    ALTER COLUMN completed_at DROP NOT NULL,
    ADD COLUMN IF NOT EXISTS submitted_by   UUID REFERENCES unified_profiles(id),
    ADD COLUMN IF NOT EXISTS submitted_at   TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS approved_by    UUID REFERENCES unified_profiles(id),
    ADD COLUMN IF NOT EXISTS approved_at    TIMESTAMPTZ;

-- 4. Indexes
-- NOTE: idx_proposals_freelancer already exists on proposals(freelancer_email) from migration 0021
--       Use a distinct name for the freelancer_id index.
CREATE INDEX IF NOT EXISTS idx_proposals_freelancer_id
    ON proposals (freelancer_id) WHERE freelancer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_proposals_job_listing
    ON proposals (job_listing_id) WHERE job_listing_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_deployments_type
    ON deployments (deployment_type);
