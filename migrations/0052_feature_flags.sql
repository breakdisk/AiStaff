-- migrations/0052_feature_flags.sql
CREATE TABLE feature_flags (
  name        TEXT        PRIMARY KEY,
  enabled     BOOLEAN     NOT NULL DEFAULT false,
  description TEXT        NOT NULL DEFAULT '',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  UUID        REFERENCES unified_profiles(id)
);

-- ⚠️ DEPLOYMENT ORDER: Before deploying payout_service changes that read this table,
-- verify this seed value matches SKIP_BIOMETRIC on the target environment.
-- If SKIP_BIOMETRIC=true in production, change enabled to true before running.
INSERT INTO feature_flags (name, enabled, description)
VALUES (
  'skip_biometric',
  false,
  'Skip ZK biometric sign-off during veto window. Enable in staging only. DANGER: affects escrow release.'
);
