# Agency Enterprise Features — Design Spec

> Applies to: AiStaff Enterprise Organisation model (`account_type = 'enterprise'`, `organisations` table)
> Date: 2026-03-25

---

## Overview

Four new features extending the Enterprise agency experience:

1. **Public Agency Profile** — discoverable + shareable page at `/agency/{handle}`
2. **Bundle Listings** — package multiple agent listings at a fixed price
3. **Proposal Inbox** — org-level Kanban view of team proposals
4. **Verified Badge** — amber star auto-granted to ENTERPRISE + PLATINUM plan tiers

Features 2 (Team Management) and 3 (Analytics Dashboard) already exist at `/enterprise/members` and `/enterprise`. No changes needed there.

---

## 1. Database

### Migration 0056 — Bundle tables

```sql
CREATE TABLE listing_bundles (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id         UUID        NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    name           TEXT        NOT NULL,
    description    TEXT,
    price_cents    BIGINT      NOT NULL CHECK (price_cents > 0),
    listing_status TEXT        NOT NULL DEFAULT 'PENDING_REVIEW',
    active         BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
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

### Migration 0057 — Proposal profile FK

```sql
ALTER TABLE proposals
    ADD COLUMN submitted_by_profile_id UUID REFERENCES unified_profiles(id);

CREATE INDEX idx_proposals_submitted_by ON proposals(submitted_by_profile_id);
```

Nullable — existing rows remain NULL. All new proposal submissions must populate this field.

### No new columns for Verified Badge

Badge is computed: `plan_tier IN ('ENTERPRISE', 'PLATINUM')`. No DB column required.

---

## 2. Backend API

### identity_service (:3001)

#### `GET /agencies/public/{handle}`
- **Auth**: none (public endpoint)
- **Logic**: look up `organisations` by `handle` (need `handle` column — see note below), join `org_members` count, join active `agent_listings` count, join completed deployments count from `deployments`
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

> **Note**: `organisations` table currently has no `handle` column. Add it in migration 0056 alongside the bundle tables:
> ```sql
> ALTER TABLE organisations ADD COLUMN handle TEXT UNIQUE;
> CREATE INDEX idx_organisations_handle ON organisations(handle);
> ```
> Handle is optional initially (nullable). Org owners set it in `/enterprise` settings. Profile page only renders if handle is set.

### marketplace_service (:3002)

#### `GET /enterprise/orgs/{id}/bundles`
- **Auth**: org member (ADMIN or MEMBER)
- **Response**: `{ bundles: [{ id, name, description, price_cents, listing_status, active, item_count, items: [{ listing_id, name, price_cents, display_order }], created_at }] }`

#### `POST /enterprise/orgs/{id}/bundles`
- **Auth**: org ADMIN only
- **Body**: `{ name, description?, price_cents, listing_ids: uuid[] }`
- **Logic**: insert `listing_bundles` record + `bundle_items` rows in a transaction. Validates all `listing_ids` belong to `org_id`. Sets `listing_status = 'PENDING_REVIEW'`, `active = FALSE`.
- **Response**: 201 `{ bundle_id, listing_status: "PENDING_REVIEW" }`
- **Idempotency**: none required (not financial)

#### `DELETE /enterprise/orgs/{id}/bundles/{bundle_id}`
- **Auth**: org ADMIN only
- **Logic**: hard delete (cascade deletes `bundle_items`). Only allowed if `listing_status != 'APPROVED'` or admin explicitly confirmed. Returns 204.

#### `GET /enterprise/orgs/{id}/proposals`
- **Auth**: org member
- **Logic**:
  - ADMIN: fetch all proposals WHERE `submitted_by_profile_id IN (SELECT profile_id FROM org_members WHERE org_id = $1)`
  - MEMBER: fetch proposals WHERE `submitted_by_profile_id = $caller_profile_id`
  - Returns proposals grouped by status: `DRAFT`, `SUBMITTED` (maps to "Sent"), `CLOSED`
- **Response**: `{ draft: [...], sent: [...], closed: [...] }` — each item: `{ id, job_title, freelancer_email, client_email, submitted_at, submitted_by_profile_id, submitter_name }`

---

## 3. Frontend

### New Routes

| Route | Component | Auth | Description |
|---|---|---|---|
| `/agency/{handle}` | `AgencyProfilePage` | None | Public profile — single scroll |
| `/enterprise/bundles` | `BundlesPage` | Enterprise member | Bundle management — inline table |
| `/enterprise/proposals` | `ProposalsInboxPage` | Enterprise member | Kanban inbox |

### 3.1 Public Profile Page `/agency/{handle}`

**Layout: Single scroll, no tabs.**

```
┌─────────────────────────────────────────────────┐
│  [Org Name]  ★  (verified badge if eligible)    │
│  @handle  ·  description                        │
│                          [Hire Agency ▶]        │
├─────────────────────────────────────────────────┤
│  12 Members │ 34 Listings │ 98 Deploys │ 4.9 ★  │
├─────────────────────────────────────────────────┤
│  BUNDLES (if any)                               │
│  ┌──────────────────────┐ ┌───────────────────┐ │
│  │ Full Automation Stack│ │  DevOps Pack      │ │
│  │ 3 agents · $350/mo   │ │  2 agents · $280  │ │
│  └──────────────────────┘ └───────────────────┘ │
├─────────────────────────────────────────────────┤
│  LISTINGS                                       │
│  [listing card] [listing card] [listing card]   │
│  [listing card] [listing card] [listing card]   │
└─────────────────────────────────────────────────┘
```

- "Hire Agency" CTA scrolls to listings or links to `/marketplace?org={id}`
- Bundles section hidden if org has no approved bundles
- Listings are the same `AgentListing` cards used in marketplace — active=TRUE only
- Page is SSR (Next.js Server Component) for SEO + LLM crawler indexing
- If `handle` not found or not set → 404

### 3.2 Bundle Management `/enterprise/bundles`

**Layout: Inline table with expandable editor.**

```
BUNDLES                                    [+ New Bundle]
──────────────────────────────────────────────────────────
Name             Agents  Price     Status     Actions
──────────────────────────────────────────────────────────
Full Auto Stack    3     $350/mo   ● APPROVED  [▼ Edit]
DevOps Pack        2     $280/mo   ● APPROVED  [▼ Edit]
AI SDR Bundle      0     —         ○ PENDING   [▼ Edit]
──────────────────────────────────────────────────────────
[new bundle row — dashed border when adding]
```

**Expanded editor (click row):**
- Left: checkbox list of all org's APPROVED listings → select which are in bundle
- Right: bundle name input, description textarea, price input
- Save → PATCH bundle; if previously APPROVED and items change → back to PENDING_REVIEW
- Delete button with confirmation

### 3.3 Proposal Inbox `/enterprise/proposals`

**Layout: Kanban — 3 fixed columns.**

```
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  DRAFT (4)      │  │  SENT (8)       │  │  CLOSED (2)     │
│                 │  │                 │  │                 │
│ ┌─────────────┐ │  │ ┌─────────────┐ │  │ ┌─────────────┐ │
│ │Data Pipeline│ │  │ │AI Automation│ │  │ │K8s Migration│ │
│ │bob.k        │ │  │ │alice.w      │ │  │ │alice.w      │ │
│ │Mar 23       │ │  │ │client@co.io │ │  │ │Mar 18       │ │
│ └─────────────┘ │  │ └─────────────┘ │  │ └─────────────┘ │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

