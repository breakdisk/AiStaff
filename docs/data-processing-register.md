# Data Processing Register (GDPR Article 30)

**Controller:** AiStaffApp Ltd
**DPO Contact:** dpo@aistaff.app
**Last Updated:** 2026-03-24

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

### 8. Community & Growth Data

| Field | Detail |
|---|---|
| **Purpose** | Community hubs, mentorship pairing, career milestones, learning paths, carbon offset tracking |
| **Legal Basis** | Contract (Art. 6(1)(b)) for mentorship/career; Legitimate interest (Art. 6(1)(f)) for carbon tracking |
| **Data Categories** | User IDs, hub memberships, mentor skill tags, session timestamps, milestone labels, learning path progress (0–100%), carbon offset amounts (kg CO₂) |
| **Retention** | Active account lifetime. Pseudonymized on erasure request. |
| **Recipients** | community_service only. Kafka `community-events` topic (event IDs + user IDs only). |
| **Transfers** | No transfers outside EEA |
| **Tables** | `community_hubs`, `hub_members`, `hub_events`, `hub_rsvps`, `forum_threads`, `forum_posts`, `mentor_profiles`, `mentorship_pairs`, `mentorship_sessions`, `cohort_groups`, `cohort_members`, `career_milestones`, `skill_levels`, `learning_paths`, `carbon_offsets` |

### 9. Well-Being Check-ins — Article 9 Health-Adjacent Data

> ⚠️ **Special Category Data (GDPR Article 9):** Stress and mood scores are health-adjacent PII.
> Access is logged. Right-to-erasure **must** pseudonymize — **do not hard-delete**.

| Field | Detail |
|---|---|
| **Purpose** | Monitor talent well-being; surface burnout risk signals for early intervention |
| **Legal Basis** | **Explicit consent (Art. 9(2)(a))** — user initiates each check-in |
| **Data Categories** | User ID, stress score (0–10), mood score (0–10), check-in timestamp, computed burnout risk level + score |
| **Retention** | 90 days for burnout computation window. Pseudonymized on erasure request — never hard-deleted. |
| **Recipients** | community_service only. `BurnoutAlertRaised` Kafka event carries risk level + user ID (no raw scores). |
| **Access Controls** | DB-level: access logged. Service-level: community_service trusts upstream auth. No direct external access. |
| **Transfers** | No transfers outside EEA |
| **Tables** | `wellbeing_checkins`, `burnout_signals` |

### 10. Admin Financial Controls & Feature Flags

#### 10a. Admin Payout Actions

| Field | Detail |
|---|---|
| **Purpose** | Audit trail for admin escrow interventions (force_release, force_veto) |
| **Legal Basis** | Legitimate interest (Art. 6(1)(f)) — fraud prevention and financial integrity |
| **Data Categories** | Admin profile ID, deployment ID, action type, reason text, timestamp |
| **Retention** | 7 years (financial regulation) |
| **Recipients** | payout_service, admin team |
| **Table** | `admin_payout_actions` (append-only — no DELETE/UPDATE grants) |

#### 10b. Platform Fees

| Field | Detail |
|---|---|
| **Purpose** | Platform revenue ledger — records the 15% commission retained on each escrow settlement |
| **Legal Basis** | Contract (Art. 6(1)(b)) |
| **Data Categories** | Deployment ID, fee amount in cents, fee percentage, settlement timestamp |
| **Retention** | 7 years (financial regulation) |
| **Recipients** | payout_service, analytics_service |
| **Table** | `platform_fees` (append-only — no DELETE/UPDATE grants) |

#### 10c. Announcements

| Field | Detail |
|---|---|
| **Purpose** | System-wide operator notices displayed to users (maintenance windows, policy changes, new features) |
| **Legal Basis** | Legitimate interest (Art. 6(1)(f)) — platform operation and user communication |
| **Data Categories** | Title, body text, severity level, start timestamp, expiry timestamp, created_by (admin profile ID) |
| **Retention** | Until deleted by admin. No automatic expiry of the row — `expires_at` controls display only. |
| **Recipients** | apps/web (read-only display), admin team |
| **Table** | `announcements` |

#### 10d. Feature Flags

| Field | Detail |
|---|---|
| **Purpose** | Runtime feature toggles for platform behaviour (e.g. biometric enforcement, experimental features) |
| **Legal Basis** | Legitimate interest (Art. 6(1)(f)) — platform integrity and operational configuration |
| **Data Categories** | Flag name, enabled state (boolean), description, last updated timestamp, updated_by (admin profile ID) |
| **Retention** | Indefinite (operational configuration). Rows are updated in place; no historical log of prior values beyond `updated_at`. |
| **Recipients** | All services that read feature flags (currently payout_service), admin team via admin UI |
| **Table** | `feature_flags` |

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

**Article 9 erasure note:** `wellbeing_checkins` and `burnout_signals` must be pseudonymized on
right-to-erasure requests — **do not hard-delete** (audit continuity). Raw stress/mood scores are
replaced with `NULL`; user_id is replaced with `DELETED_<sha256_of_id>`.

---

## Sub-processors

| Processor | Purpose | Location | DPA |
|---|---|---|---|
| SMTP provider (mailhog in dev) | Email delivery | TBD | Required before prod |
| Kafka broker | Event streaming | Self-hosted / TBD | N/A (self-hosted) |
| PostgreSQL | Data storage | Self-hosted / TBD | N/A (self-hosted) |
