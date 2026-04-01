-- 0073: Skill endorsements from clients after completed deployments
-- One endorsement per (endorser, profile, skill, deployment) tuple.

CREATE TABLE skill_endorsements (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  endorser_id  UUID        NOT NULL REFERENCES unified_profiles(id) ON DELETE CASCADE,
  profile_id   UUID        NOT NULL REFERENCES unified_profiles(id) ON DELETE CASCADE,
  skill_tag_id UUID        NOT NULL REFERENCES skill_tags(id)       ON DELETE CASCADE,
  deployment_id UUID       NOT NULL REFERENCES deployments(id)      ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (endorser_id, profile_id, skill_tag_id, deployment_id)
);

CREATE INDEX ON skill_endorsements (profile_id, skill_tag_id);
CREATE INDEX ON skill_endorsements (deployment_id);
