# Data Processing Register (GDPR Article 30)

**Controller:** AiStaffApp Ltd
**DPO Contact:** dpo@aistaff.app
**Last Updated:** 2026-03-09

---

## Processing Activities

### 1. Identity Verification

| Field | Detail |
|---|---|
| **Purpose** | Verify user identity for marketplace access and escrow eligibility |
| **Legal Basis** | Contract (Art. 6(1)(b)) |
| **Data Categories** | Name, email, OAuth tokens (GitHub/LinkedIn), biometric ZKP commitment (no raw template) |
| **Retention** | Profile active lifetime + 7 years (financial records) |
| **Recipients** | identity_service only. OAuth providers receive redirect URI only. |
| **Transfers** | No transfers outside EEA without SCCs |
| **Table** | `unified_profiles` |

### 2. Marketplace Deployments

| Field | Detail |
|---|---|
| **Purpose** | Facilitate AI agent / robot / talent deployments and escrow |
| **Legal Basis** | Contract (Art. 6(1)(b)) |
| **Data Categories** | User IDs, deployment parameters, timestamps, payout amounts (cents) |
| **Retention** | 7 years (financial regulation) |
| **Recipients** | marketplace_service, payout_service, compliance_service |
| **Table** | `deployments`, `escrow_payouts` |

### 3. License Issuance

| Field | Detail |
|---|---|
| **Purpose** | Issue and track software/agent licenses |
| **Legal Basis** | Contract (Art. 6(1)(b)) |
| **Data Categories** | Licensee ID, license key, jurisdiction, transaction ID |
| **Retention** | License lifetime + 7 years |
| **Recipients** | license_service, notification_service |
| **Table** | `licenses` |

### 4. Telemetry & Drift Detection

| Field | Detail |
|---|---|
| **Purpose** | Monitor deployment health and detect artifact tampering |
| **Legal Basis** | Legitimate interest (Art. 6(1)(f)) — platform integrity |
| **Data Categories** | Deployment ID, artifact hashes, heartbeat timestamps |
| **Retention** | 90 days active. Archived (not deleted) after 90 days. |
| **Recipients** | telemetry_service, compliance_service |
| **Table** | `telemetry_heartbeats`, `drift_events` |

### 5. Notifications (Email)

| Field | Detail |
|---|---|
| **Purpose** | Transactional email for deployment events, license actions, alerts |
| **Legal Basis** | Contract (Art. 6(1)(b)) |
| **Data Categories** | Email address, event type, timestamp |
| **Retention** | 30 days in notifications table |
| **Recipients** | notification_service → SMTP provider |
| **Table** | `notifications` |

### 6. Reputation & Verifiable Credentials

| Field | Detail |
|---|---|
| **Purpose** | Issue W3C Verifiable Credentials for talent reputation portability |
| **Legal Basis** | Consent (Art. 6(1)(a)) — user-initiated export |
| **Data Categories** | Talent ID, trust score, DID, VC issuance timestamp |
| **Retention** | Until revocation request |
| **Recipients** | reputation_service. VC exported to user on request only. |
| **Table** | `reputation_vcs` |

### 7. MCP Tool Call Audit

| Field | Detail |
|---|---|
| **Purpose** | Security audit trail for AI agent tool calls |
| **Legal Basis** | Legitimate interest (Art. 6(1)(f)) — security and fraud prevention |
| **Data Categories** | Agent ID, tool name, input/output hashes (not raw content), timestamp |
| **Retention** | 2 years (security audit requirement) |
| **Recipients** | mcp_server, security team |
| **Table** | `tool_call_audit` (append-only) |

---

## Data Subject Rights Procedures

| Right | Procedure | SLA |
|---|---|---|
| Access (Art. 15) | Export all rows from all tables WHERE user_id = :id | 30 days |
| Erasure (Art. 17) | Pseudonymize PII fields. Financial records retained 7yr per regulation. | 30 days |
| Portability (Art. 20) | JSON export of profile + reputation VC | 30 days |
| Restriction (Art. 18) | Flag account, suspend processing | 72 hours |
| Objection (Art. 21) | Applies to legitimate-interest processing (telemetry, audit) | 30 days |

**Erasure note:** `escrow_payouts` and `tool_call_audit` are append-only audit tables.
Financial records cannot be hard-deleted. Pseudonymization replaces PII with `DELETED_<sha256_of_id>`.

---

## Sub-processors

| Processor | Purpose | Location | DPA |
|---|---|---|---|
| SMTP provider (mailhog in dev) | Email delivery | TBD | Required before prod |
| Kafka broker | Event streaming | Self-hosted / TBD | N/A (self-hosted) |
| PostgreSQL | Data storage | Self-hosted / TBD | N/A (self-hosted) |
