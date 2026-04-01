CREATE TABLE saved_listings (
  profile_id UUID NOT NULL REFERENCES unified_profiles(id) ON DELETE CASCADE,
  listing_id UUID NOT NULL REFERENCES agent_listings(id) ON DELETE CASCADE,
  saved_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, listing_id)
);
