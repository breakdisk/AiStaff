# Runbook: telemetry_service (Port 3007)

## Service Overview
Ingests heartbeat pings from deployed agents and detects artifact drift (model hash changes,
unexpected binary mutations). Emits `DriftDetected` events to Kafka when drift is confirmed.
Populates the `talent_roi` VIEW consumed by analytics_service. Telemetry events older than
90 days are archived, not deleted.

## Health Check
```bash
curl http://localhost:3007/health
# Expected: { "status": "ok" }
```

## Key Environment Variables
- `DATABASE_URL` — Postgres connection
- `KAFKA_BROKERS` — Kafka broker list
- `JWT_PUBLIC_KEY` — RS256 public key for inbound JWT validation
- `RUST_LOG` — Tracing filter (e.g. `info,sqlx=warn`)
- `DRIFT_THRESHOLD_BYTES` — Maximum allowable artifact size delta before drift is flagged
- `HEARTBEAT_STALE_SECONDS` — Seconds without a heartbeat before an agent is marked degraded (default: 120)
- `ARCHIVE_RETENTION_DAYS` — Days before telemetry rows are moved to archive (default: 90)

## Common Issues

### Agents Showing as Degraded Immediately After Deploy
```
Symptom: Agent health shows DEGRADED within seconds of deployment start
Check:   SELECT last_heartbeat_at FROM telemetry_heartbeats WHERE deployment_id = '<id>';
         Confirm HEARTBEAT_STALE_SECONDS is not set too low for the agent's ping interval.
Fix:     Increase HEARTBEAT_STALE_SECONDS or lower the agent's heartbeat interval.
         Ensure the deployed Wasm module is calling the heartbeat host function on schedule.
```

### DriftDetected Emitted for Legitimate Redeploy
```
Symptom: Kafka receives DriftDetected after an intentional agent update
Check:   SELECT artifact_hash FROM telemetry_heartbeats WHERE deployment_id = '<id>' ORDER BY received_at DESC LIMIT 2;
         Compare the two hashes — they will differ on a legitimate redeploy.
Fix:     Before redeploying, call POST /telemetry/deployments/:id/acknowledge-redeploy to
         reset the baseline artifact hash. Without this, every redeploy triggers a false drift alert.
```

### Heartbeat Ingest Latency Spike
```
Symptom: POST /telemetry/heartbeat p99 latency > 500ms; agents missing heartbeats
Check:   docker compose logs -f telemetry-service | grep "slow query\|pool timeout"
         SELECT COUNT(*) FROM telemetry_heartbeats WHERE received_at > NOW() - INTERVAL '1 minute';
Fix:     High ingest volume may be saturating the connection pool (max 20). Scale horizontally
         or increase the pool size if latency is query-bound. Add index on (deployment_id, received_at)
         if not present. Check Postgres EXPLAIN ANALYZE on the INSERT path.
```

### talent_roi VIEW Returns Stale Data
```
Symptom: analytics_service ROI reports do not reflect recent deployments
Check:   SELECT * FROM talent_roi WHERE talent_id = '<id>';
         Verify telemetry_heartbeats and drift_events have recent rows for the deployment.
Fix:     The VIEW is computed from live tables — no materialization. Stale results indicate
         either missing heartbeat rows or a JOIN condition mismatch. Check migration 0012 for
         the VIEW definition and confirm escrow_payouts has a matching deployment_id.
```

## Restart Procedure
```bash
docker compose restart telemetry-service
docker compose logs -f telemetry-service
# Verify: "telemetry_service listening on 0.0.0.0:3007"
```

## Database Tables
- `telemetry_heartbeats` — `id` (UUID v7), `deployment_id`, `artifact_hash` (Blake3 hex),
  `payload` (JSONB), `received_at`
- `drift_events` — `id` (UUID v7), `deployment_id`, `expected_hash`, `actual_hash`,
  `detected_at`, `acknowledged_at`
- `talent_roi` (VIEW) — aggregates `telemetry_heartbeats`, `drift_events`, `escrow_payouts`
  to compute per-talent ROI metrics; consumed read-only by analytics_service
