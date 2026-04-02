-- Migration 0048: Fix connected_integrations for Messenger support
-- 1. Drop the old provider CHECK constraint (whatsapp|slack|teams|google_meet only)
-- 2. Re-add it with 'messenger' included
-- 3. Add display_name default so polling never blanks the QR link

ALTER TABLE connected_integrations
    DROP CONSTRAINT IF EXISTS connected_integrations_provider_check;

ALTER TABLE connected_integrations
    ADD CONSTRAINT connected_integrations_provider_check
    CHECK (provider IN ('whatsapp', 'slack', 'teams', 'google_meet', 'messenger'));
