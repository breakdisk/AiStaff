-- 0072: Freelancer payout requests
-- Self-service payout initiation — submitted to an admin review queue.
-- Idempotency: one PENDING request per profile at a time (enforced at app layer).

CREATE TABLE payout_requests (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id   UUID        NOT NULL REFERENCES unified_profiles(id) ON DELETE CASCADE,
  amount_cents BIGINT      NOT NULL CHECK (amount_cents > 0),
  bank_ref     TEXT,
  note         TEXT,
  status       TEXT        NOT NULL DEFAULT 'PENDING',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at  TIMESTAMPTZ,
  reviewed_by  UUID        REFERENCES unified_profiles(id),
  CONSTRAINT payout_requests_status_check
    CHECK (status IN ('PENDING', 'PROCESSING', 'PAID', 'REJECTED'))
);

CREATE INDEX ON payout_requests (profile_id, created_at DESC);
CREATE INDEX ON payout_requests (status) WHERE status = 'PENDING';
