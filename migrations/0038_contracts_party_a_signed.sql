-- Party A explicit signature tracking + email storage for confirmation flow
ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS party_a_email      TEXT,
  ADD COLUMN IF NOT EXISTS party_a_signed_at  TIMESTAMPTZ;
