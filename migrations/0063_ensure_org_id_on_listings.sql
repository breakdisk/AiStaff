-- Ensure org_id exists on agent_listings.
-- Migration 0056 was not applied on some instances because it was added after
-- initial deployment. This migration uses IF NOT EXISTS to be idempotent.
ALTER TABLE agent_listings
    ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organisations(id) ON DELETE SET NULL;
