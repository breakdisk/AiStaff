# Admin Controls Design
**Date:** 2026-03-24
**Status:** Approved (v2 — post spec-review)
**Scope:** `apps/web/app/admin/`, `apps/web/app/api/admin/`, `crates/compliance_service/`, `crates/marketplace_service/`, `crates/payout_service/`, `migrations/`

---

## Problem

The admin panel has 7 existing pages (deployments, users, listings, revenue, enterprise, skill-suggestions, main dashboard) but is missing 6 operational controls that a platform operator needs to run the marketplace safely:

1. No way to manually intervene on stuck escrow payouts
2. No UI to resolve warranty disputes
3. No audit log visibility (tool_call_audit, escrow_payouts, identity_audit_log are write-only from admin perspective)
4. Feature flags are env-var-only — no runtime toggle
5. No contract visibility or revocation
6. No system-wide announcement mechanism

---

## Architecture Overview

All 6 gaps follow the existing admin pattern:
- Frontend: `apps/web/app/admin/<section>/page.tsx`
- API proxy: `apps/web/app/api/admin/<section>/route.ts`
- Admin guard: use `assertAdmin(profileId)` from `apps/web/lib/admin.ts` — this is the de-facto pattern used by all existing admin routes (skill-suggestions, users, listings, etc.) and does a live DB check against `is_admin` on `unified_profiles`. Do NOT use `requireAdmin()` from `_auth.ts` — it exists but is unused.
- DB access: direct `pg.Pool` queries for read-heavy admin routes (same pattern as `skill-suggestions`); proxy to Rust services for mutations that affect financial state

New Rust handlers are added only where financial correctness requires it (payout force-release, contract revoke). All other mutations go through direct DB writes from Next.js admin routes.

### Service URL Constants
Add to `apps/web/app/api/admin/_auth.ts` (alongside existing `MARKETPLACE_URL` and `IDENTITY_URL`):
```ts
export const PAYOUT_URL      = process.env.PAYOUT_SERVICE_URL      ?? "http://localhost:3010";
export const COMPLIANCE_URL  = process.env.COMPLIANCE_SERVICE_URL  ?? "http://localhost:3006";
```

### Admin Guard on Rust Handlers
Following the existing pattern, the Rust services are treated as **internal-only surfaces** behind the network boundary. No new header-based trust mechanism. The Next.js `requireAdmin()` check is the sole gate; Rust handlers for admin actions do not validate admin identity — they validate only business rules (state, ownership, timing).

---

## Gap 1: Payout Management

### Route
`/admin/payouts` (new page)

### API Routes
| Method | Path | Description |
|---|---|---|
| GET | `/api/admin/payouts` | List deployments with financial summary (direct pg.Pool) |
| GET | `/api/admin/payouts/[id]` | Full escrow + platform_fees ledger for one deployment (direct pg.Pool) |
| POST | `/api/admin/payouts/[id]/force-release` | Force-release stuck BIOMETRIC_PENDING deployment (proxies to marketplace_service) |
| POST | `/api/admin/payouts/[id]/force-veto` | Force-veto VETO_WINDOW deployment (proxies to **payout_service** at `PAYOUT_URL`) |

### Page Layout
- **Filter bar:** state dropdown (ALL / VETO_WINDOW / BIOMETRIC_PENDING / RELEASED / VETOED / FAILED), date range picker
- **Table columns:** Deployment ID (truncated), Escrow Amount, Platform Fee, State badge, Time in State, Actions
- **Detail panel (slide-in on row click):**
  - Deployment parties (client, freelancer, developer)
  - Full `escrow_payouts` ledger (recipient, amount, reason, date)
  - Full `platform_fees` ledger (fee_cents, fee_pct, date)
  - Admin actions (see below)

### Admin Actions
**Force-release** — available only when:
- state = `BIOMETRIC_PENDING`
- `updated_at < NOW() - INTERVAL '48 hours'` (stuck > 48h)

Flow: admin enters reason → confirm dialog → `POST /api/admin/payouts/[id]/force-release` → proxies to `POST /admin/payouts/:id/force-release` on marketplace_service.

**Force-veto** — available only when:
- state = `VETO_WINDOW`

Flow: confirm dialog → `POST /api/admin/payouts/[id]/force-veto` → proxies to existing `POST /payouts/{id}/veto` on **payout_service** (`PAYOUT_URL`).

