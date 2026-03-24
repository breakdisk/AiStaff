# Runbook: reputation_service (Port 3009)

## Service Overview
Issues and exports W3C Verifiable Credentials (VCs) for talent reputation. Each talent has at
most one VC (`UNIQUE(talent_id)` in `reputation_vcs`). VCs are JSON-LD documents signed with
the platform DID key. Consumes `LeaderboardUpdated` events from Kafka to trigger VC re-issuance.
Emits `ReputationVCIssued` events on successful issuance.

## Health Check
```bash
curl http://localhost:3009/health
# Expected: { "status": "ok" }
```

## Key Environment Variables
- `DATABASE_URL` — Postgres connection
- `KAFKA_BROKERS` — Kafka broker list
- `JWT_PUBLIC_KEY` — RS256 public key for inbound JWT validation
- `RUST_LOG` — Tracing filter (e.g. `info,sqlx=warn`)
- `PLATFORM_DID` — DID string used as the VC issuer (e.g. `did:web:aistaff.app`)
- `VC_SIGNING_KEY` — Private key (base64-encoded) corresponding to PLATFORM_DID for VC signature
- `VC_CONTEXT_URL` — JSON-LD context URL for the reputation VC schema

## Common Issues

### VC Issuance Returns 409 Conflict
```
Symptom: POST /reputation/vcs returns HTTP 409 for a talent that already has a VC
Check:   SELECT id, issued_at FROM reputation_vcs WHERE talent_id = '<id>';
Fix:     This is expected behavior — UNIQUE(talent_id) enforces one VC per talent.
         To re-issue (e.g. after a score update), use PUT /reputation/vcs/:talent_id
         which performs an upsert. Do not INSERT directly — always use the service API.
```

### VC Signature Verification Fails on Export
```
Symptom: External verifier rejects the VC signature; W3C VC verifier returns invalid proof
Check:   Confirm PLATFORM_DID matches the DID document served at the .well-known/did.json endpoint.
         Confirm VC_SIGNING_KEY is the correct private key for the DID's verification method.
Fix:     Rotate VC_SIGNING_KEY and update the DID document's publicKeyJwk field atomically.
         Re-issue all existing VCs: POST /admin/reputation/vcs/reissue-all (requires admin JWT).
         Update PLATFORM_DID and VC_SIGNING_KEY secrets and restart the service.
```

### LeaderboardUpdated Events Not Triggering Re-issuance
```
Symptom: reputation_vcs rows have stale scores after leaderboard updates
Check:   docker compose logs -f reputation-service | grep "LeaderboardUpdated"
         Check consumer lag: kafka-consumer-groups.sh --describe --group reputation-service-leaderboard-group
Fix:     If consumer lag is growing, restart the service. Confirm KAFKA_BROKERS is reachable.
         If the event topic name has changed, update the consumer group config and redeploy.
```

### JSON-LD Context URL Unreachable
```
Symptom: VC export fails with "failed to fetch JSON-LD context"
Check:   curl -I $VC_CONTEXT_URL from within the container network.
Fix:     If the context URL is external and unreachable, cache the context document locally and
         serve it from apps/web/public/. Update VC_CONTEXT_URL to the local URL.
         Never hardcode the context inline — it must remain a dereferenceable URL per W3C spec.
```

## Restart Procedure
```bash
docker compose restart reputation-service
docker compose logs -f reputation-service
# Verify: "reputation_service listening on 0.0.0.0:3009"
```

## Database Tables
- `reputation_vcs` — `id` (UUID v7), `talent_id` (UNIQUE), `vc_json` (JSONB, full W3C VC),
  `issued_at`, `updated_at`; enforces one active VC per talent via the UNIQUE constraint on talent_id
