-- Add messenger_enabled preference flag to notification_preferences
ALTER TABLE notification_preferences
    ADD COLUMN IF NOT EXISTS messenger_enabled BOOLEAN NOT NULL DEFAULT false;
