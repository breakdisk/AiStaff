-- Workspace integrations: GitHub repos / Figma files linked to a deployment
CREATE TABLE workspace_integrations (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deployment_id  UUID NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
    provider       TEXT NOT NULL,                                  -- 'github' | 'figma'
    name           TEXT NOT NULL,                                  -- e.g. "owner/repo"
    external_url   TEXT NOT NULL,
    external_id    TEXT NOT NULL,                                  -- repo full_name or figma file_id
    webhook_id     BIGINT,                                         -- GitHub webhook id (for future deletion)
    connected_by   UUID NOT NULL REFERENCES unified_profiles(id),
    connected_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status         TEXT NOT NULL DEFAULT 'connected'               -- 'connected' | 'disconnected'
);

CREATE INDEX idx_workspace_integrations_deployment ON workspace_integrations (deployment_id);
CREATE INDEX idx_workspace_integrations_external   ON workspace_integrations (external_id);

-- Events received from connected integrations (GitHub push, PR, etc.)
CREATE TABLE workspace_integration_events (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    integration_id UUID NOT NULL REFERENCES workspace_integrations(id) ON DELETE CASCADE,
    event_type     TEXT NOT NULL,    -- 'push' | 'pull_request' | 'issue' etc.
    title          TEXT NOT NULL,    -- human-readable summary
    occurred_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_workspace_events_integration ON workspace_integration_events (integration_id, occurred_at DESC);