### New Rust Handler: `POST /admin/payouts/:id/force-release`
File: `crates/marketplace_service/src/admin_handlers.rs`

Guards (business rules only — no admin identity check in Rust, network boundary is the guard):
- Deployment must be in `BIOMETRIC_PENDING` state → 409 otherwise
- Deployment must have `updated_at < NOW() - INTERVAL '48 hours'` → 409 otherwise

Logic:
1. Read `escrow_amount_cents`, `freelancer_id`, `developer_id` from deployment
2. Call `split_with_commission(escrow_amount_cents)` (already exists in veto_payout.rs — extract to `crates/common` or duplicate locally) → platform 15%, developer 59.5%, talent 25.5% (all truncated)
3. INSERT into `escrow_payouts`: one row per recipient (developer + talent)
4. INSERT into `platform_fees`
5. UPDATE `deployments` SET state = 'RELEASED'::deployment_status, updated_at = NOW()
6. INSERT into `admin_payout_actions` (reason from request body: `{ reason: String }`)
7. Return `204 No Content`

### New Migration: `0051_admin_payout_actions.sql`
```sql
-- Append-only audit trail for admin financial interventions.
-- id uses gen_random_uuid() here; the Rust handler inserts via Uuid::now_v7() at call site.
CREATE TABLE admin_payout_actions (
  id             UUID        PRIMARY KEY,
  deployment_id  UUID        NOT NULL REFERENCES deployments(id),
  admin_id       UUID        NOT NULL REFERENCES unified_profiles(id),
  action         TEXT        NOT NULL CHECK (action IN ('force_release', 'force_veto')),
  reason         TEXT        NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_admin_payout_actions_deployment ON admin_payout_actions(deployment_id);
CREATE INDEX idx_admin_payout_actions_admin      ON admin_payout_actions(admin_id);
-- Append-only: revoke DELETE/UPDATE from app user after table creation
-- (run manually in production, same as escrow_payouts)
```

Note: `id` is generated in the Rust handler using `Uuid::now_v7()` (time-ordered, per CLAUDE.md §2), not a DB default.

---

## Gap 2: Warranty Claim Resolution

### Route
`/admin/warranty-claims` (new page)

### API Routes
| Method | Path | Description |
|---|---|---|
| GET | `/api/admin/warranty-claims` | List all warranty claims — **direct pg.Pool** (bypasses 100-row cap in compliance_service) |
| POST | `/api/admin/warranty-claims/[id]/resolve` | Resolve a claim (proxies to `COMPLIANCE_URL`) |

**Why direct pg.Pool for list:** The existing `list_warranty_claims` handler in `compliance_service` has a hardcoded `LIMIT 100`. The admin route queries `warranty_claims` directly with pagination (`LIMIT 50 OFFSET $2`) to support platforms with >100 claims.

Query:
```sql
SELECT wc.*, d.escrow_amount_cents, d.state AS deployment_state
FROM warranty_claims wc
LEFT JOIN deployments d ON d.id = wc.deployment_id
WHERE ($1::text IS NULL OR wc.resolution::text = $1)
ORDER BY wc.claimed_at DESC
LIMIT 50 OFFSET $2
```

### Page Layout
- **Filter bar:** status (ALL / PENDING / REMEDIATED / REFUNDED / REJECTED)
  - PENDING = `resolution IS NULL`
- **Table columns:** Claim ID (truncated), Deployment ID, Claimant ID, Claimed At, Resolution badge, Actions
- **Resolve panel (slide-in):**
  - Deployment escrow amount and state
  - Drift proof (full text, monospace, max-height 200px scrollable)
  - Claimed date
  - Three action buttons: **Remediate** / **Refund** / **Reject**
  - Each requires a single confirm click
  - Already-resolved claims: panel is read-only, shows resolution + resolved_at

### Backend for Resolve
Proxies to existing `POST /warranty-claims/{id}/resolve` on `COMPLIANCE_URL`. Body: `{ resolution: "REMEDIATED" | "REFUNDED" | "REJECTED" }`.

---

## Gap 3: Audit Log Viewer

### Route
`/admin/audit` (new page, 3 tabs)

