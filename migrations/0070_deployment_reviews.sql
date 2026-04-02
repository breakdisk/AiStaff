CREATE TABLE deployment_reviews (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_id UUID NOT NULL REFERENCES deployments(id),
  listing_id    UUID NOT NULL REFERENCES agent_listings(id),
  reviewer_id   UUID NOT NULL REFERENCES unified_profiles(id),
  rating        SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (deployment_id, reviewer_id)
);
CREATE INDEX ON deployment_reviews(listing_id);
