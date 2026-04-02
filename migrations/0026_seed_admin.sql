-- migrations/0026_seed_admin.sql
-- Seeds the platform owner as admin.
-- Replace the email below with the real owner email before deploying.

UPDATE unified_profiles
SET is_admin = TRUE
WHERE email = 'eduard.cleofe@gmail.com';
