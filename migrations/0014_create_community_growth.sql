-- Migration 0014: Community & Growth Service
-- Feature 08: Niche Community Hubs, Career Growth Layer,
--             Peer Mentorship Program, Well-Being Features

-- ── Community Hubs ────────────────────────────────────────────────────────────

CREATE TABLE community_hubs (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    slug          TEXT        NOT NULL UNIQUE,
    name          TEXT        NOT NULL,
    description   TEXT        NOT NULL DEFAULT '',
    category      TEXT        NOT NULL DEFAULT 'general',  -- 'aistaff'|'airobot'|'aitalent'|'general'
    timezone      TEXT        NOT NULL DEFAULT 'UTC',       -- IANA tz e.g. 'America/New_York'
    owner_id      UUID        NOT NULL REFERENCES unified_profiles(id) ON DELETE CASCADE,
    member_count  INT         NOT NULL DEFAULT 0,
    is_private    BOOLEAN     NOT NULL DEFAULT false,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX community_hubs_category_idx ON community_hubs(category);
CREATE INDEX community_hubs_owner_id_idx ON community_hubs(owner_id);

CREATE TABLE hub_memberships (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    hub_id     UUID        NOT NULL REFERENCES community_hubs(id) ON DELETE CASCADE,
    user_id    UUID        NOT NULL REFERENCES unified_profiles(id) ON DELETE CASCADE,
    role       TEXT        NOT NULL DEFAULT 'member',  -- 'owner'|'moderator'|'member'
    joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(hub_id, user_id)
);

CREATE INDEX hub_memberships_user_id_idx ON hub_memberships(user_id);

CREATE TABLE community_events (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    hub_id          UUID        NOT NULL REFERENCES community_hubs(id) ON DELETE CASCADE,
    organizer_id    UUID        NOT NULL REFERENCES unified_profiles(id) ON DELETE CASCADE,
    title           TEXT        NOT NULL,
    description     TEXT        NOT NULL DEFAULT '',
    event_type      TEXT        NOT NULL DEFAULT 'meetup',  -- 'meetup'|'workshop'|'ama'|'hackathon'
    timezone        TEXT        NOT NULL DEFAULT 'UTC',
    starts_at       TIMESTAMPTZ NOT NULL,
    ends_at         TIMESTAMPTZ NOT NULL,
    max_attendees   INT,
    attendee_count  INT         NOT NULL DEFAULT 0,
    meeting_url     TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT valid_event_window CHECK (ends_at > starts_at)
);

CREATE INDEX community_events_hub_id_idx    ON community_events(hub_id);
CREATE INDEX community_events_starts_at_idx ON community_events(starts_at);

CREATE TABLE event_attendees (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id    UUID        NOT NULL REFERENCES community_events(id) ON DELETE CASCADE,
    user_id     UUID        NOT NULL REFERENCES unified_profiles(id) ON DELETE CASCADE,
    rsvp_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(event_id, user_id)
);

-- ── Forum Threads & Posts ─────────────────────────────────────────────────────

CREATE TABLE forum_threads (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    hub_id       UUID        NOT NULL REFERENCES community_hubs(id) ON DELETE CASCADE,
    author_id    UUID        NOT NULL REFERENCES unified_profiles(id) ON DELETE CASCADE,
    title        TEXT        NOT NULL,
    body         TEXT        NOT NULL,
    reply_count  INT         NOT NULL DEFAULT 0,
    pinned       BOOLEAN     NOT NULL DEFAULT false,
    locked       BOOLEAN     NOT NULL DEFAULT false,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX forum_threads_hub_id_idx    ON forum_threads(hub_id);
CREATE INDEX forum_threads_author_id_idx ON forum_threads(author_id);
CREATE INDEX forum_threads_created_at_idx ON forum_threads(created_at DESC);

CREATE TABLE forum_posts (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id   UUID        NOT NULL REFERENCES forum_threads(id) ON DELETE CASCADE,
    author_id   UUID        NOT NULL REFERENCES unified_profiles(id) ON DELETE CASCADE,
    body        TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX forum_posts_thread_id_idx  ON forum_posts(thread_id);
CREATE INDEX forum_posts_author_id_idx  ON forum_posts(author_id);

-- ── Peer Mentorship Program ───────────────────────────────────────────────────

CREATE TABLE mentor_profiles (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID        NOT NULL UNIQUE REFERENCES unified_profiles(id) ON DELETE CASCADE,
    bio                 TEXT        NOT NULL DEFAULT '',
    specializations     TEXT[]      NOT NULL DEFAULT '{}',
    max_mentees         INT         NOT NULL DEFAULT 3,
    current_mentees     INT         NOT NULL DEFAULT 0,
    availability_tz     TEXT        NOT NULL DEFAULT 'UTC',
    accepting_requests  BOOLEAN     NOT NULL DEFAULT true,
    session_rate_cents  INT         NOT NULL DEFAULT 0,  -- 0 = free
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE mentorship_pairs (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    mentor_id    UUID        NOT NULL REFERENCES unified_profiles(id) ON DELETE CASCADE,
    mentee_id    UUID        NOT NULL REFERENCES unified_profiles(id) ON DELETE CASCADE,
    status       TEXT        NOT NULL DEFAULT 'active',  -- 'pending'|'active'|'completed'|'cancelled'
    goal         TEXT        NOT NULL DEFAULT '',
    started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    UNIQUE(mentor_id, mentee_id),
    CONSTRAINT different_users CHECK (mentor_id != mentee_id)
);

CREATE INDEX mentorship_pairs_mentor_id_idx ON mentorship_pairs(mentor_id);
CREATE INDEX mentorship_pairs_mentee_id_idx ON mentorship_pairs(mentee_id);

CREATE TABLE mentorship_sessions (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    pair_id     UUID        NOT NULL REFERENCES mentorship_pairs(id) ON DELETE CASCADE,
    scheduled_at TIMESTAMPTZ NOT NULL,
    duration_min INT         NOT NULL DEFAULT 60,
    notes       TEXT,
    status      TEXT        NOT NULL DEFAULT 'scheduled',  -- 'scheduled'|'completed'|'cancelled'
    rating      SMALLINT,  -- 1-5, filled by mentee after session
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT valid_rating CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5))
);

CREATE INDEX mentorship_sessions_pair_id_idx ON mentorship_sessions(pair_id);

CREATE TABLE cohort_groups (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name          TEXT        NOT NULL,
    description   TEXT        NOT NULL DEFAULT '',
    cohort_type   TEXT        NOT NULL DEFAULT 'general',  -- 'onboarding'|'skills'|'leadership'|'general'
    max_members   INT         NOT NULL DEFAULT 20,
    member_count  INT         NOT NULL DEFAULT 0,
    facilitator_id UUID       REFERENCES unified_profiles(id) ON DELETE SET NULL,
    starts_at     TIMESTAMPTZ,
    ends_at       TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE cohort_members (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    cohort_id  UUID        NOT NULL REFERENCES cohort_groups(id) ON DELETE CASCADE,
    user_id    UUID        NOT NULL REFERENCES unified_profiles(id) ON DELETE CASCADE,
    joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(cohort_id, user_id)
);

CREATE INDEX cohort_members_user_id_idx ON cohort_members(user_id);

-- ── Career Growth Layer ───────────────────────────────────────────────────────

CREATE TABLE career_profiles (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID        NOT NULL UNIQUE REFERENCES unified_profiles(id) ON DELETE CASCADE,
    current_tier      SMALLINT    NOT NULL DEFAULT 0,  -- mirrors identity_tier (0|1|2)
    target_role       TEXT,
    bio               TEXT        NOT NULL DEFAULT '',
    total_xp          INT         NOT NULL DEFAULT 0,
    milestone_count   INT         NOT NULL DEFAULT 0,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE career_milestones (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID        NOT NULL REFERENCES unified_profiles(id) ON DELETE CASCADE,
    milestone_key TEXT        NOT NULL,   -- e.g. 'first_deployment', 'tier_1_verified'
    label         TEXT        NOT NULL,
    xp_awarded    INT         NOT NULL DEFAULT 0,
    achieved_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, milestone_key)
);

CREATE INDEX career_milestones_user_id_idx ON career_milestones(user_id);

CREATE TABLE learning_paths (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID        NOT NULL REFERENCES unified_profiles(id) ON DELETE CASCADE,
    title         TEXT        NOT NULL,
    description   TEXT        NOT NULL DEFAULT '',
    skill_target  TEXT        NOT NULL,   -- the skill tag being developed
    steps         JSONB       NOT NULL DEFAULT '[]',
    progress_pct  SMALLINT    NOT NULL DEFAULT 0,  -- 0-100
    assigned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at  TIMESTAMPTZ
);

CREATE INDEX learning_paths_user_id_idx ON learning_paths(user_id);

CREATE TABLE skill_gaps (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID        NOT NULL REFERENCES unified_profiles(id) ON DELETE CASCADE,
    skill_tag       TEXT        NOT NULL,
    current_level   SMALLINT    NOT NULL DEFAULT 0,  -- 0-100 score
    required_level  SMALLINT    NOT NULL DEFAULT 50,
    gap_score       SMALLINT    NOT NULL DEFAULT 0,  -- required - current, clamped ≥ 0
    detected_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, skill_tag)
);

CREATE INDEX skill_gaps_user_id_idx ON skill_gaps(user_id);
CREATE INDEX skill_gaps_gap_score_idx ON skill_gaps(gap_score DESC);

-- ── Well-Being Features ───────────────────────────────────────────────────────

CREATE TABLE wellbeing_checkins (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID        NOT NULL REFERENCES unified_profiles(id) ON DELETE CASCADE,
    mood_score      SMALLINT    NOT NULL,  -- 1 (very bad) – 10 (excellent)
    energy_score    SMALLINT    NOT NULL,  -- 1 – 10
    stress_score    SMALLINT    NOT NULL,  -- 1 (none) – 10 (extreme)
    notes           TEXT,
    checked_in_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT valid_mood   CHECK (mood_score   BETWEEN 1 AND 10),
    CONSTRAINT valid_energy CHECK (energy_score BETWEEN 1 AND 10),
    CONSTRAINT valid_stress CHECK (stress_score BETWEEN 1 AND 10)
);

CREATE INDEX wellbeing_checkins_user_id_idx ON wellbeing_checkins(user_id);
CREATE INDEX wellbeing_checkins_checked_in_at_idx ON wellbeing_checkins(checked_in_at DESC);

-- Rolling 7-day burnout signal (updated by application logic)
CREATE TABLE burnout_signals (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID        NOT NULL UNIQUE REFERENCES unified_profiles(id) ON DELETE CASCADE,
    risk_level      TEXT        NOT NULL DEFAULT 'low',  -- 'low'|'medium'|'high'|'critical'
    risk_score      SMALLINT    NOT NULL DEFAULT 0,      -- 0-100 composite
    avg_stress_7d   DOUBLE PRECISION,
    avg_mood_7d     DOUBLE PRECISION,
    checkin_streak  INT         NOT NULL DEFAULT 0,      -- consecutive days with check-ins
    last_alert_at   TIMESTAMPTZ,
    computed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Carbon Offsets ────────────────────────────────────────────────────────────

CREATE TABLE carbon_offsets (
    id              UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID             NOT NULL REFERENCES unified_profiles(id) ON DELETE CASCADE,
    offset_kg       DOUBLE PRECISION NOT NULL,  -- CO₂e kilograms offset
    activity_type   TEXT             NOT NULL DEFAULT 'compute',  -- 'compute'|'travel'|'purchase'
    provider        TEXT,
    certificate_url TEXT,
    logged_at       TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

CREATE INDEX carbon_offsets_user_id_idx ON carbon_offsets(user_id);

-- Aggregate carbon footprint per user (app-maintained)
CREATE TABLE carbon_footprints (
    id               UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID             NOT NULL UNIQUE REFERENCES unified_profiles(id) ON DELETE CASCADE,
    total_kg_offset  DOUBLE PRECISION NOT NULL DEFAULT 0,
    total_kg_emitted DOUBLE PRECISION NOT NULL DEFAULT 0,
    net_kg           DOUBLE PRECISION GENERATED ALWAYS AS (total_kg_emitted - total_kg_offset) STORED,
    updated_at       TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

-- ── Full-text search helper view ──────────────────────────────────────────────
CREATE INDEX forum_threads_fts_idx ON forum_threads
    USING gin(to_tsvector('english', coalesce(title,'') || ' ' || coalesce(body,'')));
