CREATE TABLE telemetry_heartbeats (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deployment_id UUID NOT NULL REFERENCES deployments(id),
    artifact_hash TEXT NOT NULL,
    cpu_pct       REAL NOT NULL,
    mem_bytes     BIGINT NOT NULL,
    recorded_at   TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_telemetry_deployment ON telemetry_heartbeats (deployment_id, recorded_at DESC);

CREATE TABLE drift_events (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deployment_id UUID NOT NULL REFERENCES deployments(id),
    expected_hash TEXT NOT NULL,
    actual_hash   TEXT NOT NULL,
    detected_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE VIEW talent_roi AS
SELECT
    d.freelancer_id                                              AS talent_id,
    COUNT(*)                                                     AS total_deployments,
    COALESCE(SUM(ep.amount_cents), 0)                           AS total_earned_cents,
    COALESCE(AVG(CASE WHEN cs.all_passed THEN 1.0 ELSE 0.0 END), 0) AS avg_checklist_pass_pct,
    COUNT(de.id)                                                 AS drift_incidents
FROM deployments d
LEFT JOIN escrow_payouts ep        ON ep.deployment_id = d.id AND ep.recipient_id = d.freelancer_id
LEFT JOIN dod_checklist_summaries cs ON cs.deployment_id = d.id
LEFT JOIN drift_events de          ON de.deployment_id = d.id
GROUP BY d.freelancer_id;