### API Routes (direct pg.Pool — no Rust changes)
| Method | Path | Query Params |
|---|---|---|
| GET | `/api/admin/audit/escrow` | `page`, `limit` (max 100), `from`, `to` (ISO dates) |
| GET | `/api/admin/audit/tool-calls` | `page`, `limit`, `decision` (ALLOWED/DENIED/ALL), `from`, `to` |
| GET | `/api/admin/audit/identity` | `page`, `limit`, `event_type` (free text or ALL) |

### Page Layout
Three tabs:

**Escrow tab** — columns: Deployment ID, Recipient ID, Amount (cents → `$X.XX`), Reason, Date
- Filter: date range (from / to)

**Tool Calls tab** — columns: Deployment ID, Tool Name, Decision (ALLOWED=emerald / DENIED=red badge), Called At
- Filter: decision (ALL / ALLOWED / DENIED), date range
- **Actual `tool_call_audit` columns (query these only):** `id BIGSERIAL`, `deployment_id UUID`, `tool_name TEXT`, `params TEXT`, `decision TEXT`, `called_at TIMESTAMPTZ`. The CLAUDE.md schema reference mentions `input_hash`/`output_hash`/`agent_id` — those columns do NOT exist in the migration (0004). Use the migration as the source of truth.

**Identity tab** — columns: Profile ID, Event Type (text badge), Old Tier → New Tier, Old Score → New Score, Actor ID, Date
- Filter: event_type text input (free-text ILIKE — not an IN(...) filter, to handle any event types in production data beyond the known four)

All tabs: paginated with prev/next buttons. Export to CSV (client-side, current page only — note: multi-page export is out of scope for MVP).

---

## Gap 4: Feature Flags

### Route
`/admin/feature-flags` (new page)

### Migration: `0052_feature_flags.sql`
```sql
CREATE TABLE feature_flags (
  name        TEXT        PRIMARY KEY,
  enabled     BOOLEAN     NOT NULL DEFAULT false,
  description TEXT        NOT NULL DEFAULT '',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  UUID        REFERENCES unified_profiles(id)
);

-- ⚠️ DEPLOYMENT ORDER: Before deploying payout_service code that reads this table,
-- verify the seeded value matches the current SKIP_BIOMETRIC env var on the target environment.
-- If SKIP_BIOMETRIC=true in production, update this seed to enabled=true before deploying.
INSERT INTO feature_flags (name, enabled, description)
VALUES (
  'skip_biometric',
  false,
  'Skip ZK biometric sign-off during veto window. Enable in staging only. DANGER: affects escrow release.'
);
```

**Deployment order dependency:** The migration seeds `skip_biometric` as `false`. If the current production environment has `SKIP_BIOMETRIC=true`, update the seed value before running the migration — or toggle the flag to `true` immediately after migration via the admin UI, before deploying the updated `payout_service` binary that reads from DB instead of env var.

### API Routes
| Method | Path | Description |
|---|---|---|
| GET | `/api/admin/feature-flags` | List all flags (direct pg.Pool) |
| PATCH | `/api/admin/feature-flags/[name]` | Toggle `enabled` or update `description` |
| POST | `/api/admin/feature-flags` | Create new flag (name must match `^[a-z][a-z0-9_]*$`) |

### Page Layout
- **Table:** Flag name (monospace), Description, Enabled toggle (amber when on), Last Updated, Updated By
- **Toggle:** inline PATCH on click — optimistic update, revert on error
- **Create row:** inline form at bottom — name (slug format: `^[a-z][a-z0-9_]*$`, enforced client + server), description, initial state. POST on Save.
- **No delete** — flags are referenced in code. Disabling is the correct action.

### Flag Consumption in Rust
Replaces `std::env::var("SKIP_BIOMETRIC")` in `crates/payout_service/src/veto_payout.rs`. **Remove the old `std::env::var("SKIP_BIOMETRIC")` call entirely** — do not leave both paths coexisting:
```rust
// Before (env var, defaults fail-open):
let skip = std::env::var("SKIP_BIOMETRIC").unwrap_or_default() == "true";

// After (DB flag, defaults fail-closed — see deployment note above):
let skip: bool = sqlx::query_scalar(
    "SELECT enabled FROM feature_flags WHERE name = $1"
)
.bind("skip_biometric")
.fetch_optional(&state.db)
.await
.unwrap_or(None)
.unwrap_or(false);
```

---

## Gap 5: Contract Management

### Route
`/admin/contracts` (new page)

