# Admin Controls Design
**Date:** 2026-03-24
**Status:** Approved
**Scope:** `apps/web/app/admin/`, `apps/web/app/api/admin/`, `crates/compliance_service/`, `crates/marketplace_service/`, `migrations/`

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
- Admin guard: reuse existing `requireAdmin()` from `apps/web/app/api/admin/_auth.ts`
- DB access: direct `pg.Pool` queries for read-heavy admin routes (same pattern as `skill-suggestions`); proxy to Rust services for mutations that affect financial state

New Rust handlers are added only where financial correctness requires it (payout force-release, contract revoke). All other mutations go through direct DB writes from Next.js admin routes.

---

## Gap 1: Payout Management

### Route
`/admin/payouts` (new page)

### API Routes
| Method | Path | Description |
|---|---|---|
| GET | `/api/admin/payouts` | List deployments with financial summary |
| GET | `/api/admin/payouts/[id]` | Full escrow + platform_fees ledger for one deployment |
| POST | `/api/admin/payouts/[id]/force-release` | Force-release stuck BIOMETRIC_PENDING deployment |
| POST | `/api/admin/payouts/[id]/force-veto` | Force-veto VETO_WINDOW deployment |

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

Flow: admin enters reason → confirm dialog → `POST /api/admin/payouts/[id]/force-release` → proxies to new Rust handler.

**Force-veto** — available only when:
- state = `VETO_WINDOW`

Flow: confirm dialog → `POST /api/admin/payouts/[id]/force-veto` → proxies to existing `POST /payouts/{id}/veto`.

### New Rust Handler: `POST /marketplace/admin/payouts/:id/force-release`
File: `crates/marketplace_service/src/admin_handlers.rs`

Guards:
- Caller must have `is_admin = true` in request (via `X-Admin: true` internal header set by Next.js admin proxy after verifying session)
- Deployment must be in `BIOMETRIC_PENDING` state
- Deployment must have `updated_at < NOW() - INTERVAL '48 hours'`

Logic:
1. Read `total_amount_cents` and `escrow_amount_cents` from deployment
2. Call `split_with_commission(escrow_amount_cents)` → (platform 15%, developer 59.5%, talent 25.5%)
3. INSERT into `escrow_payouts`: one row for developer, one for talent
4. INSERT into `platform_fees`
5. UPDATE `deployments` SET state = 'RELEASED', updated_at = NOW()
6. INSERT into `admin_payout_actions` (new append-only table — see migration)
7. Return `204 No Content`

### New Migration: `0051_admin_payout_actions.sql`
```sql
CREATE TABLE admin_payout_actions (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_id  UUID        NOT NULL REFERENCES deployments(id),
  admin_id       UUID        NOT NULL REFERENCES unified_profiles(id),
  action         TEXT        NOT NULL CHECK (action IN ('force_release', 'force_veto')),
  reason         TEXT        NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_admin_payout_actions_deployment ON admin_payout_actions(deployment_id);
CREATE INDEX idx_admin_payout_actions_admin ON admin_payout_actions(admin_id);
```

---

## Gap 2: Warranty Claim Resolution

### Route
`/admin/warranty-claims` (new page)

### API Routes
| Method | Path | Description |
|---|---|---|
| GET | `/api/admin/warranty-claims` | List all warranty claims with filter |
| POST | `/api/admin/warranty-claims/[id]/resolve` | Resolve a claim (proxies to compliance_service) |

### Page Layout
- **Filter bar:** status (ALL / PENDING / REMEDIATED / REFUNDED / REJECTED)
- **Table columns:** Claim ID, Deployment ID, Claimant, Claimed At, Resolution badge, Actions
- **Resolve panel (slide-in):**
  - Deployment details fetched from marketplace_service
  - Drift proof (full text, monospace scrollable)
  - Claimed date
  - Three action buttons: **Remediate** / **Refund** / **Reject**
  - Each requires a single confirm click (no reason field — resolution enum is self-explanatory)
  - Already-resolved claims: panel is read-only, no action buttons

### Backend
No new Rust handlers. Reuses existing `POST /warranty-claims/{id}/resolve` in `compliance_service`. Next.js proxy adds admin auth check before forwarding.

---

## Gap 3: Audit Log Viewer

### Route
`/admin/audit` (new page, 3 tabs)

