-- migrations/0046_reminders.sql
CREATE TABLE reminders (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID NOT NULL REFERENCES unified_profiles(id),
    deployment_id  UUID REFERENCES deployments(id),
    title          TEXT NOT NULL,
    remind_at      TIMESTAMPTZ NOT NULL,
    source         TEXT NOT NULL DEFAULT 'user',
    fired          BOOLEAN NOT NULL DEFAULT false,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX reminders_user_idx ON reminders(user_id);
CREATE INDEX reminders_due_idx  ON reminders(remind_at, fired) WHERE fired = false;
