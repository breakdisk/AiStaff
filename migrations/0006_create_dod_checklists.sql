CREATE TABLE dod_checklist_steps (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deployment_id UUID NOT NULL REFERENCES deployments(id),
    step_id       TEXT NOT NULL,
    step_label    TEXT NOT NULL,
    passed        BOOLEAN NOT NULL,
    notes         TEXT,
    completed_at  TIMESTAMPTZ NOT NULL,
    UNIQUE (deployment_id, step_id)
);

CREATE TABLE dod_checklist_summaries (
    deployment_id UUID PRIMARY KEY REFERENCES deployments(id),
    all_passed    BOOLEAN NOT NULL,
    failed_steps  TEXT[] NOT NULL DEFAULT '{}',
    finalized_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