### API Routes (direct pg.Pool — no Rust changes)
| Method | Path | Description |
|---|---|---|
| GET | `/api/admin/audit/escrow` | Query `escrow_payouts` with date range + pagination |
| GET | `/api/admin/audit/tool-calls` | Query `tool_call_audit` with decision filter + pagination |
| GET | `/api/admin/audit/identity` | Query `identity_audit_log` with event_type filter + pagination |

All routes accept: `page` (default 1), `limit` (default 50, max 100), relevant filter params.

### Page Layout
Three tabs:

**Escrow tab** — columns: Deployment ID, Recipient ID, Amount (formatted £/$ from cents), Reason, Date
- Filter: date range (from / to)

**Tool Calls tab** — columns: Deployment ID, Tool Name, Decision (ALLOWED=emerald / DENIED=red badge), Called At
- Filter: decision (ALL / ALLOWED / DENIED), date range

**Identity tab** — columns: Profile ID, Event Type badge, Old Tier → New Tier, Old Score → New Score, Actor, Date
- Filter: event_type dropdown (ALL / PROVIDER_CONNECTED / PROVIDER_DISCONNECTED / TIER_CHANGED / SKILL_ATTESTED)

All tabs: paginated with prev/next buttons. Export to CSV button on each tab (client-side, from loaded data).

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

-- Seed: migrate existing env-var flag to DB
INSERT INTO feature_flags (name, enabled, description)
VALUES (
  'skip_biometric',
  false,
  'Skip ZK biometric sign-off during veto window. Enable in staging only.'
);
```

### API Routes
| Method | Path | Description |
|---|---|---|
| GET | `/api/admin/feature-flags` | List all flags |
| PATCH | `/api/admin/feature-flags/[name]` | Toggle enabled or update description |
| POST | `/api/admin/feature-flags` | Create new flag |

### Page Layout
- **Table:** Flag name (monospace), Description, Enabled toggle (amber when on), Last Updated, Updated By
- **Toggle:** inline PATCH on click — optimistic update, revert on error
- **Create row:** inline form at bottom — name (slug format enforced: `[a-z_]+`), description, initial state. POST on Save.
- **No delete** — flags are referenced by code. Disabling is the correct action.

### Flag Consumption Pattern
Rust services that need to check a feature flag query the DB directly:
```rust
let enabled: bool = sqlx::query_scalar("SELECT enabled FROM feature_flags WHERE name = $1")
    .bind("skip_biometric")
    .fetch_optional(&state.db)
    .await?
    .unwrap_or(false);
```
This replaces `std::env::var("SKIP_BIOMETRIC")` in `payout_service/src/veto_payout.rs`.

---

## Gap 5: Contract Management

### Route
`/admin/contracts` (new page)

### API Routes
| Method | Path | Description |
|---|---|---|
| GET | `/api/admin/contracts` | List all contracts (proxies to compliance_service `list_contracts` with no profile_id filter) |
| POST | `/api/admin/contracts/[id]/revoke` | Revoke a DRAFT or PENDING_SIGNATURE contract |

### Page Layout
- **Filter bar:** status (ALL / DRAFT / PENDING_SIGNATURE / SIGNED / EXPIRED / REVOKED), contract type
- **Table columns:** Contract ID, Type, Party A email, Party B email, Deployment (if linked), Status badge, Created, Signed At
- **Detail panel (slide-in):**
  - Full metadata: both parties, deployment link, status, doc hash (monospace)
  - Sign token expiry (if PENDING_SIGNATURE)
  - Document text (collapsible, scroll-limited to 400px)
  - **Revoke button** — available for DRAFT and PENDING_SIGNATURE only. Confirm dialog. Calls `POST /api/admin/contracts/[id]/revoke`.

### New Rust Handler: `POST /compliance/admin/contracts/:id/revoke`
File: `crates/compliance_service/src/handlers.rs`

Guards: state must be DRAFT or PENDING_SIGNATURE (cannot revoke SIGNED — that requires a legal process). Sets `status = 'REVOKED'`.

---

## Gap 6: System-wide Announcements

### Routes
- `/admin/announcements` (new admin page)
- `AnnouncementBanner` component on `/dashboard`, `/marketplace`

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
CREATE INDEX idx_announcements_active ON announcements(starts_at, expires_at);
```

