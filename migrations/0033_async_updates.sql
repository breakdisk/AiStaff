-- Async video updates for workspace collaboration
CREATE TABLE async_updates (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deployment_id UUID REFERENCES deployments(id),
    author_id     UUID NOT NULL REFERENCES unified_profiles(id),
    author_name   TEXT NOT NULL,
    title         TEXT NOT NULL DEFAULT '',
    video_path    TEXT,                        -- filename in ASYNC_COLLAB_UPLOAD_DIR
    duration_s    INT  NOT NULL DEFAULT 0,
    ai_summary    TEXT,
    tags          TEXT[] NOT NULL DEFAULT '{}',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON async_updates (deployment_id, created_at DESC);
CREATE INDEX ON async_updates (author_id, created_at DESC);

-- Per-user view tracking (many-to-many)
CREATE TABLE async_update_views (
    update_id  UUID NOT NULL REFERENCES async_updates(id) ON DELETE CASCADE,
    viewer_id  UUID NOT NULL REFERENCES unified_profiles(id),
    viewed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (update_id, viewer_id)
);
