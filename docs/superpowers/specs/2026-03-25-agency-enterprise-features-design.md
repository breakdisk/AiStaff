# Agency Enterprise Features — Design Spec

> Applies to: AiStaff Enterprise Organisation model (`account_type = 'enterprise'`, `organisations` table)
> Date: 2026-03-25

---

## Overview

Four new features extending the Enterprise agency experience:

1. **Public Agency Profile** — discoverable + shareable page at `/agency/{handle}` (frontend) backed by `GET /orgs/public/{handle}` (backend, queries `organisations` table)
2. **Bundle Listings** — package multiple agent listings at a fixed price
3. **Proposal Inbox** — org-level Kanban view of team proposals
4. **Verified Badge** — amber star auto-granted to ENTERPRISE + PLATINUM plan tiers

Features 2 (Team Management) and 3 (Analytics Dashboard) already exist at `/enterprise/members` and `/enterprise`. No changes needed there.

> **Two agency tables exist in the codebase:**
> - `agencies` (migration 0019) — simple freelancer agency, has `handle` already
> - `organisations` (migration 0028) — enterprise tier, no `handle` yet
>
> All 4 features target **`organisations`** only. The frontend URL `/agency/{handle}` is a user-facing alias; the backend route queries `organisations`.

---

## 1. Database

### Migration 0056 — Bundle tables + org handle + listing org FK

```sql
-- Handle for public profile URL on organisations
ALTER TABLE organisations ADD COLUMN handle TEXT UNIQUE;
CREATE INDEX idx_organisations_handle ON organisations(handle);

-- org_id FK on agent_listings so badge can be shown on listing cards
ALTER TABLE agent_listings ADD COLUMN org_id UUID REFERENCES organisations(id) ON DELETE SET NULL;
CREATE INDEX idx_agent_listings_org ON agent_listings(org_id);

-- Bundle tables
CREATE TABLE listing_bundles (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id         UUID        NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    name           TEXT        NOT NULL,
    description    TEXT,
    price_cents    BIGINT      NOT NULL CHECK (price_cents > 0),
    listing_status   TEXT        NOT NULL DEFAULT 'PENDING_REVIEW',
    active           BOOLEAN     NOT NULL DEFAULT FALSE,
    rejection_reason TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE bundle_items (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bundle_id     UUID NOT NULL REFERENCES listing_bundles(id) ON DELETE CASCADE,
    listing_id    UUID NOT NULL REFERENCES agent_listings(id) ON DELETE CASCADE,
    display_order INT  NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (bundle_id, listing_id)
);

CREATE INDEX idx_bundle_items_bundle  ON bundle_items(bundle_id);
CREATE INDEX idx_bundle_items_listing ON bundle_items(listing_id);
CREATE INDEX idx_listing_bundles_org  ON listing_bundles(org_id);
```

### Migration 0057 — Proposals: profile FK + status extension

```sql
-- Link proposals to the submitter's profile (nullable for backward compat)
ALTER TABLE proposals
    ADD COLUMN submitted_by_profile_id UUID REFERENCES unified_profiles(id);

CREATE INDEX idx_proposals_submitted_by ON proposals(submitted_by_profile_id);

-- Extend status to include DRAFT for the Kanban inbox
-- Existing rows with status 'PENDING' / 'ACCEPTED' / 'REJECTED' are unaffected
ALTER TABLE proposals DROP CONSTRAINT IF EXISTS proposals_status_check;
ALTER TABLE proposals ADD CONSTRAINT proposals_status_check
    CHECK (status IN ('DRAFT', 'PENDING', 'ACCEPTED', 'REJECTED'));
```

**Kanban status mapping** (read-only, no column rename):

| DB `status` | Kanban column |
|---|---|
| `DRAFT` | Draft |
| `PENDING`, `ACCEPTED` | Sent |
| `REJECTED` | Closed |

New proposals submitted via `/proposals/draft` should set `status = 'DRAFT'` until officially submitted, then transition to `PENDING`. The existing proposal submit flow sets `PENDING` directly — that maps to "Sent" in the Kanban, which is correct.

> **Note on `submitted_at`**: existing `proposals` table has `submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` — it is always populated. Do NOT use `submitted_at IS NULL` to infer draft status. Use the `status` column exclusively.

---

## 2. Backend API

### identity_service (:3001)

#### `GET /orgs/public/{handle}`
- **Auth**: none (public endpoint)
- **Frontend route**: `/agency/{handle}` (user-facing alias)
- **Logic**: look up `organisations` WHERE `handle = $1`. JOIN `org_members` for count. JOIN `agent_listings` WHERE `org_id = org.id AND active = TRUE` for count. JOIN `deployments` WHERE `org_id = org.id AND state = 'RELEASED'` for completed count. (`deployments.state` is the column name, not `status`; `RELEASED` is the terminal success value in the `deployment_status` enum.)
- **Response**:
```json
{
  "id": "uuid",
  "name": "TechForce Agency",
  "handle": "techforce",
  "description": "...",
  "website_url": "...",
  "plan_tier": "ENTERPRISE",
  "is_verified": true,
  "member_count": 12,
  "active_listing_count": 34,
  "completed_deployment_count": 98,
  "created_at": "..."
}
```
- `is_verified`: computed as `plan_tier IN ('ENTERPRISE', 'PLATINUM')`
- Returns 404 if handle not found or not set

