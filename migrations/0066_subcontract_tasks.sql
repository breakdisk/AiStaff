-- Sub-contracting: agencies break client deployments into tasks and assign to freelancers
CREATE TABLE subcontract_tasks (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    deployment_id UUID        NOT NULL REFERENCES deployments(id),
    org_id        UUID        NOT NULL REFERENCES organisations(id),
    freelancer_id UUID        REFERENCES unified_profiles(id),
    title         TEXT        NOT NULL,
    description   TEXT,
    budget_cents  BIGINT      NOT NULL CHECK (budget_cents > 0),
    status        TEXT        NOT NULL DEFAULT 'OPEN'
                  CHECK (status IN ('OPEN','ASSIGNED','SUBMITTED','APPROVED','PAID')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON subcontract_tasks (deployment_id);
CREATE INDEX ON subcontract_tasks (org_id);
CREATE INDEX ON subcontract_tasks (freelancer_id);
