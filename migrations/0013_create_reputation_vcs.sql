CREATE TABLE reputation_vcs (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    talent_id  UUID NOT NULL UNIQUE,
    vc_jwt     TEXT NOT NULL,
    issued_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
