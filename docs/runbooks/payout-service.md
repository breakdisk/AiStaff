# Runbook: payout_service (Port 3010)

## Service Overview
Implements the Veto-First 30-second escrow release window and 70/30 split.
Consumes `DeploymentComplete` from Kafka. Emits `EscrowRelease`.

## Health Check
```bash
curl http://localhost:3010/health
# Expected: { "status": "ok" }
```

## Key Environment Variables
- `DATABASE_URL` — Postgres connection
- `KAFKA_BROKERS` — Kafka broker list
- `JWT_PUBLIC_KEY` — RS256 verification key

## Veto Window Logic
```
DeploymentComplete consumed
  → deployment status = VETO_WINDOW
  → 30-second server-side timer
  → POST /payouts/:id/veto (within window) → status = VETOED
  → POST /payouts/:id/approve (after window) → split_70_30 → EscrowRelease
```

## Common Issues

### Veto Window Not Expiring
```
Symptom: Deployment stuck in VETO_WINDOW status
Check:   payout_service Kafka consumer lag (DeploymentComplete topic)
Check:   Server clock drift — veto timer uses server clock
Fix:     Restart payout-service. Timer restarts from current DB timestamp.
```

### Double Payout
```
Symptom: escrow_payouts has two rows for same deployment_id
This is a P0 incident — follow incident-response.md immediately.
Root cause check: UNIQUE(transaction_id) constraint on escrow_payouts.
```

### 70/30 Split Incorrect
```
Symptom: Payout amounts don't sum to total_cents
Check:   split_70_30() in veto_payout.rs — uses u64 truncating division
Expected: dev_cents = (total * 70) / 100, talent_cents = total - dev_cents
```

## Database Tables
- `escrow_payouts` — append-only, UNIQUE(transaction_id)
- `deployments` — status updated to VETOED or COMPLETED

## Restart Procedure
```bash
docker compose restart payout-service
docker compose logs -f payout-service
# Verify: "payout_service listening on 0.0.0.0:3010"
```