### API Routes
| Method | Path | Description |
|---|---|---|
| GET | `/api/admin/contracts` | List all contracts — direct pg.Pool with pagination (bypasses 200-row cap in compliance_service) |
| POST | `/api/admin/contracts/[id]/revoke` | Revoke (proxies to `COMPLIANCE_URL`) |

### Page Layout
- **Filter bar:** status (ALL / DRAFT / PENDING_SIGNATURE / SIGNED / EXPIRED / REVOKED), contract type (free text)
- **Table columns:** Contract ID, Type, Party A email, Party B email, Deployment (if linked), Status badge, Created, Signed At
- **Detail panel (slide-in):**
  - Full metadata: both parties, deployment link, status, SHA-256 doc hash (monospace)
  - Sign token expiry (if PENDING_SIGNATURE)
  - Document text (collapsible, max-height 400px scrollable)
  - **Revoke button** — shown only for DRAFT and PENDING_SIGNATURE. Single confirm dialog. Calls `POST /api/admin/contracts/[id]/revoke`.

### New Rust Handler: `POST /compliance/admin/contracts/:id/revoke`
File: `crates/compliance_service/src/handlers.rs`

```rust
pub async fn revoke_contract(
    State(svc): State<Arc<ContractService>>,
    Path(contract_id): Path<Uuid>,
) -> Result<StatusCode, (StatusCode, String)> {
    let updated = sqlx::query(
        "UPDATE contracts
         SET status = 'REVOKED'::contract_status
         WHERE id = $1
           AND status IN ('DRAFT'::contract_status, 'PENDING_SIGNATURE'::contract_status)
         RETURNING id"
    )
    .bind(contract_id)
    .fetch_optional(&svc.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    match updated {
        Some(_) => Ok(StatusCode::NO_CONTENT),
        None    => Err((StatusCode::CONFLICT, "Contract is not in a revocable state".to_string())),
    }
}
```

Register in `crates/compliance_service/src/main.rs`:
```rust
.route("/admin/contracts/:id/revoke", post(handlers::revoke_contract))
```

No audit trail for contract revocation in v1 (unlike financial actions). Admin action is logged by the `admin_payout_actions` pattern only for financial mutations.

---

## Gap 6: System-wide Announcements

### Routes
- `/admin/announcements` (new admin page)
- `AnnouncementBanner` component added to `/dashboard` and `/marketplace`

### Migration: `0053_announcements.sql`
```sql
CREATE TABLE announcements (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT        NOT NULL,
  body        TEXT        NOT NULL,
  severity    TEXT        NOT NULL DEFAULT 'info'
                CHECK (severity IN ('info', 'warning', 'urgent')),
  starts_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ,
  created_by  UUID        NOT NULL REFERENCES unified_profiles(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Partial index: only index non-expired announcements for the public fetch query
CREATE INDEX idx_announcements_active ON announcements(starts_at)
  WHERE expires_at IS NULL OR expires_at > NOW();
```

