# Secret Registry

> This file lists secret **names only**. Values are NEVER stored here.
> Secrets are injected via environment variables at runtime.
> Rotate schedule is noted per secret.

---

| Secret Name | Service(s) | Purpose | Rotation |
|---|---|---|---|
| `DATABASE_URL` | all services | Postgres connection string (includes credentials) | 30 days |
| `JWT_PRIVATE_KEY` | identity_service, API gateway | RS256 signing key (PEM, base64) | Quarterly |
| `JWT_PUBLIC_KEY` | all services | RS256 verification key (PEM, base64) | Quarterly (with private) |
| `ZKP_VERIFIER_KEY` | identity_service | Groth16 verifier key (base64) | On circuit change |
| `KAFKA_BROKERS` | all Kafka producers/consumers | Broker list (prod uses SASL_SSL) | On infra change |
| `KAFKA_SASL_USERNAME` | all Kafka services (prod) | SASL username | 90 days |
| `KAFKA_SASL_PASSWORD` | all Kafka services (prod) | SASL password | 90 days |
| `SMTP_HOST` | notification_service | SMTP server hostname | On change |
| `SMTP_PORT` | notification_service | SMTP port | On change |
| `SMTP_USER` | notification_service | SMTP auth username | 90 days |
| `SMTP_PASS` | notification_service | SMTP auth password | 90 days |
| `SMTP_FROM` | notification_service | From address | On change |
| `WASM_PLUGIN_DIR` | deployment_engine | Path to signed Wasm plugins | On infra change |
| `WASM_REGISTRY_MANIFEST_KEY` | deployment_engine | Public key for Wasm plugin signature verification | Quarterly |
| `PLATFORM_DID` | reputation_service | DID string for VC signing | On DID rotation |
| `MCP_FS_ROOT` | mcp_server | Filesystem root for MCP tool access | On infra change |
| `OAUTH_GITHUB_CLIENT_ID` | identity_service | GitHub OAuth app client ID | On app rotation |
| `OAUTH_GITHUB_CLIENT_SECRET` | identity_service | GitHub OAuth app client secret | 90 days |
| `OAUTH_LINKEDIN_CLIENT_ID` | identity_service | LinkedIn OAuth app client ID | On app rotation |
| `OAUTH_LINKEDIN_CLIENT_SECRET` | identity_service | LinkedIn OAuth app client secret | 90 days |

---

## Rotation Procedure

1. Generate new secret value (use `openssl rand -base64 48` for keys).
2. Update in secrets manager (Vault / environment config).
3. Rolling-restart affected services.
4. Verify service health after restart.
5. Update rotation date in this table.
6. Revoke old secret value.

## Audit

Run before every release:
```bash
git grep -r "-----BEGIN"      # Must return empty
git grep -rn "password\s*="   # Must return empty (except this file's comment)
git grep -rn "secret\s*="     # Must return empty
```
