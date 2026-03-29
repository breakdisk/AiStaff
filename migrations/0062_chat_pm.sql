-- migrations/0062_chat_pm.sql
-- AI Project Manager: scope drift detection, system messages, change requests.

-- ── 1. System AI PM profile (FK-safe sender_id for injected system messages) ──
INSERT INTO unified_profiles
    (id, display_name, email, trust_score, identity_tier, account_type, created_at, updated_at)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'AI Project Manager',
    'system-pm@aistaff.internal',
    100,
    'SOCIAL_VERIFIED',
    'individual',
    NOW(), NOW()
)
ON CONFLICT (id) DO NOTHING;

-- ── 2. collab_messages: message_type + metadata ───────────────────────────────
-- message_type: 'user' (default) | 'scope_warning' | 'system_info'
ALTER TABLE collab_messages
    ADD COLUMN IF NOT EXISTS message_type VARCHAR(50) NOT NULL DEFAULT 'user',
    ADD COLUMN IF NOT EXISTS metadata     JSONB;

CREATE INDEX IF NOT EXISTS collab_messages_type_idx
    ON collab_messages (message_type)
    WHERE message_type <> 'user';

-- ── 3. deployments.sow_text — baseline scope for AI PM reasoning ──────────────
-- NULL = no formal SOW; AI PM falls back to listing name + description.
ALTER TABLE deployments
    ADD COLUMN IF NOT EXISTS sow_text TEXT;

-- ── 4. change_requests ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS change_requests (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    deployment_id       UUID        NOT NULL REFERENCES deployments(id),
    -- The chat message that triggered the scope drift (may be NULL for manual CRs).
    trigger_message_id  UUID        REFERENCES collab_messages(id),
    description         TEXT        NOT NULL,
    -- Net price change in USD cents. Positive = more money to freelancer.
    price_delta_cents   BIGINT      NOT NULL DEFAULT 0,
    status              VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                                    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    raised_by           UUID        NOT NULL REFERENCES unified_profiles(id),
    responded_by        UUID        REFERENCES unified_profiles(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS change_requests_deployment_idx
    ON change_requests (deployment_id);
