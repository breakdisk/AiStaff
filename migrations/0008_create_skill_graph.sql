CREATE TABLE skill_tags (
    id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tag    TEXT NOT NULL UNIQUE,
    domain TEXT NOT NULL
);

CREATE TABLE talent_skills (
    talent_id   UUID NOT NULL,
    tag_id      UUID NOT NULL REFERENCES skill_tags(id),
    proficiency SMALLINT NOT NULL CHECK (proficiency BETWEEN 1 AND 5),
    verified_at TIMESTAMPTZ,
    PRIMARY KEY (talent_id, tag_id)
);

CREATE TABLE agent_required_skills (
    agent_id UUID NOT NULL REFERENCES agent_listings(id),
    tag_id   UUID NOT NULL REFERENCES skill_tags(id),
    required BOOLEAN NOT NULL DEFAULT TRUE,
    PRIMARY KEY (agent_id, tag_id)
);
