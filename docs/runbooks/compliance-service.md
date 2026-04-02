# Runbook: compliance_service (Port 3006)

## Service Overview
Manages NDA/SOW contract lifecycle and warranty claims. Stores SHA-256 hashes of uploaded
documents — never raw file content. Emits `ContractSigned` and `WarrantyClaimFiled` events to
Kafka. Consumes `DeploymentComplete` to auto-generate SOW records.

## Health Check
```bash
curl http://localhost:3006/health
# Expected: { "status": "ok" }
```

## Key Environment Variables
- `DATABASE_URL` — Postgres connection
- `KAFKA_BROKERS` — Kafka broker list
- `JWT_PUBLIC_KEY` — RS256 public key for inbound JWT validation
- `RUST_LOG` — Tracing filter (e.g. `info,sqlx=warn`)
- `CONTRACT_STORAGE_PATH` — Filesystem path for temporary upload staging (never persisted long-term)
- `MAX_UPLOAD_BYTES` — Maximum contract document size in bytes (recommended: 10485760 = 10 MB)

## Common Issues

### Document Hash Mismatch on Verification
```
Symptom: GET /contracts/:id/verify returns { "verified": false }
Check:   SELECT doc_hash FROM contracts WHERE id = '<id>';
         Recompute SHA-256 of the original file and compare.
Fix:     If hash differs, the stored document was mutated after signing — treat as P0 integrity
         violation. Preserve the DB record, quarantine the file, and open an incident.
         Never overwrite the doc_hash column.
```

### Warranty Claim Stuck in OPEN
```
Symptom: warranty_claims row has resolution = NULL beyond the 7-day fix window
Check:   SELECT created_at, resolved_at, resolution FROM warranty_claims WHERE id = '<id>';
         Confirm payout_service has received WarrantyClaimFiled event.
Fix:     Check Kafka topic for WarrantyClaimFiled delivery. If event was never emitted,
         re-publish manually via admin endpoint POST /admin/warranty-claims/:id/republish.
         Escalate to P2 if the 7-day window has elapsed without payout_service action.
```

### Contract Upload Returns 413
```
Symptom: POST /contracts returns HTTP 413 Payload Too Large
Check:   Client is sending a file larger than MAX_UPLOAD_BYTES.
Fix:     Increase MAX_UPLOAD_BYTES env var and restart, or instruct client to compress/split
         the document. Default limit is 10 MB; do not exceed 50 MB without security review.
```

### ContractSigned Event Not Emitted
```
Symptom: Downstream services (payout_service, checklist_service) unaware of signed contract
Check:   docker compose logs -f compliance-service | grep "ContractSigned"
         SELECT contract_status FROM contracts WHERE id = '<id>';
Fix:     If status = 'SIGNED' but no Kafka event: check KAFKA_BROKERS connectivity.
         Use kafka-console-consumer to inspect the contracts topic for the event_id.
         Republish via POST /admin/contracts/:id/republish-event if confirmed missing.
```

## Restart Procedure
```bash
docker compose restart compliance-service
docker compose logs -f compliance-service
# Verify: "compliance_service listening on 0.0.0.0:3006"
```

## Database Tables
- `contracts` — `id`, `deployment_id`, `contract_status` (enum), `doc_hash` (SHA-256 hex),
  `signed_at`, `parties[]` (UUID array of signatories)
- `warranty_claims` — `id`, `deployment_id`, `claimant_id`, `drift_proof` (JSONB),
  `resolution` (REMEDIATED/REFUNDED/REJECTED), `resolved_at`
