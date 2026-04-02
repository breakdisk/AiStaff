-- migrations/0054_tos_accepted_at.sql
ALTER TABLE unified_profiles
  ADD COLUMN tos_accepted_at TIMESTAMPTZ;
