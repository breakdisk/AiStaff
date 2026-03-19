-- migrations/0041_talent_follows_no_self_follow.sql
ALTER TABLE talent_follows
  ADD CONSTRAINT no_self_follow CHECK (follower_id <> following_id);
