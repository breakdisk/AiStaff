-- Migration 0022: financial idempotency + Stripe payment fields
--
-- CLAUDE.md § Finance: every financial transaction carries a transaction_id UUID v7.
-- CLAUDE.md § Finance: all money stored as BIGINT (cents), no FLOAT/DECIMAL.

-- 1. transaction_id for idempotency (UUID v7 — time-ordered)
ALTER TABLE deployments ADD COLUMN IF NOT EXISTS transaction_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS deployments_transaction_id_key
    ON deployments (transaction_id)
    WHERE transaction_id IS NOT NULL;

-- 2. Stripe PaymentIntent reference (populated at payment confirmation)
ALTER TABLE deployments ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT;

-- 3. Payment status state machine
ALTER TABLE deployments
    ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (payment_status IN ('pending', 'confirmed', 'refunded'));

-- 4. Relax NOT NULL on developer_id and total_amount_cents so the existing
--    handler (which doesn't supply them) keeps working while we migrate.
--    developer_id falls back to freelancer_id in the application layer.
ALTER TABLE deployments ALTER COLUMN developer_id DROP NOT NULL;
ALTER TABLE deployments ALTER COLUMN total_amount_cents DROP NOT NULL;

-- 5. Index on stripe_payment_intent_id for webhook lookups
CREATE INDEX IF NOT EXISTS deployments_stripe_pi_id
    ON deployments (stripe_payment_intent_id)
    WHERE stripe_payment_intent_id IS NOT NULL;
