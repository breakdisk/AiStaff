-- 0021: Freelancer proposal submissions
--
-- Stores proposals submitted via the Proposal Copilot (/proposals/draft).
-- Separate from agent_listings — proposals are time-bounded responses to
-- a job brief, not permanent marketplace items.

CREATE TABLE proposals (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    job_title       TEXT        NOT NULL,
    cover_letter    TEXT        NOT NULL,
    technical_approach TEXT     NOT NULL,
    proposed_timeline TEXT      NOT NULL,
    proposed_budget   TEXT      NOT NULL,
    key_deliverables  TEXT[]    NOT NULL DEFAULT '{}',
    why_me          TEXT        NOT NULL,
    freelancer_email TEXT       NOT NULL,
    client_email    TEXT        NOT NULL,
    submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_proposals_freelancer ON proposals (freelancer_email);
CREATE INDEX idx_proposals_submitted  ON proposals (submitted_at DESC);
