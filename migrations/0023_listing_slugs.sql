-- 0023: Add human-readable slug column to agent_listings
--
-- Slugs are derived from the listing name (kebab-case, ASCII only).
-- They appear in share URLs: /listings/<slug>
-- UNIQUE index enforces no two listings share the same slug.

-- 1. Add nullable column so existing rows can be backfilled first.
ALTER TABLE agent_listings
  ADD COLUMN IF NOT EXISTS slug TEXT;

-- 2. Backfill from name: lowercase, replace non-alphanumeric runs with '-',
--    strip leading/trailing hyphens.
UPDATE agent_listings
SET slug = regexp_replace(
               lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g')),
               '^-+|-+$', '', 'g'
           )
WHERE slug IS NULL;

-- 3. Enforce NOT NULL now that every row has a value.
ALTER TABLE agent_listings
  ALTER COLUMN slug SET NOT NULL;

-- 4. Unique index (supports fast slug lookups as well).
CREATE UNIQUE INDEX IF NOT EXISTS agent_listings_slug_uq
  ON agent_listings (slug);