### marketplace_service (:3002)

#### `GET /enterprise/orgs/{id}/bundles`
- **Auth**: org member (ADMIN or MEMBER)
- **Response**: `{ bundles: [{ id, name, description, price_cents, listing_status, active, item_count, items: [{ listing_id, name, price_cents, display_order }], created_at }] }`

#### `POST /enterprise/orgs/{id}/bundles`
- **Auth**: org ADMIN only
- **Body**: `{ name, description?, price_cents, listing_ids: uuid[] }`
- **Logic**: validates all `listing_ids` belong to org's approved listings. Inserts `listing_bundles` + `bundle_items` in a transaction. Sets `listing_status = 'PENDING_REVIEW'`, `active = FALSE`.
- **Response**: 201 `{ bundle_id, listing_status: "PENDING_REVIEW" }`

#### `PATCH /enterprise/orgs/{id}/bundles/{bundle_id}`
- **Auth**: org ADMIN only
- **Body**: `{ name?, description?, price_cents?, listing_ids?: uuid[] }`
- **Logic**: updates bundle fields. If `listing_ids` changes AND current `listing_status = 'APPROVED'`, resets to `PENDING_REVIEW` and `active = FALSE` (requires re-moderation). Updates `updated_at`.
- **Response**: 200 `{ ok: true, listing_status }`

#### `DELETE /enterprise/orgs/{id}/bundles/{bundle_id}`
- **Auth**: org ADMIN only
- **Logic**: hard delete (cascade deletes `bundle_items`). Returns 204.

#### `GET /enterprise/orgs/{id}/proposals`
- **Auth**: org member
- **Logic**:
  - Query `org_members WHERE org_id = $org_id AND profile_id = $caller_profile_id` to get caller's `member_role`. Return 403 if no row exists (caller is not a member of this org).
  - Fetch all `profile_id` values from `org_members WHERE org_id = $org_id` for use in ADMIN filter.
  - ADMIN (`member_role = 'ADMIN'`): `WHERE submitted_by_profile_id IN (org_member_ids)`
  - MEMBER (`member_role = 'MEMBER'`): `WHERE submitted_by_profile_id = $caller_profile_id`
  - JOIN `unified_profiles` ON `submitted_by_profile_id = unified_profiles.id` to get `display_name AS submitter_name`
  - Group results by mapped Kanban status (DRAFT → draft, PENDING+ACCEPTED → sent, REJECTED → closed)
- **Response**: `{ draft: [...], sent: [...], closed: [...] }` — each item: `{ id, job_title, freelancer_email, client_email, submitted_at, submitted_by_profile_id, submitter_name }`

### Admin endpoints (marketplace_service)

#### `POST /admin/bundles/{id}/approve`
- Sets `listing_status = 'APPROVED'`, `active = TRUE`

#### `POST /admin/bundles/{id}/reject`
- **Body**: `{ reason: string }`
- Sets `listing_status = 'REJECTED'`, `active = FALSE`, stores `rejection_reason`

---

## 3. Frontend

### New Routes

| Route | Component | Auth | Description |
|---|---|---|---|
| `/agency/{handle}` | `AgencyProfilePage` | None | Public profile — single scroll |
| `/enterprise/bundles` | `BundlesPage` | Enterprise member | Bundle management — inline table |
| `/enterprise/proposals` | `ProposalsInboxPage` | Enterprise member | Kanban inbox |

### 3.1 Public Profile Page `/agency/{handle}`

**Layout: Single scroll, no tabs. SSR (Next.js Server Component).**

```
┌─────────────────────────────────────────────────┐
│  [Org Name]  ★  (verified badge if eligible)    │
│  @handle  ·  description                        │
│                          [Hire Agency ▶]        │
├─────────────────────────────────────────────────┤
│  12 Members │ 34 Listings │ 98 Deploys │ ★ Plan │
├─────────────────────────────────────────────────┤
│  BUNDLES (shown only if org has approved bundles)│
│  [bundle card]  [bundle card]                   │
├─────────────────────────────────────────────────┤
│  LISTINGS                                       │
│  [listing card] [listing card] [listing card]   │
└─────────────────────────────────────────────────┘
```

- "Hire Agency" CTA links to `/marketplace?org={id}`
- Bundles section hidden if no approved bundles exist
- Listings: same `AgentListing` cards used in marketplace, active=TRUE only
- If handle not found → 404

### 3.2 Bundle Management `/enterprise/bundles`

**Layout: Inline table with expandable row editor.**

```
BUNDLES                                    [+ New Bundle]
──────────────────────────────────────────────────────
Name             Agents  Price     Status     Actions
──────────────────────────────────────────────────────
Full Auto Stack    3     $350/mo   ● APPROVED  [▼]
DevOps Pack        2     $280/mo   ● APPROVED  [▼]
AI SDR Bundle      0     —         ○ PENDING   [▼]
──────────────────────────────────────────────────────
```

