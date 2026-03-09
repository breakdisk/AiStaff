-- Migration 0015: Multi-Channel Notification System
-- Adds: notification_preferences, in_app_notifications, device_tokens,
--        connected_integrations; extends notification_channel enum

-- ── 1. Extend notification_channel enum ──────────────────────────────────────
ALTER TYPE notification_channel ADD VALUE IF NOT EXISTS 'SMS';
ALTER TYPE notification_channel ADD VALUE IF NOT EXISTS 'IN_APP';
ALTER TYPE notification_channel ADD VALUE IF NOT EXISTS 'WHATSAPP';
ALTER TYPE notification_channel ADD VALUE IF NOT EXISTS 'SLACK';
ALTER TYPE notification_channel ADD VALUE IF NOT EXISTS 'TEAMS';

-- ── 2. Phone number on unified_profiles (SMS target) ─────────────────────────
ALTER TABLE unified_profiles
  ADD COLUMN IF NOT EXISTS phone_number TEXT;

-- ── 3. notification_preferences ──────────────────────────────────────────────
CREATE TABLE notification_preferences (
  user_id             UUID PRIMARY KEY REFERENCES unified_profiles(id) ON DELETE CASCADE,
  email_enabled       BOOLEAN NOT NULL DEFAULT true,
  sms_enabled         BOOLEAN NOT NULL DEFAULT false,
  push_enabled        BOOLEAN NOT NULL DEFAULT false,
  in_app_enabled      BOOLEAN NOT NULL DEFAULT true,
  whatsapp_enabled    BOOLEAN NOT NULL DEFAULT false,
  slack_enabled       BOOLEAN NOT NULL DEFAULT false,
  teams_enabled       BOOLEAN NOT NULL DEFAULT false,
  quiet_hours_start   TIME,
  quiet_hours_end     TIME,
  quiet_hours_tz      TEXT NOT NULL DEFAULT 'UTC',
  digest_mode         TEXT NOT NULL DEFAULT 'realtime',  -- realtime | hourly | daily
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 4. in_app_notifications ───────────────────────────────────────────────────
CREATE TABLE in_app_notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES unified_profiles(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  event_type  TEXT NOT NULL,   -- e.g. DriftDetected, EscrowRelease, MatchFound
  priority    TEXT NOT NULL DEFAULT 'normal',  -- high | normal | batched
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_in_app_user_unread
  ON in_app_notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;

-- ── 5. device_tokens (push notifications) ────────────────────────────────────
CREATE TABLE device_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES unified_profiles(id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE,
  platform    TEXT NOT NULL CHECK (platform IN ('web', 'android', 'ios')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_device_tokens_user ON device_tokens (user_id);

-- ── 6. connected_integrations (WhatsApp / Slack / Teams / Google Meet) ───────
CREATE TABLE connected_integrations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES unified_profiles(id) ON DELETE CASCADE,
  provider        TEXT NOT NULL CHECK (provider IN ('whatsapp','slack','teams','google_meet')),
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','verified','revoked')),
  nonce           TEXT UNIQUE,           -- QR pairing token / OAuth state
  webhook_url     TEXT,                  -- Slack or Teams incoming webhook URL
  access_token    TEXT,                  -- AES-GCM encrypted; Google / Slack
  refresh_token   TEXT,                  -- AES-GCM encrypted; Google
  phone_number    TEXT,                  -- WhatsApp sender phone (E.164)
  display_name    TEXT,                  -- e.g. Slack workspace name, Google email
  extra           JSONB,                 -- provider-specific metadata
  connected_at    TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);

CREATE INDEX idx_connected_integrations_user ON connected_integrations (user_id);
