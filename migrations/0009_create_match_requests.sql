CREATE TABLE match_requests (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id        UUID NOT NULL REFERENCES agent_listings(id),
    required_skills TEXT[] NOT NULL,
    min_trust_score SMALLINT NOT NULL DEFAULT 40,
    jurisdiction    CHAR(2),
    requested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    fulfilled_at    TIMESTAMPTZ
);

CREATE TABLE match_results (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id  UUID NOT NULL REFERENCES match_requests(id),
    talent_id   UUID NOT NULL,
    match_score REAL NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
