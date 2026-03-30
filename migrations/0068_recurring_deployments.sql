-- Recurring deployments: agencies offer monthly/quarterly/annual retainers
ALTER TABLE deployments
    ADD COLUMN IF NOT EXISTS recurrence           TEXT
        CHECK (recurrence IN ('MONTHLY','QUARTERLY','ANNUAL')),
    ADD COLUMN IF NOT EXISTS recurrence_parent_id UUID REFERENCES deployments(id),
    ADD COLUMN IF NOT EXISTS next_billing_at      TIMESTAMPTZ;

CREATE INDEX ON deployments (next_billing_at) WHERE next_billing_at IS NOT NULL;