**Expanded editor (click row ▼):**
- Left: checkbox list of org's APPROVED `agent_listings` — check to include in bundle
- Right: name input, description textarea, price input (cents stored, dollars displayed)
- Save → calls `PATCH /enterprise/orgs/{id}/bundles/{bundle_id}`; if items changed on an APPROVED bundle, badge updates to `PENDING REVIEW`
- Delete button with inline confirmation text ("Type DELETE to confirm")
- "＋ New Bundle" appends a dashed blank row; filling name + selecting listings + price → calls POST

### 3.3 Proposal Inbox `/enterprise/proposals`

**Layout: Kanban — 3 fixed columns.**

```
                              [Mine ○  All ●]  ← ADMIN only toggle

┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  DRAFT (4)      │  │  SENT (8)       │  │  CLOSED (2)     │
│                 │  │                 │  │                 │
│ ┌─────────────┐ │  │ ┌─────────────┐ │  │ ┌─────────────┐ │
│ │Data Pipeline│ │  │ │AI Automation│ │  │ │K8s Migration│ │
│ │bob.k · Mar23│ │  │ │alice.w      │ │  │ │alice.w      │ │
│ │client@co.io │ │  │ │client@co.io │ │  │ │Mar 18       │ │
│ └─────────────┘ │  │ └─────────────┘ │  │ └─────────────┘ │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

- Card click → opens existing proposal detail view
- No drag-and-drop — status changes happen within the proposal detail
- ADMIN toggle "Mine / All" defaults to "All"; MEMBER sees only "Mine" (toggle hidden)
- Status derived from `proposals.status` column (see migration 0057 mapping table)

### 3.4 Verified Badge Component

```tsx
// apps/web/components/VerifiedBadge.tsx
// Props: planTier: string
// Renders amber filled Star only when planTier === 'ENTERPRISE' || planTier === 'PLATINUM'
// <Star className="w-4 h-4 fill-amber-400 text-amber-400" title="Verified Agency" />
```

- Icon: Lucide `Star`, `fill-amber-400 text-amber-400 w-4 h-4`
- Tooltip: native `title="Verified Agency"` (no extra library)
- Used in: `AgencyProfilePage` hero (next to org name), `AgentListingCard` top-right corner
- `AgentListingCard` receives new prop `orgPlanTier?: string` — populated from GET /listings which now JOINs `organisations` via `agent_listings.org_id` to return `org_plan_tier` when set

---

## 4. Navigation

Add two links to the `/enterprise` sidebar nav:

```
Dashboard → Members → Proposals → Bundles → API Keys → SLA
```

---

## 5. Admin Integration

Bundle listings go through the existing `/admin/listings` moderation flow:
- Add "Bundles" tab to `/admin/listings` alongside "Agent Listings"
- Admin approve: sets `listing_status = 'APPROVED'` + `active = TRUE`
- Admin reject: sets `listing_status = 'REJECTED'` + `active = FALSE` + stores `rejection_reason`

---

## 6. api.ts / enterpriseApi.ts additions

```typescript
// apps/web/lib/api.ts — public profile
// Calls identity_service (:3001) via /api/identity/orgs/public/{handle} proxy
fetchAgencyProfile(handle: string): Promise<AgencyProfile>

// apps/web/lib/enterpriseApi.ts — bundles
// All 4 calls use mktBase() → marketplace_service (:3002)
fetchOrgBundles(orgId: string): Promise<{ bundles: Bundle[] }>
createBundle(orgId: string, req: CreateBundleRequest): Promise<{ bundle_id: string; listing_status: string }>
updateBundle(orgId: string, bundleId: string, req: Partial<CreateBundleRequest>): Promise<{ ok: boolean; listing_status: string }>
deleteBundle(orgId: string, bundleId: string): Promise<void>

// apps/web/lib/enterpriseApi.ts — proposal inbox
// Calls mktBase() → marketplace_service (:3002)
fetchOrgProposals(orgId: string): Promise<{ draft: Proposal[]; sent: Proposal[]; closed: Proposal[] }>

// apps/web/lib/adminApi.ts — admin bundle moderation
// Calls mktBase() → marketplace_service (:3002) admin routes
approveBundle(bundleId: string): Promise<void>
rejectBundle(bundleId: string, reason: string): Promise<void>
```

---

## 7. Scope Boundaries

**In scope:**
- All 4 features as described
- `handle` column on `organisations` (migration 0056)
- `org_id` FK on `agent_listings` (migration 0056)
- Bundle tables (migration 0056)
- `submitted_by_profile_id` + extended `status` CHECK on `proposals` (migration 0057)
- Admin bundle moderation

**Out of scope (YAGNI):**
- Drag-and-drop Kanban
- Bundle discount pricing (fixed price only)
- Agency search/directory browse page
- Plan upgrade flow
- Bundle analytics
- `closed_at` timestamp on proposals (status column is sufficient)