### API Routes
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/announcements` | Public | Active announcements: `starts_at ≤ NOW() AND (expires_at IS NULL OR expires_at > NOW())` |
| POST | `/api/admin/announcements` | Admin | Create announcement |
| DELETE | `/api/admin/announcements/[id]` | Admin | Hard delete |

### Admin Page Layout
- **Table:** Title, Severity badge, Body (truncated 80 chars), Active pill (green/grey), Start, Expiry, Delete button
- **Create form (above table):**
  - Title (text input, required)
  - Body (textarea, required)
  - Severity (segmented control: info / warning / urgent)
  - Expires At (optional date-time picker — leave empty = permanent)
  - Create button → POST → optimistic row added to table

### User-facing Banner (`AnnouncementBanner`)
File: `apps/web/components/AnnouncementBanner.tsx`

- Fetches `GET /api/announcements` on mount. No auth token needed (public route).
- Shows the single most recent active announcement (sorted by `created_at DESC`, limit 1).
- Dismissible: `localStorage.setItem('dismissed_<id>', '1')` — dismissed banners don't reappear until page refresh clears the check.
- Severity colours:
  - `info` → `bg-zinc-800 border-zinc-700 text-zinc-300`
  - `warning` → `bg-amber-950/40 border-amber-800 text-amber-300`
  - `urgent` → `bg-red-950/40 border-red-800 text-red-400`
- Rendered at top of `<main>` content area (below top nav, above page content).

---

## Files Changed Summary

| File | Action |
|---|---|
| `migrations/0051_admin_payout_actions.sql` | New — audit table for admin financial interventions |
| `migrations/0052_feature_flags.sql` | New — feature_flags table + skip_biometric seed |
| `migrations/0053_announcements.sql` | New — announcements table |
| `apps/web/app/api/admin/_auth.ts` | Add `PAYOUT_URL` + `COMPLIANCE_URL` constants |
| `crates/marketplace_service/src/admin_handlers.rs` | Add `force_release_payout` handler |
| `crates/marketplace_service/src/main.rs` | Register `POST /admin/payouts/:id/force-release` |
| `crates/compliance_service/src/handlers.rs` | Add `revoke_contract` handler |
| `crates/compliance_service/src/main.rs` | Register `POST /admin/contracts/:id/revoke` |
| `crates/payout_service/src/veto_payout.rs` | Replace `SKIP_BIOMETRIC` env var with feature_flags DB read |
| `apps/web/app/admin/payouts/page.tsx` | New admin page |
| `apps/web/app/admin/warranty-claims/page.tsx` | New admin page |
| `apps/web/app/admin/audit/page.tsx` | New admin page (3 tabs) |
| `apps/web/app/admin/feature-flags/page.tsx` | New admin page |
| `apps/web/app/admin/contracts/page.tsx` | New admin page |
| `apps/web/app/admin/announcements/page.tsx` | New admin page |
| `apps/web/app/api/admin/payouts/route.ts` | New direct-DB + proxy route |
| `apps/web/app/api/admin/payouts/[id]/route.ts` | New direct-DB route (GET detail) |
| `apps/web/app/api/admin/payouts/[id]/force-release/route.ts` | New proxy → marketplace_service |
| `apps/web/app/api/admin/payouts/[id]/force-veto/route.ts` | New proxy → payout_service |
| `apps/web/app/api/admin/warranty-claims/route.ts` | New direct-DB route |
| `apps/web/app/api/admin/warranty-claims/[id]/resolve/route.ts` | New proxy → compliance_service |
| `apps/web/app/api/admin/audit/escrow/route.ts` | New direct-DB route |
| `apps/web/app/api/admin/audit/tool-calls/route.ts` | New direct-DB route |
| `apps/web/app/api/admin/audit/identity/route.ts` | New direct-DB route |
| `apps/web/app/api/admin/feature-flags/route.ts` | New direct-DB route |
| `apps/web/app/api/admin/feature-flags/[name]/route.ts` | New direct-DB route (PATCH) |
| `apps/web/app/api/admin/contracts/route.ts` | New direct-DB + proxy route |
| `apps/web/app/api/admin/contracts/[id]/revoke/route.ts` | New proxy → compliance_service |
| `apps/web/app/api/announcements/route.ts` | New public route |
| `apps/web/app/api/admin/announcements/route.ts` | New admin route (POST) |
| `apps/web/app/api/admin/announcements/[id]/route.ts` | New admin route (DELETE) |
| `apps/web/components/AnnouncementBanner.tsx` | New shared component |
| `apps/web/app/(app)/dashboard/page.tsx` | Add `<AnnouncementBanner />` |
| `apps/web/app/(app)/marketplace/page.tsx` | Add `<AnnouncementBanner />` |
| `apps/web/app/admin/page.tsx` | Add nav links for 6 new sections |

---

## Testing

```bash
# Rust
cargo test -p marketplace_service
cargo test -p compliance_service
cargo test -p payout_service
cargo clippy -- -D warnings
cargo fmt --all

# Frontend
cd apps/web && npm run build && npm run lint

# Manual smoke tests
# Gap 1: Deployment in BIOMETRIC_PENDING → force-release → verify escrow_payouts rows + admin_payout_actions row
# Gap 1: Deployment in VETO_WINDOW → force-veto → verify state = VETOED
# Gap 2: Warranty claim with no resolution → admin resolves REFUNDED → verify resolved_at set
# Gap 3: Each audit tab → verify rows load, filter works, pagination advances
# Gap 4: Toggle skip_biometric flag → verify payout_service picks up new value on next deployment flow
# Gap 5: PENDING_SIGNATURE contract → revoke → verify status = REVOKED; SIGNED contract → revoke button not shown
# Gap 6: Create urgent announcement → verify red banner on /dashboard → dismiss → verify banner gone
```
