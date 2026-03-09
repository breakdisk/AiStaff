# Incident Response Playbook

## Severity Classification

| Severity | SLA | Examples | On-Call Trigger |
|---|---|---|---|
| **P0** | 15 min | Escrow double-spend · Auth bypass · Data leak · ZKP skipped | Page immediately |
| **P1** | 1 hour | Veto window bypassed · Wasm sandbox escape · Service auth failure | Page immediately |
| **P2** | 4 hours | Service down · Kafka lag > 10k · DB connection pool exhausted | Slack alert |
| **P3** | 24 hours | UI regression · Non-critical audit gap · Flaky test | Ticket only |

---

## P0 Response Steps

1. **Acknowledge** — On-call engineer acknowledges within 5 min.
2. **Isolate** — Disable affected endpoint at API gateway. Do NOT delete logs.
3. **Assess** — Is user data exposed? Are funds at risk?
4. **Escalate** — Notify CTO + Legal within 15 min if PII or financial exposure.
5. **Mitigate** — Roll back deployment or toggle feature flag.
6. **Preserve evidence** — Snapshot append-only audit tables before any remediation.
7. **Communicate** — Status page update within 30 min.
8. **Post-mortem** — Blameless post-mortem within 48 hours. Document in `docs/postmortems/`.

---

## Escrow Double-Spend (P0 Runbook)

```
1. Immediately disable POST /deployments at gateway.
2. Query: SELECT * FROM escrow_payouts WHERE transaction_id = '<id>' ORDER BY released_at;
3. If duplicates exist → freeze both payout records.
4. Notify affected parties.
5. Root cause: missing UNIQUE constraint or idempotency bypass.
6. Fix: restore UNIQUE(transaction_id) constraint. Deploy hotfix.
7. Post-mortem within 24h.
```

---

## Auth Bypass (P0 Runbook)

```
1. Rotate JWT signing key immediately (RS256 private key).
2. Invalidate ALL active refresh tokens: UPDATE refresh_tokens SET revoked = true;
3. Force re-login for all active sessions.
4. Review identity_service logs for anomalous token issuance.
5. Patch and redeploy identity_service.
```

---

## Data Leak (P0 Runbook)

```
1. Identify the data category: PII? Biometric commitments? Financial?
2. Isolate the leaking service.
3. Notify DPO within 72 hours (GDPR Article 33).
4. Document: what data, how many records, time window, root cause.
5. Notify affected users if high risk (GDPR Article 34).
```

---

## Kafka Consumer Lag > 10k (P2 Runbook)

```
1. Check: kafka-consumer-groups.sh --describe --group <group>
2. If single partition lagging → restart consumer pod.
3. If all partitions → check DB connection pool (sqlx pool exhausted?).
4. If persistent → scale consumer replicas.
5. Alert clears automatically when lag < 1000.
```

---

## Contacts

| Role | Contact |
|---|---|
| On-call engineer | Rotate weekly — see PagerDuty schedule |
| CTO | [redacted] |
| DPO (Data Protection Officer) | dpo@aistaff.app |
| Legal | legal@aistaff.app |
| Security | security@aistaff.app |
