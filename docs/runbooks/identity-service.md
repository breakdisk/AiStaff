# Runbook: identity_service (Port 3001)

## Service Overview
Handles OAuth stitching (GitHub/LinkedIn), ZKP biometric verification, and trust scoring.
Emits `IdentityVerified` events to Kafka.

## Health Check
```bash
curl http://localhost:3001/health
# Expected: { "status": "ok" }
```

## Key Environment Variables
- `DATABASE_URL` — Postgres connection
- `KAFKA_BROKERS` — Kafka broker list
- `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` — RS256 keypair
- `ZKP_VERIFIER_KEY` — Groth16 verifier key
- `OAUTH_GITHUB_CLIENT_ID` / `OAUTH_GITHUB_CLIENT_SECRET`
- `OAUTH_LINKEDIN_CLIENT_ID` / `OAUTH_LINKEDIN_CLIENT_SECRET`

## Common Issues

### ZKP Verification Failing
```
Symptom: POST /auth/biometric returns 400 with "zkp: verification failed"
Check:   ZKP_VERIFIER_KEY matches the circuit's verification key
Fix:     Re-export verifier key from circuit build, update secret
```

### OAuth Redirect Loop
```
Symptom: GitHub/LinkedIn OAuth redirects loop
Check:   OAUTH_*_CLIENT_ID matches registered app callback URL
Fix:     Update OAuth app redirect_uri to match current deployment URL
```

### Trust Score Always 0
```
Symptom: GET /profiles/:id returns trust_score: 0.0
Check:   unified_profiles table has github_score/linkedin_score columns populated
Fix:     Re-trigger identity stitch via POST /auth/stitch
```

## Restart Procedure
```bash
docker compose restart identity-service
docker compose logs -f identity-service
# Verify: "identity_service listening on 0.0.0.0:3001"
```

## Database Tables
- `unified_profiles` — identity_tier, trust_score, biometric_commitment
- `refresh_tokens` — opaque tokens stored as SHA-256(token)
