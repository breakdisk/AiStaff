-- Add submit/approve lifecycle columns to dod_checklist_steps.
--
-- Migration 0006 defined completed_at as NOT NULL, but the proposal accept
-- handler seeds rows without it (steps start pending, not completed).
-- The milestone submit/approve flow also requires submitted_by/at and
-- approved_by/at which were never added to the schema.

ALTER TABLE dod_checklist_steps
    ALTER COLUMN completed_at DROP NOT NULL,
    ADD COLUMN IF NOT EXISTS submitted_by  UUID        REFERENCES unified_profiles(id),
    ADD COLUMN IF NOT EXISTS submitted_at  TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS approved_by   UUID        REFERENCES unified_profiles(id),
    ADD COLUMN IF NOT EXISTS approved_at   TIMESTAMPTZ;
