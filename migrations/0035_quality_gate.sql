-- Quality Gate: AI-powered deliverable scanning before client review
-- CRITICAL/HIGH issues set blocks_release=true and hold escrow

CREATE TABLE quality_gate_scans (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    deployment_id    UUID        REFERENCES deployments(id),
    uploaded_by      UUID        NOT NULL REFERENCES unified_profiles(id),
    file_name        TEXT        NOT NULL,
    file_size_bytes  BIGINT      NOT NULL,
    scan_type        TEXT        NOT NULL
                                 CHECK (scan_type IN ('code', 'security', 'plagiarism', 'text')),
    milestone        TEXT        NOT NULL DEFAULT '',
    status           TEXT        NOT NULL DEFAULT 'pending'
                                 CHECK (status IN ('pending', 'scanning', 'passed', 'flagged', 'skipped')),
    score            SMALLINT    CHECK (score IS NULL OR (score >= 0 AND score <= 100)),
    blocks_release   BOOLEAN     NOT NULL DEFAULT FALSE,
    scanned_at       TIMESTAMPTZ,
    duration_ms      INTEGER,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_quality_gate_scans_deployment
    ON quality_gate_scans (deployment_id, created_at DESC);
CREATE INDEX idx_quality_gate_scans_uploader
    ON quality_gate_scans (uploaded_by, created_at DESC);

CREATE TABLE quality_gate_issues (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scan_id    UUID NOT NULL REFERENCES quality_gate_scans(id) ON DELETE CASCADE,
    severity   TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
    category   TEXT NOT NULL,
    message    TEXT NOT NULL,
    location   TEXT NOT NULL DEFAULT '',
    suggestion TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_quality_gate_issues_scan ON quality_gate_issues (scan_id);
