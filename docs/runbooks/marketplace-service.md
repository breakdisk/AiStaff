# Runbook: marketplace_service (Port 3002)

## Service Overview
Manages agent and talent listings, handles deployment creation via `POST /deployments`,
and initiates escrow setup. Emits `DeploymentStarted` events to Kafka.
Enforces identity tier ≥ 1 on both parties before a deployment can proceed.

## Health Check
```bash
curl http://localhost:3002/health
# Expected: { "status": "ok" }
```

## Key Environment Variables
- `DATABASE_URL` — Postgres connection
- `KAFKA_BROKERS` — Kafka broker list
- `JWT_PUBLIC_KEY` — RS256 public key for verifying inbound JWTs
- `RUST_LOG` — Tracing filter (e.g. `info,sqlx=warn`)

## Common Issues

### Deployment Creation Returns 403
```
Symptom: POST /deployments returns 403 "identity tier insufficient"
Check:   SELECT identity_tier FROM unified_profiles WHERE id = '<user_id>'
Fix:     User must complete identity verification in identity_service (Tier ≥ 1 required)
```

### Listing Not Appearing After Creation
```
Symptom: POST /listings succeeds (201) but GET /listings does not return the row
Check:   Check RUST_LOG output for sqlx errors on insert; verify deployments table FK constraints
Fix:     Confirm agent_listings insert committed; check for rolled-back transaction on Kafka emit failure
```

### DeploymentStarted Event Not Consumed Downstream
```
Symptom: environment_orchestrator or checklist_service shows no activity after POST /deployments
Check:   docker compose logs -f marketplace-service | grep "emit"
         kafka-console-consumer --topic deployments --from-beginning
Fix:     Verify KAFKA_BROKERS is reachable; check rdkafka producer error logs for broker connection refusal
```

### Escrow Row Missing After Deployment
```
Symptom: escrow_payouts has no row for a deployment_id that exists in deployments
Check:   SELECT status FROM deployments WHERE id = '<deployment_id>'
Fix:     Escrow row is created on ChecklistFinalized event (checklist_service responsibility).
         If deployment status is stuck at VETO_WINDOW, check payout_service veto timer.
```

## Restart Procedure
```bash
docker compose restart marketplace-service
docker compose logs -f marketplace-service
# Verify: "marketplace_service listening on 0.0.0.0:3002"
```

## Database Tables
- `agent_listings` — listing metadata, required skills, pricing, status
- `deployments` — deployment_status enum, buyer/seller IDs, transaction_id (UUID v7)
- `escrow_payouts` — append-only; amounts in BIGINT cents, released_at
- `platform_fees` — fee schedule per deployment
- `admin_payout_actions` — audit trail for admin-initiated payout overrides