### API Routes
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/announcements` | Public | Returns active announcements (starts_at ≤ NOW ≤ expires_at OR expires_at IS NULL) |
| POST | `/api/admin/announcements` | Admin | Create announcement |
| DELETE | `/api/admin/announcements/[id]` | Admin | Hard delete (announcements are not financial records) |

### Admin Page Layout
- **Table:** Title, Severity badge, Body (truncated 80 chars), Active status (green/grey), Start, Expiry, Actions (Delete)
- **Create form (top of page):**
  - Title (text input)
  - Body (textarea)
  - Severity (radio: info / warning / urgent)
  - Expires At (optional date picker — leave empty = permanent)
  - Create button

### User-facing Banner
New `AnnouncementBanner` component fetches `GET /api/announcements` on mount (SWR with 60s revalidation). Renders the most recent active announcement as a dismissible bar at the top of the page content area (below top nav):

- **info** severity: `bg-zinc-800 border-zinc-700 text-zinc-300`
- **warning** severity: `bg-amber-950/40 border-amber-800 text-amber-300`
- **urgent** severity: `bg-red-950/40 border-red-800 text-red-400`

Dismiss: localStorage key `dismissed_announcement_<id>` — dismissed banners don't reappear in the same session. Expired announcements are not fetched (filtered server-side).

Added to: `apps/web/app/(app)/dashboard/page.tsx` and `apps/web/app/(app)/marketplace/page.tsx`.

---

## Files Changed Summary

| File | Action |
|---|---|
| `migrations/0051_admin_payout_actions.sql` | New — admin_payout_actions append-only table |
| `migrations/0052_feature_flags.sql` | New — feature_flags table + skip_biometric seed |
| `migrations/0053_announcements.sql` | New — announcements table |
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
| `apps/web/app/api/admin/payouts/route.ts` | New proxy route |
| `apps/web/app/api/admin/payouts/[id]/route.ts` | New proxy route (GET detail) |
| `apps/web/app/api/admin/payouts/[id]/force-release/route.ts` | New proxy route |
| `apps/web/app/api/admin/payouts/[id]/force-veto/route.ts` | New proxy route |
| `apps/web/app/api/admin/warranty-claims/route.ts` | New proxy route |
| `apps/web/app/api/admin/warranty-claims/[id]/resolve/route.ts` | New proxy route |
| `apps/web/app/api/admin/audit/escrow/route.ts` | New direct-DB route |
| `apps/web/app/api/admin/audit/tool-calls/route.ts` | New direct-DB route |
| `apps/web/app/api/admin/audit/identity/route.ts` | New direct-DB route |
| `apps/web/app/api/admin/feature-flags/route.ts` | New direct-DB route |
| `apps/web/app/api/admin/feature-flags/[name]/route.ts` | New direct-DB route (PATCH) |
| `apps/web/app/api/admin/contracts/route.ts` | New proxy route |
| `apps/web/app/api/admin/contracts/[id]/revoke/route.ts` | New proxy route |
| `apps/web/app/api/announcements/route.ts` | New public route |
| `apps/web/app/api/admin/announcements/route.ts` | New admin route |
| `apps/web/app/api/admin/announcements/[id]/route.ts` | New admin route (DELETE) |
| `apps/web/components/AnnouncementBanner.tsx` | New shared component |
| `apps/web/app/(app)/dashboard/page.tsx` | Add AnnouncementBanner |
| `apps/web/app/(app)/marketplace/page.tsx` | Add AnnouncementBanner |
| `apps/web/app/admin/page.tsx` | Add links to 6 new sections in admin nav |

---

## Testing

```bash
# Rust
cargo test -p marketplace_service
cargo test -p compliance_service
cargo clippy -- -D warnings

# Frontend
cd apps/web && npm run build && npm run lint

# Manual smoke tests
# Gap 1: Create deployment → advance to BIOMETRIC_PENDING → wait (or mock 48h) → force-release → verify escrow_payouts rows
# Gap 2: Submit warranty claim → admin resolves as REFUNDED → verify resolved_at set
# Gap 3: Open audit tabs → verify rows appear, filters work, pagination works
# Gap 4: Toggle feature flag → verify DB updated → verify payout_service reads new value
# Gap 5: View contracts list → revoke a PENDING_SIGNATURE contract → verify status = REVOKED
# Gap 6: Create urgent announcement → verify red banner on dashboard → dismiss → verify localStorage key set
```
