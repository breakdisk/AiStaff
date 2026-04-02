-- migrations/0044_match_invitations_and_trials.sql
-- Invite to Project + Trial Engagement tables for the matching flow

CREATE TABLE match_invitations (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id    UUID NOT NULL REFERENCES unified_profiles(id) ON DELETE CASCADE,
    talent_id    UUID NOT NULL,
    listing_id   UUID REFERENCES agent_listings(id) ON DELETE SET NULL,
    message      TEXT,
    status       TEXT NOT NULL DEFAULT 'PENDING'
                     CHECK (status IN ('PENDING', 'ACCEPTED', 'DECLINED')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    responded_at TIMESTAMPTZ
);

CREATE INDEX idx_match_invitations_client ON match_invitations(client_id);
CREATE INDEX idx_match_invitations_talent ON match_invitations(talent_id);

CREATE TABLE trial_engagements (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id        UUID NOT NULL REFERENCES unified_profiles(id) ON DELETE CASCADE,
    talent_id        UUID NOT NULL,
    listing_id       UUID REFERENCES agent_listings(id) ON DELETE SET NULL,
    trial_rate_cents BIGINT NOT NULL DEFAULT 0,
    status           TEXT NOT NULL DEFAULT 'ACTIVE'
                         CHECK (status IN ('ACTIVE', 'CONVERTED', 'ENDED')),
    rating           SMALLINT CHECK (rating BETWEEN 1 AND 5),
    started_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    converted_at     TIMESTAMPTZ,
    ended_at         TIMESTAMPTZ,
    end_reason       TEXT
);

CREATE INDEX idx_trial_engagements_client ON trial_engagements(client_id);
CREATE INDEX idx_trial_engagements_talent ON trial_engagements(talent_id);
