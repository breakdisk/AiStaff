-- migrations/0045_github_social_stats.sql
ALTER TABLE unified_profiles
  ADD COLUMN IF NOT EXISTS github_followers INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS github_stars     INTEGER NOT NULL DEFAULT 0;
