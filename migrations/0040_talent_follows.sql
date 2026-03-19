CREATE TABLE talent_follows (
  follower_id  UUID NOT NULL REFERENCES unified_profiles(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES unified_profiles(id) ON DELETE CASCADE,
  followed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (follower_id, following_id)
);

CREATE INDEX idx_talent_follows_following ON talent_follows(following_id);
