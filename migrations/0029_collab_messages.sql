-- Collaboration chat messages, scoped to a deployment
CREATE TABLE collab_messages (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    deployment_id UUID        NOT NULL REFERENCES deployments(id),
    sender_id     UUID        NOT NULL REFERENCES unified_profiles(id),
    sender_name   TEXT        NOT NULL,
    body          TEXT        NOT NULL CHECK (char_length(body) > 0),
    file_name     TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_collab_messages_deployment ON collab_messages(deployment_id, created_at ASC);