- **Top-right toggle** (ADMIN only): "Mine / All" — defaults to All for ADMIN, Mine always for MEMBER
- Card click → opens proposal detail (existing `/proposals` view)
- No drag-and-drop between columns — status changes happen in the proposal detail
- Status mapping: `proposals` table has no explicit status column today — use `submitted_at IS NULL → DRAFT`, `submitted_at IS NOT NULL AND closed_at IS NULL → SENT`, `closed_at IS NOT NULL → CLOSED`. Add `closed_at TIMESTAMPTZ` to proposals in migration 0057.

### 3.4 Verified Badge Component

```tsx
// apps/web/components/VerifiedBadge.tsx
// Renders an amber filled Star icon with tooltip "Verified Agency"
// Props: planTier: string
// Renders only when planTier === 'ENTERPRISE' || planTier === 'PLATINUM'
```

- Icon: Lucide `Star`, `className="w-4 h-4 fill-amber-400 text-amber-400"`
- Tooltip: native `title="Verified Agency"` attribute (no custom tooltip library)
- Used in: `AgencyProfilePage` hero, `AgentListingCard` top-right corner
- `AgentListingCard` must receive `org_plan_tier?: string` prop — populated from GET /listings response (need to add `org_plan_tier` to listing response when listing belongs to an org)

---

## 4. Navigation

Add "Proposals" link to the existing `/enterprise` sidebar nav, between "Members" and "API Keys":

```
Dashboard → Members → Proposals → API Keys → SLA
```

Add "Bundles" link after "Proposals":

```
Dashboard → Members → Proposals → Bundles → API Keys → SLA
```

---

## 5. Admin Integration

Bundle listings go through the existing `/admin/listings` moderation flow:
- `listing_bundles.listing_status` uses same `PENDING_REVIEW → APPROVED / REJECTED` states
- Add "Bundles" tab to `/admin/listings` alongside "Agent Listings" tab
- Admin approve/reject endpoints added: `POST /admin/bundles/{id}/approve`, `POST /admin/bundles/{id}/reject`

---

## 6. api.ts additions

```typescript
// Bundles
fetchOrgBundles(orgId: string): Promise<{ bundles: Bundle[] }>
createBundle(orgId: string, req: CreateBundleRequest): Promise<{ bundle_id: string }>
deleteBundle(orgId: string, bundleId: string): Promise<void>

// Proposals inbox
fetchOrgProposals(orgId: string): Promise<{ draft: Proposal[], sent: Proposal[], closed: Proposal[] }>

// Public profile
fetchAgencyProfile(handle: string): Promise<AgencyProfile>
```

---

## 7. Scope Boundaries

**In scope:**
- All 4 features as described above
- `handle` column on `organisations`
- `closed_at` + `submitted_by_profile_id` on `proposals`
- Bundle admin moderation endpoints

**Out of scope (YAGNI):**
- Drag-and-drop Kanban
- Bundle discount pricing (fixed price only, per decision)
- Agency search/directory page (profile is shareable link; discovery is via marketplace filters)
- Plan upgrade flow
- Bundle analytics
