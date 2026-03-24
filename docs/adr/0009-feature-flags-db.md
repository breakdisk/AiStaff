# ADR 0009 — Feature Flags via DB (Replace SKIP_BIOMETRIC Env Var)

**Date:** 2026-03-24
**Status:** Accepted
**Affects:** `payout_service`, `apps/web` (admin feature-flags API + page)

---

## Context

`payout_service` contained a `SKIP_BIOMETRIC` environment variable that conditionally bypassed
the biometric identity tier check during veto window evaluation. Two problems existed:

1. **Fail-open by default.** If `SKIP_BIOMETRIC` was not set, the check evaluated to `true`
   (skipped). This meant a misconfigured or freshly deployed service would silently skip
   biometric verification — the least secure default possible.

2. **Requires full redeploy to change.** Toggling the flag in any environment meant updating
   the container environment, restarting the service, and waiting for health checks. No operator
   could change the flag at runtime without a deployment pipeline run.

These two properties combined to produce a high-risk configuration surface: a flag that was
both dangerous to leave wrong and expensive to correct quickly.

The architecture mandate in `CLAUDE.md` already specifies: "Feature Flags via DB: Runtime
toggles stored in `feature_flags` table. No compile-time feature gating for business logic."
`SKIP_BIOMETRIC` violated this mandate from the start.

---

## Decision

### 1. New `feature_flags` table (migration 0052)

```sql
feature_flags (
  name         TEXT PRIMARY KEY,
  enabled      BOOLEAN NOT NULL DEFAULT false,
  description  TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by   UUID REFERENCES unified_profiles(id)
)
```

The `DEFAULT false` on `enabled` enforces fail-closed semantics for all flags. An absent row
and a row with `enabled = false` are equivalent: the feature is off.

Migration 0052 seeds the initial row:

```sql
INSERT INTO feature_flags (name, enabled, description)
VALUES ('skip_biometric', false, 'Bypass biometric tier check in veto window evaluation. Only for pre-launch testing.')
ON CONFLICT (name) DO NOTHING;
```

### 2. `payout_service` reads flag on each evaluation

On each veto window evaluation, `payout_service` executes:

```sql
SELECT enabled FROM feature_flags WHERE name = 'skip_biometric'
```

If the row is absent or `enabled = false`, biometric verification is required (fail-closed).
If `enabled = true`, the check is skipped — this path should only be active in pre-launch
testing environments.

The query is cheap (primary key lookup). No caching layer is introduced for this flag; a
stale cache on a security-critical flag would reintroduce the deployment-dependency problem.

### 3. Admin UI at `/admin/feature-flags`

`apps/web` gains a protected admin route that lists all rows in `feature_flags` and allows
toggling `enabled` via a `PATCH /api/admin/feature-flags/:name` endpoint. The endpoint
sets `updated_at = NOW()` and `updated_by = <admin profile id>` on every write, providing
an audit trail for every toggle.

The route is protected by admin identity tier check (Tier ≥ 2 or explicit admin role,
per the admin controls spec).

### 4. Deployment order for production migration

If the production environment currently has `SKIP_BIOMETRIC=true`, the following sequence
MUST be followed to avoid breaking active deployments mid-flight:

1. Run migration 0052 (creates table, seeds `skip_biometric = false`).
2. Via admin UI or direct SQL, set `skip_biometric = true` in the DB.
3. Deploy new `payout_service` (now reads from DB, ignores env var).
4. Verify behaviour in staging. Then set `skip_biometric = false` in DB when ready to enforce.
5. Remove `SKIP_BIOMETRIC` from all environment configs.

Reversing steps 2 and 3 would cause `payout_service` to read from DB (which defaults to
`false`) before the operator has had a chance to review the setting — potentially blocking
all in-flight veto windows. The order above prevents that.

---

## Consequences

**Positive**
- Fail-closed by default: a missing row means the check runs. Safer than the previous
  fail-open env var.
- Runtime toggle without redeployment. An operator can flip `skip_biometric` from the
  admin UI in under 10 seconds.
- `updated_at` / `updated_by` on every write provides a lightweight audit trail for flag
  changes without a separate event log.
- Schema is generic: any future boolean runtime toggle uses the same table. No new
  migration needed per flag — just an `INSERT`.

**Negative / Trade-offs**
- `payout_service` now has a DB read on every veto window evaluation that previously
  required no DB call for the flag. The impact is negligible (single primary-key lookup)
  but is a new dependency path.
- The deployment order for prod migration is non-trivial and must be followed precisely.
  Documented above and in the payout_service runbook.
- `SKIP_BIOMETRIC` env var must be explicitly removed from all environment configs after
  migration; stale env vars are inert but create confusion.

---

## Alternatives Rejected

| Alternative | Reason rejected |
|---|---|
| Keep env var, fix fail-open default | Fixes the safety default but does not enable runtime toggling. Still requires a full redeploy to change the flag. Does not satisfy the architecture mandate. |
| Redis-backed feature flag store | Added infrastructure dependency for a single boolean flag. Overkill. Redis is not in the current service dependency graph. |
| LaunchDarkly or similar SaaS flag service | External dependency, cost, and data egress for an internal operational config value. Inconsistent with the offline-first and self-hosted principles. |
| Config file on disk (hot-reloaded) | Requires filesystem access from service container, adds file-watching complexity, no audit trail, not suitable for multi-instance deployments. |
