# Runbook: license_service (Port 3004)

## Service Overview
Issues software licenses tied to deployments, enforces jurisdiction lock (ISO 3166-1 alpha-2),
and guarantees idempotent issuance via `transaction_id UNIQUE` in the `licenses` table.
A duplicate `transaction_id` returns the existing license record (409 or 200 with original),
never creates a second row. Emits `LicenseIssued` events to Kafka.

## Health Check
```bash
curl http://localhost:3004/health
# Expected: { "status": "ok" }
```

## Key Environment Variables
- `DATABASE_URL` — Postgres connection
- `KAFKA_BROKERS` — Kafka broker list
- `JWT_PUBLIC_KEY` — RS256 key for verifying inbound JWTs
- `RUST_LOG` — Tracing filter (e.g. `info,sqlx=warn`)

## Common Issues

### Duplicate License Issued for Same Transaction
```
Symptom: Two rows in licenses table share the same deployment_id
Check:   SELECT transaction_id, COUNT(*) FROM licenses GROUP BY transaction_id HAVING COUNT(*) > 1
Fix:     This violates the UNIQUE constraint — should be impossible at DB level.
         If found, treat as P0 data integrity incident; audit the insert path for missing
         ON CONFLICT DO NOTHING / RETURNING logic in the sqlx query.
```

### License Rejected Due to Jurisdiction Mismatch
```
Symptom: POST /licenses returns 422 "jurisdiction invalid" or "license locked to <country>"
Check:   Confirm the requesting user's profile jurisdiction matches the license's issued_jurisdiction CHAR(2)
Fix:     Licenses cannot be transferred across jurisdictions by design.
         User must obtain a new license scoped to their jurisdiction.
```

### LicenseIssued Event Not Emitted
```
Symptom: License row exists in DB but downstream services (compliance_service) show no activity
Check:   docker compose logs -f license-service | grep "LicenseIssued"
         kafka-console-consumer --topic licenses --from-beginning
Fix:     Check KAFKA_BROKERS connectivity; confirm topic "licenses" exists.
         If DB write succeeded but Kafka emit failed, the outbox pattern requires a retry —
         check for a pending outbox table or re-trigger via admin endpoint.
```

### License Expiry Not Enforced
```
Symptom: Expired license accepted by downstream validation
Check:   SELECT id, expires_at FROM licenses WHERE expires_at < NOW() AND status = 'ACTIVE'
Fix:     Confirm license_service runs a periodic expiry job or that callers check expires_at.
         Update stale rows: UPDATE licenses SET status = 'EXPIRED' WHERE expires_at < NOW().
```

### Transaction ID Missing from Request
```
Symptom: POST /licenses returns 400 "transaction_id required"
Check:   Client is not sending a UUID v7 transaction_id in the request body
Fix:     All license issuance requests must carry a client-generated UUID v7 transaction_id.
         Generate with Uuid::now_v7() (Rust) or equivalent before calling the endpoint.
```

## Restart Procedure
```bash
docker compose restart license-service
docker compose logs -f license-service
# Verify: "license_service listening on 0.0.0.0:3004"
```

## Database Tables
- `licenses` — transaction_id UNIQUE, jurisdiction CHAR(2), expires_at, status, deployment_id
