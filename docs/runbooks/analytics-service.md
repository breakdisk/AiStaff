# Runbook: analytics_service (Port 3008)

## Service Overview
Produces ROI reports and the talent reputation leaderboard by querying read models across
`deployments`, `escrow_payouts`, and the `talent_roi` VIEW. All queries are read-only — this
service owns no write tables and emits no Kafka events. Results are cached in-process via `moka`
to reduce DB load on leaderboard endpoints.

## Health Check
```bash
curl http://localhost:3008/health
# Expected: { "status": "ok" }
```

## Key Environment Variables
- `DATABASE_URL` — Postgres connection (read access to: `deployments`, `escrow_payouts`, `talent_roi`)
- `JWT_PUBLIC_KEY` — RS256 public key for inbound JWT validation
- `RUST_LOG` — Tracing filter (e.g. `info,sqlx=warn`)
- `LEADERBOARD_CACHE_TTL_SECONDS` — moka cache TTL for leaderboard results (default: 60)
- `ROI_CACHE_TTL_SECONDS` — moka cache TTL for per-talent ROI report (default: 300)

## Common Issues

### Leaderboard Returns Empty or Stale Data
```
Symptom: GET /leaderboard returns [] or scores from hours ago
Check:   SELECT COUNT(*) FROM deployments WHERE deployment_status = 'COMPLETE';
         Confirm talent_roi VIEW has rows: SELECT COUNT(*) FROM talent_roi;
Fix:     If talent_roi is empty, telemetry_service may not be ingesting heartbeats.
         See telemetry-service runbook. If cache TTL is too long, lower
         LEADERBOARD_CACHE_TTL_SECONDS and restart.
```

### ROI Report Missing Deployments
```
Symptom: GET /analytics/roi/:talent_id omits known completed deployments
Check:   SELECT id, deployment_status FROM deployments WHERE talent_id = '<id>';
         SELECT * FROM escrow_payouts WHERE deployment_id IN (...);
Fix:     ROI report joins deployments → escrow_payouts → talent_roi. If escrow_payouts
         has no row for a completed deployment, payout_service did not write the record.
         Escalate to payout_service runbook. Do not backfill financial rows manually.
```

### High DB Query Latency on Leaderboard
```
Symptom: GET /leaderboard p99 > 2s; moka cache miss rate high
Check:   EXPLAIN ANALYZE on the leaderboard query against talent_roi VIEW.
         Check for missing indexes on deployments(talent_id) or escrow_payouts(deployment_id).
Fix:     Add indexes via a new sequential migration (never edit committed migrations).
         Consider materializing the talent_roi VIEW in telemetry_service if read volume grows.
         Short-term: increase LEADERBOARD_CACHE_TTL_SECONDS to reduce cache churn.
```

### Service Exits with "relation does not exist"
```
Symptom: Startup fails with sqlx error referencing deployments, escrow_payouts, or talent_roi
Check:   All migrations through 0012 must be applied: SELECT version FROM _sqlx_migrations ORDER BY version;
Fix:     Run: docker compose up -d postgres && sqlx migrate run
         Regenerate offline cache: cargo sqlx prepare --workspace
         Commit updated .sqlx/ directory before rebuilding the image.
```

## Restart Procedure
```bash
docker compose restart analytics-service
docker compose logs -f analytics-service
# Verify: "analytics_service listening on 0.0.0.0:3008"
```

## Database Tables (read-only)
- `deployments` — queried for deployment counts, durations, and status breakdowns
- `escrow_payouts` — queried for per-talent earnings (amount_talent column, BIGINT cents)
- `talent_roi` (VIEW in telemetry_service migration 0012) — primary source for ROI computation
  and leaderboard scoring; owned by telemetry_service, read by analytics_service
