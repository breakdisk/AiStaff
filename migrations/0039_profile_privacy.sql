CREATE TABLE profile_privacy (
  profile_id        UUID PRIMARY KEY REFERENCES unified_profiles(id) ON DELETE CASCADE,
  profile_public    BOOLEAN NOT NULL DEFAULT TRUE,
  show_bio          BOOLEAN NOT NULL DEFAULT TRUE,
  show_rate         BOOLEAN NOT NULL DEFAULT TRUE,
  show_skills       BOOLEAN NOT NULL DEFAULT TRUE,
  show_trust_score  BOOLEAN NOT NULL DEFAULT TRUE,
  show_availability BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
