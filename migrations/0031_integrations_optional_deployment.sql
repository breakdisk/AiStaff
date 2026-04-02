-- Make deployment_id optional on workspace_integrations.
-- Integrations can now exist at the workspace/user level without requiring
-- a deployment to exist first. deployment_id is set when the integration
-- is later linked to a specific engagement.
ALTER TABLE workspace_integrations
    ALTER COLUMN deployment_id DROP NOT NULL;

-- Add owner_profile_id so integrations can be scoped to a user when
-- no deployment_id is present.
ALTER TABLE workspace_integrations
    ADD COLUMN IF NOT EXISTS owner_profile_id UUID REFERENCES unified_profiles(id);

CREATE INDEX IF NOT EXISTS idx_workspace_integrations_owner
    ON workspace_integrations (owner_profile_id);
