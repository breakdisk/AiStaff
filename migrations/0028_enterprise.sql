-- migrations/0028_enterprise.sql

-- Organisation plan tiers
CREATE TYPE org_plan_tier AS ENUM ('GROWTH', 'ENTERPRISE', 'PLATINUM');

-- Core org table
CREATE TABLE organisations (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                      TEXT NOT NULL,
    owner_id                  UUID NOT NULL REFERENCES unified_profiles(id),
    plan_tier                 org_plan_tier NOT NULL DEFAULT 'GROWTH',
    contract_value_cents      BIGINT NOT NULL DEFAULT 0,
    renewal_date              DATE,
    veto_window_seconds       INT NOT NULL DEFAULT 30,
    custom_escrow_platform_pct INT NOT NULL DEFAULT 30,
    csm_name                  TEXT,
    csm_email                 TEXT,
    csm_response_sla          TEXT DEFAULT '< 4 hr',
    created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Org membership (owner is always ADMIN + listed here)
CREATE TABLE org_members (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    profile_id  UUID NOT NULL REFERENCES unified_profiles(id) ON DELETE CASCADE,
    member_role TEXT NOT NULL DEFAULT 'MEMBER' CHECK (member_role IN ('ADMIN', 'MEMBER')),
    joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (org_id, profile_id)
);

-- Email invites (token-based, single-use)
CREATE TABLE org_invites (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id         UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    inviter_id     UUID NOT NULL REFERENCES unified_profiles(id),
    invitee_email  TEXT NOT NULL,
    token          TEXT NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
    accepted_at    TIMESTAMPTZ,
    expires_at     TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- API keys (hash stored, raw shown once)
CREATE TABLE org_api_keys (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id       UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    label        TEXT NOT NULL,
    key_hash     TEXT NOT NULL UNIQUE,
    created_by   UUID NOT NULL REFERENCES unified_profiles(id),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ,
    revoked_at   TIMESTAMPTZ
);

-- Link deployments to org (nullable — not all deployments are org-scoped)
ALTER TABLE deployments ADD COLUMN org_id UUID REFERENCES organisations(id);

-- Indexes
CREATE INDEX idx_org_members_org_id     ON org_members(org_id);
CREATE INDEX idx_org_members_profile_id ON org_members(profile_id);
CREATE INDEX idx_org_invites_token      ON org_invites(token);
CREATE INDEX idx_org_invites_org_id     ON org_invites(org_id);
CREATE INDEX idx_org_api_keys_org_id    ON org_api_keys(org_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_deployments_org_id     ON deployments(org_id) WHERE org_id IS NOT NULL;
