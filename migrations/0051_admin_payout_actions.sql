-- migrations/0051_admin_payout_actions.sql
-- Append-only audit trail for admin financial interventions.
CREATE TABLE admin_payout_actions (
  id             UUID        PRIMARY KEY,
  deployment_id  UUID        NOT NULL REFERENCES deployments(id),
  admin_id       UUID        NOT NULL REFERENCES unified_profiles(id),
  action         TEXT        NOT NULL CHECK (action IN ('force_release', 'force_veto')),
  reason         TEXT        NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_admin_payout_actions_deployment ON admin_payout_actions(deployment_id);
CREATE INDEX idx_admin_payout_actions_admin      ON admin_payout_actions(admin_id);
