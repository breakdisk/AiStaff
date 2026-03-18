-- Work sessions auto-created from [START]/[END] convention commits
CREATE TABLE work_diary_sessions (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    integration_id   UUID NOT NULL REFERENCES workspace_integrations(id) ON DELETE CASCADE,
    owner_profile_id UUID NOT NULL REFERENCES unified_profiles(id),
    session_date     DATE NOT NULL,
    started_at       TIMESTAMPTZ NOT NULL,
    ended_at         TIMESTAMPTZ,                        -- NULL = session still open
    commit_count     INT NOT NULL DEFAULT 0,
    files_count      INT NOT NULL DEFAULT 0,
    commit_messages  TEXT[] NOT NULL DEFAULT '{}',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX work_diary_sessions_owner_date ON work_diary_sessions (owner_profile_id, session_date DESC);
CREATE INDEX work_diary_sessions_integration ON work_diary_sessions (integration_id, started_at DESC);

-- Daily diary entry (talent finalises: mood, notes, manual activities)
CREATE TABLE work_diary_entries (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_profile_id UUID NOT NULL REFERENCES unified_profiles(id),
    deployment_id    UUID REFERENCES deployments(id),
    entry_date       DATE NOT NULL,
    mood             TEXT NOT NULL DEFAULT 'steady',     -- productive | steady | blocked
    notes            TEXT,
    ai_summary       TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX work_diary_entries_uniq ON work_diary_entries (owner_profile_id, entry_date);

-- Manual non-git activities (meetings, design, review, etc.)
CREATE TABLE work_diary_activities (
    id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_id  UUID NOT NULL REFERENCES work_diary_entries(id) ON DELETE CASCADE,
    category  TEXT NOT NULL DEFAULT 'meetings',          -- meetings | review | docs | break
    label     TEXT NOT NULL,
    hours     NUMERIC(4,2) NOT NULL CHECK (hours > 0)
);
