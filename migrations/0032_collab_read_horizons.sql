-- Tracks the last time each user read messages in each deployment's chat.
-- Used to compute unread message counts without per-message read receipts.
CREATE TABLE collab_read_horizons (
    deployment_id UUID        NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
    profile_id    UUID        NOT NULL REFERENCES unified_profiles(id) ON DELETE CASCADE,
    last_read_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (deployment_id, profile_id)
);

CREATE INDEX idx_collab_read_horizons_profile ON collab_read_horizons (profile_id);
