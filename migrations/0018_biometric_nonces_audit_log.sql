-- 0018: biometric nonces (single-use, 10-min TTL) + identity audit log

CREATE TABLE biometric_nonces (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  UUID        NOT NULL REFERENCES unified_profiles(id) ON DELETE CASCADE,
  nonce_hex   TEXT        NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '10 minutes',
  used_at     TIMESTAMPTZ
);

CREATE INDEX idx_biometric_nonces_profile ON biometric_nonces (profile_id);
CREATE INDEX idx_biometric_nonces_nonce   ON biometric_nonces (nonce_hex);

-- Append-only identity audit log (no DELETE/UPDATE grants)
CREATE TABLE identity_audit_log (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  UUID        NOT NULL REFERENCES unified_profiles(id) ON DELETE CASCADE,
  event_type  TEXT        NOT NULL,   -- e.g. PROVIDER_CONNECTED, PROVIDER_DISCONNECTED, TIER_CHANGED, SKILL_ATTESTED
  event_data  JSONB       NOT NULL DEFAULT '{}',
  old_tier    TEXT,
  new_tier    TEXT,
  old_score   SMALLINT,
  new_score   SMALLINT,
  actor_id    UUID,                   -- who performed the action (same as profile_id for self)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_identity_audit_profile ON identity_audit_log (profile_id, created_at DESC);
