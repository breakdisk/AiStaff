-- migrations/0057_proposals_profile_and_status.sql
--
-- Link proposals to the submitter's unified profile (nullable for backward compat).
-- Extend status CHECK to include DRAFT for the Proposal Inbox Kanban.
--
-- IMPORTANT: proposals.submitted_at is NOT NULL DEFAULT NOW() — it is always set.
-- Do NOT use submitted_at IS NULL to infer draft status. Use the status column only.

ALTER TABLE proposals
    ADD COLUMN submitted_by_profile_id UUID REFERENCES unified_profiles(id);

CREATE INDEX idx_proposals_submitted_by ON proposals(submitted_by_profile_id);

-- Drop and re-add check constraint to include DRAFT.
-- The existing constraint was added by migration 0027 as 'proposals_status_check'.
-- Existing rows (PENDING / ACCEPTED / REJECTED) are unaffected.
ALTER TABLE proposals DROP CONSTRAINT IF EXISTS proposals_status_check;
ALTER TABLE proposals ADD CONSTRAINT proposals_status_check
    CHECK (status IN ('DRAFT', 'PENDING', 'ACCEPTED', 'REJECTED'));
