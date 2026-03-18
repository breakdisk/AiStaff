-- E-signature columns for two-party contract signing flow
ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS party_b_email         TEXT,
  ADD COLUMN IF NOT EXISTS sign_token            TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS sign_token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS party_b_signed_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS document_text         TEXT;
