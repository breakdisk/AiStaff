# AiTalent Dashboard Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform `/dashboard` into a role-aware page — `role === "talent"` sees a freelancer-specific widget set (Invitations, Engagements, Earnings, Stats Strip, Profile Completeness, trust/vetting/identity); all other roles see the existing operator layout unchanged.

**Architecture:** Single `/dashboard` route keeps its existing session-fetching logic and inline sidebar. After session loads, the main content area branches: `role === "talent"` → `<TalentDashboardContent session={session} />`; else → `<OperatorDashboardContent>` wrapping the existing operator JSX. A new migration adds `github_followers` and `github_stars` to `unified_profiles`; those fields flow through the Rust OAuth handler → public profile endpoint → `api.ts` → `TalentStatsStrip`.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind 4, `pg` Pool for DB routes, Rust/Axum for `identity_service`, SQLx non-macro queries.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `migrations/0045_github_social_stats.sql` | **Create** | Add `github_followers` + `github_stars` columns to `unified_profiles` |
| `crates/common/src/types/identity.rs` | **Modify** | Add `github_followers: Option<u32>` + `github_stars: Option<u32>` to `OAuthCallbackPayload` |
| `crates/identity_service/src/oauth_handler.rs` | **Modify** | Persist `github_followers` + `github_stars` during GitHub `link_provider` |
| `crates/identity_service/src/main.rs` | **Modify** | Add fields to `PublicProfileResponse` struct + SELECT + response build |
| `apps/web/auth.ts` | **Modify** | Expand `githubExtra` type; add new fields to `OAuthCallbackPayload`; pass values |
| `apps/web/lib/roi.ts` | **Create** | Export `roiToReputation(roi: RoiReport)` moved from `page.tsx` |
| `apps/web/lib/api.ts` | **Modify** | Add `github_followers?` + `github_stars?` to `PublicProfile`; add `TalentPayout` + `fetchTalentPayouts()` |
| `apps/web/app/api/talent/payouts/route.ts` | **Create** | `GET` — last 3 payouts from `escrow_payouts` for session user |
| `apps/web/components/MyEngagementsWidget.tsx` | **Create** | Extract "My Engagements" JSX from `page.tsx` into a reusable widget |
| `apps/web/components/TalentInvitationsWidget.tsx` | **Create** | Pending invitations with inline Accept/Decline |
| `apps/web/components/TalentEarningsWidget.tsx` | **Create** | Last 3 payouts table |
| `apps/web/components/TalentStatsStrip.tsx` | **Create** | 4-column strip: Followers · Repos · Completed Jobs · Reputation |
| `apps/web/components/TalentProfileCompletenessWidget.tsx` | **Create** | Amber progress bar with missing-field nudges; hides at 100% |
| `apps/web/components/TalentDashboardContent.tsx` | **Create** | Composes all talent widgets; fetches its own data |
| `apps/web/app/dashboard/page.tsx` | **Modify** | Remove inline `roiToReputation`; add role check; wrap operator JSX in `OperatorDashboardContent` |

---

## Task 1: DB Migration — github_followers + github_stars

**Files:**
- Create: `migrations/0045_github_social_stats.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- migrations/0045_github_social_stats.sql
ALTER TABLE unified_profiles
  ADD COLUMN IF NOT EXISTS github_followers INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS github_stars     INTEGER NOT NULL DEFAULT 0;
```

> `github_followers` = GitHub follower count (from GitHub API `/user` response field `followers`).
> `github_stars` = public repo count stored as a proxy for stars (avoids an extra API call during OAuth; display label in UI is "Repos").

- [ ] **Step 2: Verify migration applies cleanly (requires live Postgres)**

```bash
docker compose up -d postgres
sqlx migrate run
```
Expected: `Applied 0045_github_social_stats` with no errors.

> If Postgres is not running locally, skip this step — the SQLx offline cache approach means the migration is validated at deploy time.

- [ ] **Step 3: Commit**

```bash
git add migrations/0045_github_social_stats.sql
git commit -m "feat(db): add github_followers + github_stars to unified_profiles (migration 0045)"
```

---

## Task 2: Rust — OAuthCallbackPayload New Fields

**Files:**
- Modify: `crates/common/src/types/identity.rs` (lines 83–98)

The `OAuthCallbackPayload` struct currently has `github_repos` and `github_created_at`. Add two more optional fields.

- [ ] **Step 1: Add fields to `OAuthCallbackPayload`**

In `crates/common/src/types/identity.rs`, find the `OAuthCallbackPayload` struct and add after `github_created_at`:

```rust
/// GitHub follower count — present only for GitHub provider.
pub github_followers: Option<u32>,
/// GitHub public repos count (used as star-count proxy) — present only for GitHub provider.
pub github_stars: Option<u32>,
```

Full updated struct (lines 83–99):
```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OAuthCallbackPayload {
    pub provider: OAuthProvider,
    pub provider_uid: String,
    pub email: String,
    pub display_name: String,
    pub github_repos: Option<u32>,
    pub github_created_at: Option<DateTime<Utc>>,
    pub email_verified: Option<bool>,
    pub existing_profile_id: Option<Uuid>,
    // NEW ↓
    pub github_followers: Option<u32>,
    pub github_stars: Option<u32>,
}
```

- [ ] **Step 2: Cargo check**

```bash
powershell -File C:\Users\Admin\AppData\Local\Temp\full_check.ps1
```
Expected: zero errors in `crates/common`.

- [ ] **Step 3: Commit**

```bash
git add crates/common/src/types/identity.rs
git commit -m "feat(common): add github_followers + github_stars to OAuthCallbackPayload"
```

---

## Task 3: Rust — Persist Followers/Stars in oauth_handler.rs

**Files:**
- Modify: `crates/identity_service/src/oauth_handler.rs` (the `link_provider` function, GitHub arm)

The `link_provider` function updates the `github_uid` and `github_connected_at` columns. Extend the GitHub `UPDATE` to also write `github_followers` and `github_stars`.

- [ ] **Step 1: Update the GitHub arm of `link_provider`**

> First, open `crates/identity_service/src/oauth_handler.rs` and find the existing `OAuthProvider::GitHub` arm. Verify it currently has exactly two `.bind()` calls (`p.provider_uid` and `id`). If the file has diverged, adjust the new query's binding order to match.

Find the `OAuthProvider::GitHub` arm in `link_provider` (around line 155) and replace:

```rust
OAuthProvider::GitHub => sqlx::query(
    "UPDATE unified_profiles
         SET github_uid = $1, github_connected_at = NOW(), updated_at = NOW()
         WHERE id = $2",
)
.bind(&p.provider_uid)
.bind(id),
```

With:

```rust
OAuthProvider::GitHub => sqlx::query(
    "UPDATE unified_profiles
         SET github_uid = $1, github_connected_at = NOW(),
             github_followers = COALESCE($3, github_followers),
             github_stars     = COALESCE($4, github_stars),
             updated_at = NOW()
         WHERE id = $2",
)
.bind(&p.provider_uid)
.bind(id)
.bind(p.github_followers.map(|v| v as i32))
.bind(p.github_stars.map(|v| v as i32)),
```

> `COALESCE($3, github_followers)` preserves existing value when the payload omits followers (e.g., connect-provider flow where the data isn't freshly fetched).

- [ ] **Step 2: Cargo check**

```bash
powershell -File C:\Users\Admin\AppData\Local\Temp\full_check.ps1
```
Expected: zero errors in `crates/identity_service`.

- [ ] **Step 3: Commit**

```bash
git add crates/identity_service/src/oauth_handler.rs
git commit -m "feat(identity): persist github_followers + github_stars on GitHub OAuth login"
```

---

## Task 4: Rust — Public Profile Endpoint Returns New Fields

**Files:**
- Modify: `crates/identity_service/src/main.rs` (around lines 272–342)

The `public_profile` handler needs to SELECT, deserialize, and return the two new columns.

- [ ] **Step 1: Add fields to `PublicProfileResponse`**

Find `struct PublicProfileResponse` (around line 276) and add two new fields:

```rust
#[derive(Debug, Serialize)]
struct PublicProfileResponse {
    profile_id: Uuid,
    display_name: String,
    trust_score: i16,
    identity_tier: String,
    github_connected: bool,
    linkedin_connected: bool,
    google_connected: bool,
    bio: Option<String>,
    hourly_rate_cents: Option<i32>,
    availability: Option<String>,
    role: Option<String>,
    // NEW ↓
    github_followers: i32,
    github_stars: i32,
}
```

- [ ] **Step 2: Update the SELECT query to fetch the new columns**

Find the SQL query in `public_profile` (around line 298–303) and replace:

```rust
let res = sqlx::query(
    "SELECT display_name, trust_score, identity_tier::TEXT AS identity_tier,
            github_uid, linkedin_uid, google_uid,
            bio, hourly_rate_cents, availability, role
     FROM unified_profiles WHERE id = $1",
)
```

With:

```rust
let res = sqlx::query(
    "SELECT display_name, trust_score, identity_tier::TEXT AS identity_tier,
            github_uid, linkedin_uid, google_uid,
            bio, hourly_rate_cents, availability, role,
            github_followers, github_stars
     FROM unified_profiles WHERE id = $1",
)
```

- [ ] **Step 3: Read the new columns in the `Ok(Some(row))` arm and include in response**

After `let role: Option<String> = row.get("role");` (around line 319), add:

```rust
let github_followers: i32 = row.get("github_followers");
let github_stars:     i32 = row.get("github_stars");
```

In the `Json(PublicProfileResponse { ... })` block, add:

```rust
github_followers,
github_stars,
```

- [ ] **Step 4: Cargo check**

```bash
powershell -File C:\Users\Admin\AppData\Local\Temp\full_check.ps1
```
Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
git add crates/identity_service/src/main.rs
git commit -m "feat(identity): return github_followers + github_stars from public profile endpoint"
```

---

## Task 5: auth.ts — Pass github_followers to Identity Service

**Files:**
- Modify: `apps/web/auth.ts` (lines 14–23 and 37, 39–54)

Two changes: (a) expand the `githubExtra` type to include `followers`, (b) add the new fields to `OAuthCallbackPayload` interface and pass them in the payload builder.

- [ ] **Step 1: Expand the `OAuthCallbackPayload` interface**

Find the interface at the top of the file (lines 14–23) and add two new optional fields:

```typescript
interface OAuthCallbackPayload {
  provider: "github" | "google" | "linkedin";
  provider_uid: string;
  email: string;
  display_name: string;
  github_repos?: number;
  github_created_at?: string;
  email_verified?: boolean;
  existing_profile_id?: string;
  // NEW ↓
  github_followers?: number;
  github_stars?: number;
}
```

- [ ] **Step 2: Expand `githubExtra` type annotation**

Find (line 37):
```typescript
let githubExtra: { public_repos: number; created_at: string } | undefined;
```

Replace with:
```typescript
let githubExtra: { public_repos: number; created_at: string; followers: number } | undefined;
```

- [ ] **Step 3: Pass new fields in the payload builder**

In the `payload` object (lines 39–54), after `github_created_at`, add:

```typescript
github_followers: githubExtra?.followers,
github_stars:     githubExtra?.public_repos,
```

Full updated payload block:
```typescript
const payload: OAuthCallbackPayload = {
  provider: account.provider as "github" | "google" | "linkedin",
  provider_uid: String(account.providerAccountId),
  email: (profile as { email?: string }).email ?? "",
  display_name: (profile as { name?: string }).name ?? "",
  email_verified: (() => {
    const raw = (profile as { email_verified?: unknown }).email_verified;
    if (raw === true || raw === "true") return true;
    if (raw === false || raw === "false") return false;
    return undefined;
  })(),
  github_repos:     githubExtra?.public_repos,
  github_created_at: githubExtra?.created_at,
  github_followers: githubExtra?.followers,
  github_stars:     githubExtra?.public_repos,
};
```

- [ ] **Step 4: TypeScript check**

```bash
cd apps/web && npx tsc --noEmit
```
Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/auth.ts
git commit -m "feat(auth): pass github_followers + github_stars to identity_service OAuth callback"
```

---

## Task 6: Extract roiToReputation to lib/roi.ts

**Files:**
- Create: `apps/web/lib/roi.ts`
- Modify: `apps/web/app/dashboard/page.tsx` (remove inline definition, add import)

The `roiToReputation` function at line 165 in `page.tsx` needs to be in a shared module so `TalentDashboardContent` can import it without creating a circular dependency.

- [ ] **Step 1: Create `apps/web/lib/roi.ts`**

```typescript
import type { RoiReport } from "@/lib/api";

export function roiToReputation(roi: RoiReport) {
  const driftRate   = roi.total_deployments > 0
    ? roi.drift_incidents / roi.total_deployments : 0;
  const volumeScore = Math.min(roi.total_deployments / 20, 1.0);
  const reputationScore =
    0.4 * roi.avg_checklist_pass_pct +
    0.3 * (1 - driftRate) * 100 +
    0.2 * roi.reputation_score +
    0.1 * volumeScore * 100;

  return {
    talentId:         roi.talent_id,
    reputationScore:  Math.round(reputationScore * 10) / 10,
    totalDeployments: roi.total_deployments,
    totalEarnedCents: roi.total_earned_cents,
    driftIncidents:   roi.drift_incidents,
    vcIssued:         false,
  };
}
```

- [ ] **Step 2: Remove inline `roiToReputation` from `page.tsx` and add import**

In `apps/web/app/dashboard/page.tsx`, delete the function at lines 165–183:

```typescript
function roiToReputation(roi: RoiReport) {
  // ... (entire function body, 18 lines)
}
```

Add this import at the top of the file with the other imports:

```typescript
import { roiToReputation } from "@/lib/roi";
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd apps/web && npx tsc --noEmit
```
Expected: zero errors — `roiToReputation` is still called in the same useEffect at line ~249 (now resolved via import).

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/roi.ts apps/web/app/dashboard/page.tsx
git commit -m "refactor: extract roiToReputation to apps/web/lib/roi.ts"
```

---

## Task 7: api.ts — Add PublicProfile Fields + TalentPayout

**Files:**
- Modify: `apps/web/lib/api.ts` (around lines 230–249)

- [ ] **Step 1: Add new fields to `PublicProfile` interface**

Find `export interface PublicProfile` (around line 230) and add two optional fields after `role`:

```typescript
export interface PublicProfile {
  profile_id:         string;
  display_name:       string;
  trust_score:        number;
  identity_tier:      string;
  github_connected:   boolean;
  linkedin_connected: boolean;
  google_connected:   boolean;
  bio:                string | null;
  hourly_rate_cents:  number | null;
  availability:       string | null;
  role:               string | null;
  // NEW ↓
  github_followers?:  number;
  github_stars?:      number;
}
```

- [ ] **Step 2: Add `TalentPayout` interface and `fetchTalentPayouts` function**

After the `fetchPublicProfile` function (around line 249), add:

```typescript
export interface TalentPayout {
  id:           string;
  released_at:  string;   // ISO timestamp from escrow_payouts.created_at
  agent_name:   string;   // COALESCE(agent_listings.name, 'Deleted Listing')
  amount_cents: number;
  status:       "RELEASED";
}

export function fetchTalentPayouts(): Promise<TalentPayout[]> {
  return apiFetch("/api/talent/payouts");
}
```

- [ ] **Step 3: TypeScript check**

```bash
cd apps/web && npx tsc --noEmit
```
Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/api.ts
git commit -m "feat(api): add github_followers/stars to PublicProfile; add TalentPayout + fetchTalentPayouts"
```

---

## Task 8: New API Route — GET /api/talent/payouts

**Files:**
- Create: `apps/web/app/api/talent/payouts/route.ts`

This route queries `escrow_payouts` joined to `deployments` + `agent_listings` to return the last 3 payouts for the session user.

The `escrow_payouts` table schema (migration 0004):
- `id UUID`, `deployment_id UUID`, `recipient_id UUID`, `amount_cents BIGINT`, `reason TEXT`, `created_at TIMESTAMPTZ`

The `deployments.agent_id` has no FK constraint, so we LEFT JOIN `agent_listings`.

- [ ] **Step 1: Create the route file**

```typescript
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { Pool } from "pg";
import { auth } from "@/auth";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
  idleTimeoutMillis: 30_000,
});

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  const recipientId = (session?.user as { profileId?: string })?.profileId;
  if (!recipientId) {
    return NextResponse.json([], { status: 401 });
  }

  let client;
  try {
    client = await pool.connect();
    const result = await client.query(
      `SELECT ep.id,
              ep.created_at                        AS released_at,
              ep.amount_cents,
              COALESCE(al.name, 'Deleted Listing') AS agent_name,
              'RELEASED'                           AS status
         FROM escrow_payouts  ep
         JOIN deployments     d  ON d.id  = ep.deployment_id
         LEFT JOIN agent_listings al ON al.id = d.agent_id
        WHERE ep.recipient_id = $1
        ORDER BY ep.created_at DESC
        LIMIT 3`,
      [recipientId],
    );
    return NextResponse.json(result.rows);
  } catch (err) {
    console.error("[GET /api/talent/payouts]", err);
    return NextResponse.json([]);
  } finally {
    client?.release();
  }
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd apps/web && npx tsc --noEmit
```
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/api/talent/payouts/route.ts
git commit -m "feat(api): add GET /api/talent/payouts — last 3 escrow payouts for talent"
```

---

## Task 9: MyEngagementsWidget Component

**Files:**
- Create: `apps/web/components/MyEngagementsWidget.tsx`

Extract the "My Engagements" section from `dashboard/page.tsx` (lines 519–557) into a standalone component. The component fetches its own data from `/api/marketplace/my-deployments`.

- [ ] **Step 1: Create `MyEngagementsWidget.tsx`**

```typescript
"use client";

import { useState, useEffect } from "react";
import { MessageSquare, ExternalLink } from "lucide-react";

interface Engagement {
  id:                  string;
  agent_name:          string;
  state:               string;
  escrow_amount_cents: number;
  created_at:          string;
}

export default function MyEngagementsWidget() {
  const [engagements, setEngagements] = useState<Engagement[] | null>(null);

  useEffect(() => {
    fetch("/api/marketplace/my-deployments")
      .then(r => r.ok ? r.json() : [])
      .then(setEngagements)
      .catch(() => setEngagements([]));
  }, []);

  const stateCls = (state: string) =>
    state === "RELEASED" ? "text-emerald-400" :
    state === "VETOED"   ? "text-red-400" :
    state === "FAILED"   ? "text-red-500" :
    "text-amber-400";

  if (engagements === null) {
    return (
      <div className="border border-zinc-800 rounded-sm px-3 py-3">
        <p className="font-mono text-[10px] text-zinc-600">Loading…</p>
      </div>
    );
  }

  if (engagements.length === 0) {
    return (
      <div className="border border-zinc-800 rounded-sm px-3 py-4 text-center">
        <p className="font-mono text-[10px] text-zinc-600">No engagements yet</p>
        <a
          href="/marketplace"
          className="inline-flex items-center gap-1 mt-2 font-mono text-[9px] text-amber-400 hover:text-amber-300"
        >
          <ExternalLink className="w-2.5 h-2.5" /> Browse Marketplace
        </a>
      </div>
    );
  }

  return (
    <div className="border border-zinc-800 rounded-sm overflow-hidden">
      <div className="divide-y divide-zinc-800">
        {engagements.map(eng => (
          <div key={eng.id} className="flex items-center justify-between gap-2 px-3 py-2.5">
            <div className="min-w-0">
              <p className="font-mono text-xs text-zinc-100 truncate">{eng.agent_name}</p>
              <p className="font-mono text-[9px] text-zinc-600">
                {eng.created_at} · <span className={stateCls(eng.state)}>{eng.state}</span>
              </p>
              <p className="font-mono text-[9px] text-zinc-600 mt-0.5 select-all">{eng.id}</p>
            </div>
            <a
              href={`/collab?deployment_id=${eng.id}`}
              className="flex-shrink-0 flex items-center gap-1 font-mono text-[9px] text-amber-400 border border-amber-900 bg-amber-950/40 px-2 h-6 rounded-sm hover:border-amber-700 transition-colors"
            >
              <MessageSquare className="w-2.5 h-2.5" /> Collaborate
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/MyEngagementsWidget.tsx
git commit -m "feat(ui): extract MyEngagementsWidget from dashboard/page.tsx"
```

---

## Task 10: TalentInvitationsWidget Component

**Files:**
- Create: `apps/web/components/TalentInvitationsWidget.tsx`

Fetches `GET /api/matching/invitations/received` (already exists), filters `status === "PENDING"`, shows inline Accept/Decline with spinner. Uses `respondToInvitation` from `api.ts` (already exists).

- [ ] **Step 1: Create `TalentInvitationsWidget.tsx`**

```typescript
"use client";

import { useState, useEffect } from "react";
import { Loader2, Mail } from "lucide-react";
import {
  fetchReceivedInvitations,
  respondToInvitation,
  type ReceivedInvitation,
} from "@/lib/api";

export default function TalentInvitationsWidget() {
  const [invitations, setInvitations] = useState<ReceivedInvitation[] | null>(null);
  const [responding, setResponding] = useState<string | null>(null);

  useEffect(() => {
    fetchReceivedInvitations()
      .then(data => setInvitations(data.invitations))
      .catch(() => setInvitations([]));
  }, []);

  const pending = (invitations ?? []).filter(i => i.status === "PENDING");

  async function handleRespond(id: string, action: "accept" | "decline") {
    setResponding(id);
    try {
      await respondToInvitation(id, action);
      setInvitations(prev =>
        (prev ?? []).map(inv =>
          inv.id === id
            ? { ...inv, status: action === "accept" ? "ACCEPTED" : "DECLINED" }
            : inv,
        ),
      );
    } catch {
      // silently degrade — keep card visible
    } finally {
      setResponding(null);
    }
  }

  // Loading
  if (invitations === null) {
    return (
      <div className="border border-zinc-800 rounded-sm p-3 space-y-2">
        {[0, 1].map(i => (
          <div key={i} className="h-4 bg-zinc-800 rounded-sm animate-pulse" />
        ))}
      </div>
    );
  }

  // Empty state
  if (pending.length === 0) {
    return (
      <div className="border border-zinc-800 rounded-sm px-3 py-2.5 flex items-center justify-between">
        <span className="flex items-center gap-2 font-mono text-[10px] text-zinc-600">
          <Mail className="w-3 h-3" /> No new invitations
        </span>
        <a href="/invitations" className="font-mono text-[10px] text-amber-600 hover:text-amber-400 transition-colors">
          View all →
        </a>
      </div>
    );
  }

  const first = pending[0];
  const more  = pending.length - 1;

  return (
    <div className="border border-amber-900 bg-zinc-950 rounded-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-amber-950/40 border-b border-amber-900">
        <span className="flex items-center gap-2 font-mono text-xs text-amber-400">
          <Mail className="w-3 h-3" /> PENDING INVITATIONS
        </span>
        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-sm bg-amber-900/60 text-amber-300">
          {pending.length} new
        </span>
      </div>

      {/* First pending card */}
      <div className="px-3 py-3 border-b border-zinc-800">
        <p className="font-mono text-xs text-amber-300 font-medium">{first.client_name || "Client"}</p>
        {first.listing_title && (
          <p className="font-mono text-[10px] text-zinc-500 mt-0.5">{first.listing_title}</p>
        )}
        {first.message && (
          <p className="font-mono text-[10px] text-zinc-400 mt-1 line-clamp-2">
            &ldquo;{first.message.slice(0, 120)}{first.message.length > 120 ? "…" : ""}&rdquo;
          </p>
        )}
        <div className="flex gap-2 mt-2">
          <button
            disabled={responding === first.id}
            onClick={() => handleRespond(first.id, "accept")}
            className="flex-1 flex items-center justify-center gap-1 h-7 font-mono text-[10px] text-emerald-400 bg-emerald-950/40 border border-emerald-900 rounded-sm hover:border-emerald-700 disabled:opacity-50 transition-colors"
          >
            {responding === first.id ? <Loader2 className="w-3 h-3 animate-spin" /> : "Accept"}
          </button>
          <button
            disabled={responding === first.id}
            onClick={() => handleRespond(first.id, "decline")}
            className="flex-1 flex items-center justify-center gap-1 h-7 font-mono text-[10px] text-zinc-400 bg-zinc-900 border border-zinc-700 rounded-sm hover:border-zinc-500 disabled:opacity-50 transition-colors"
          >
            {responding === first.id ? <Loader2 className="w-3 h-3 animate-spin" /> : "Decline"}
          </button>
        </div>
        {more > 0 && (
          <p className="font-mono text-[10px] text-zinc-600 mt-2">+{more} more pending</p>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-2">
        <a href="/invitations" className="font-mono text-[10px] text-amber-600 hover:text-amber-400 transition-colors">
          View all invitations →
        </a>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/TalentInvitationsWidget.tsx
git commit -m "feat(ui): TalentInvitationsWidget — pending invitations with inline Accept/Decline"
```

---

## Task 11: TalentEarningsWidget Component

**Files:**
- Create: `apps/web/components/TalentEarningsWidget.tsx`

Fetches `GET /api/talent/payouts`, renders 4-column table. Empty state if no payouts.

- [ ] **Step 1: Create `TalentEarningsWidget.tsx`**

```typescript
"use client";

import { useState, useEffect } from "react";
import { fetchTalentPayouts, type TalentPayout } from "@/lib/api";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatCents(cents: number): string {
  return "$" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export default function TalentEarningsWidget() {
  const [payouts, setPayouts]   = useState<TalentPayout[] | null>(null);

  useEffect(() => {
    fetchTalentPayouts()
      .then(setPayouts)
      .catch(() => setPayouts([]));
  }, []);

  if (payouts === null) {
    return (
      <div className="border border-zinc-800 rounded-sm p-3 space-y-2">
        {[0, 1, 2].map(i => (
          <div key={i} className="h-4 bg-zinc-800 rounded-sm animate-pulse" />
        ))}
      </div>
    );
  }

  if (payouts.length === 0) {
    return (
      <div className="border border-zinc-800 rounded-sm px-3 py-4 text-center">
        <p className="font-mono text-[10px] text-zinc-600">
          No payouts yet — complete your first engagement
        </p>
      </div>
    );
  }

  return (
    <div className="border border-zinc-800 rounded-sm overflow-hidden">
      {/* Header row */}
      <div className="grid grid-cols-4 px-3 py-1.5 border-b border-zinc-800 bg-zinc-900/40">
        {["Date", "Project", "Amount", "Status"].map(h => (
          <span key={h} className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest">{h}</span>
        ))}
      </div>
      {/* Data rows */}
      <div className="divide-y divide-zinc-800/60">
        {payouts.map(p => (
          <div key={p.id} className="grid grid-cols-4 items-center px-3 py-2 gap-1">
            <span className="font-mono text-[10px] text-zinc-400">{formatDate(p.released_at)}</span>
            <span className="font-mono text-[10px] text-zinc-300 truncate" title={p.agent_name}>{p.agent_name}</span>
            <span className="font-mono text-[10px] text-emerald-400 tabular-nums">{formatCents(p.amount_cents)}</span>
            <span className="inline-flex">
              <span className="font-mono text-[9px] px-1.5 py-0.5 rounded-sm border border-emerald-900 text-emerald-400 bg-emerald-950/40">
                Released
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/TalentEarningsWidget.tsx
git commit -m "feat(ui): TalentEarningsWidget — last 3 payouts table"
```

---

## Task 12: TalentStatsStrip Component

**Files:**
- Create: `apps/web/components/TalentStatsStrip.tsx`

4-column stat strip: GitHub Followers · GitHub Repos (proxy for stars) · Completed Jobs · Reputation.

Props come from the parent (`TalentDashboardContent`) to avoid duplicate API calls.

> **Note on `repos` / stars:** Summing real star counts requires an additional GitHub API call per repo which adds OAuth latency. The plan uses `public_repos` count (already in the `/user` response) as a proxy. The column in DB is `github_stars` but the value stored is `public_repos`. The UI label is "Repos" (not "★ Stars") to accurately reflect what the number represents.

- [ ] **Step 1: Create `TalentStatsStrip.tsx`**

```typescript
interface TalentStatsStripProps {
  followers:       number | null;   // github_followers — null if GitHub not connected
  repos:           number | null;   // github_stars (public_repos proxy) — null if not connected
  completedJobs:   number;          // roiToReputation(roi).totalDeployments
  reputationScore: number;          // roiToReputation(roi).reputationScore
}

export default function TalentStatsStrip({
  followers, repos, completedJobs, reputationScore,
}: TalentStatsStripProps) {
  const repColor =
    reputationScore >= 70 ? "text-emerald-400" :
    reputationScore >= 50 ? "text-amber-400" :
    "text-zinc-400";

  const cols: { label: string; value: string; color: string }[] = [
    {
      label: "Followers",
      value: followers !== null ? followers.toLocaleString() : "—",
      color: followers !== null ? "text-amber-400" : "text-zinc-600",
    },
    {
      label: "Repos",
      value: repos !== null ? repos.toLocaleString() : "—",
      color: repos !== null ? "text-amber-400" : "text-zinc-600",
    },
    {
      label: "Completed Jobs",
      value: completedJobs.toString(),
      color: "text-zinc-100",
    },
    {
      label: "Reputation",
      value: reputationScore.toFixed(1),
      color: repColor,
    },
  ];

  return (
    <div className="border border-zinc-800 rounded-sm overflow-hidden">
      <div className="grid grid-cols-4">
        {cols.map((col, i) => (
          <div
            key={col.label}
            className={`px-3 py-3 text-center ${i < 3 ? "border-r border-zinc-800" : ""}`}
          >
            <div className={`font-mono text-sm font-bold tabular-nums ${col.color}`}>
              {col.value}
            </div>
            <div className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest mt-1">
              {col.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/TalentStatsStrip.tsx
git commit -m "feat(ui): TalentStatsStrip — 4-column stat strip (followers/repos/jobs/reputation)"
```

---

## Task 13: TalentProfileCompletenessWidget Component

**Files:**
- Create: `apps/web/components/TalentProfileCompletenessWidget.tsx`

Calculates completeness from profile fields, renders amber progress bar. Hides at 100% or if `publicProfile` is null.

Props: `publicProfile`, `sessionName` (display_name fallback), `liveSkills`.

- [ ] **Step 1: Create `TalentProfileCompletenessWidget.tsx`**

```typescript
import type { PublicProfile } from "@/lib/api";

interface TalentProfileCompletenessWidgetProps {
  publicProfile: PublicProfile | null;
  sessionName:   string | null;
  liveSkills:    { tag: string }[] | null;
}

const FIELDS: { label: string; weight: number; check: (p: PublicProfile, n: string | null, s: { tag: string }[] | null) => boolean }[] = [
  { label: "Display name",   weight: 15, check: (p, n) => !!(p.display_name || n) },
  { label: "Bio",            weight: 20, check: (p)    => !!(p.bio && p.bio.trim().length > 0) },
  { label: "Hourly rate",    weight: 20, check: (p)    => !!(p.hourly_rate_cents && p.hourly_rate_cents > 0) },
  { label: "Availability",   weight: 15, check: (p)    => !!p.availability },
  { label: "Skills",         weight: 20, check: (_, __, s) => !!(s && s.length > 0) },
  { label: "GitHub connected", weight: 10, check: (p)  => !!p.github_connected },
];

export default function TalentProfileCompletenessWidget({
  publicProfile, sessionName, liveSkills,
}: TalentProfileCompletenessWidgetProps) {
  if (!publicProfile) return null;

  const score = FIELDS.reduce(
    (acc, f) => acc + (f.check(publicProfile, sessionName, liveSkills) ? f.weight : 0),
    0,
  );

  if (score >= 100) return null;

  const missing = FIELDS
    .filter(f => !f.check(publicProfile, sessionName, liveSkills))
    .map(f => f.label);

  return (
    <div className="border border-zinc-800 rounded-sm p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] text-zinc-400 uppercase tracking-widest">
          Profile Completeness
        </span>
        <span className="font-mono text-[10px] text-amber-400 tabular-nums">{score}%</span>
      </div>
      <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-amber-400 rounded-full transition-all"
          style={{ width: `${score}%` }}
        />
      </div>
      <p className="font-mono text-[9px] text-zinc-600">
        Missing: {missing.join(" · ")}
      </p>
      <a
        href="/profile"
        className="inline-flex font-mono text-[10px] text-amber-600 hover:text-amber-400 transition-colors"
      >
        Complete Profile →
      </a>
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/TalentProfileCompletenessWidget.tsx
git commit -m "feat(ui): TalentProfileCompletenessWidget — amber progress bar, hides at 100%"
```

---

## Task 14: TalentDashboardContent Component

**Files:**
- Create: `apps/web/components/TalentDashboardContent.tsx`

This is the top-level composer for all talent widgets. It receives `session` as a prop (already available in the parent), fetches `publicProfile`, `roi`, and `liveSkills` internally, then renders all 10 widgets in spec order.

- [ ] **Step 1: Create `TalentDashboardContent.tsx`**

```typescript
"use client";

import { useState, useEffect } from "react";
import type { SkillTag } from "@/components/VerifiedSkillsChips";
import {
  fetchRoiReport,
  fetchPublicProfile,
  fetchTalentSkills,
  type PublicProfile,
  type RoiReport,
} from "@/lib/api";
import { roiToReputation } from "@/lib/roi";
import { TrustScoreBadge }       from "@/components/TrustScoreBadge";
import { VettingBadge }          from "@/components/VettingBadge";
import { VerifiedSkillsChips }   from "@/components/VerifiedSkillsChips";
import ReputationBadge           from "@/components/ReputationBadge";
import { StitchingDashboard }    from "@/components/StitchingDashboard";
import TalentInvitationsWidget        from "@/components/TalentInvitationsWidget";
import MyEngagementsWidget            from "@/components/MyEngagementsWidget";
import TalentEarningsWidget           from "@/components/TalentEarningsWidget";
import TalentStatsStrip               from "@/components/TalentStatsStrip";
import TalentProfileCompletenessWidget from "@/components/TalentProfileCompletenessWidget";

interface SessionShape {
  profileId:    string;
  name?:        string | null;
  email?:       string | null;
  identityTier: string;
  trustScore:   number;
}

interface TalentDashboardContentProps {
  session: SessionShape;
}

function buildSignals(profile: PublicProfile) {
  const out = [];
  if (profile.github_connected)
    out.push({ id: "gh", platform: "github" as const, label: "GitHub", detail: "Connected", url: "#", verified: true });
  if (profile.linkedin_connected)
    out.push({ id: "li", platform: "linkedin" as const, label: "LinkedIn", detail: "Connected", url: "#", verified: true });
  return out;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-xs text-zinc-500 uppercase tracking-widest mb-2">
      {children}
    </p>
  );
}

export default function TalentDashboardContent({ session }: TalentDashboardContentProps) {
  const [publicProfile, setPublicProfile] = useState<PublicProfile | null>(null);
  const [roi,           setRoi]           = useState<RoiReport | null>(null);
  const [liveSkills,    setLiveSkills]    = useState<SkillTag[] | null>(null);

  useEffect(() => {
    const { profileId } = session;
    if (!profileId) return;

    fetchPublicProfile(profileId)
      .then(setPublicProfile)
      .catch(() => {});

    fetchRoiReport(profileId)
      .then(setRoi)
      .catch(() => {});

    fetchTalentSkills(profileId)
      .then(r => {
        if (r.skills.length > 0) {
          setLiveSkills(r.skills.map(s => ({
            tag:         s.tag,
            proficiency: (Math.min(5, Math.max(1, s.proficiency)) as 1 | 2 | 3 | 4 | 5),
            verified:    s.verified_at !== null,
          })));
        }
      })
      .catch(() => {});
  }, [session]);

  const reputation = roi ? roiToReputation(roi) : null;

  const tierNum =
    session.identityTier === "BIOMETRIC_VERIFIED" ? 2 :
    session.identityTier === "SOCIAL_VERIFIED"    ? 1 : 0;

  function tierToStitching(tier: string): "Unverified" | "SocialVerified" | "BiometricVerified" {
    if (tier === "BIOMETRIC_VERIFIED") return "BiometricVerified";
    if (tier === "SOCIAL_VERIFIED")    return "SocialVerified";
    return "Unverified";
  }

  return (
    <main className="flex-1 p-4 pb-20 lg:pb-4 space-y-4 max-w-2xl mx-auto w-full">

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="font-mono text-sm font-medium text-zinc-300 uppercase tracking-widest">
          My Dashboard
        </h1>
        <TrustScoreBadge
          score={session.trustScore}
          biometricVerified={session.identityTier === "BIOMETRIC_VERIFIED"}
        />
      </div>

      {/* 1. Pending Invitations */}
      <section>
        <SectionLabel>Invitations</SectionLabel>
        <TalentInvitationsWidget />
      </section>

      {/* 2. My Engagements */}
      <section>
        <SectionLabel>My Engagements</SectionLabel>
        <MyEngagementsWidget />
      </section>

      {/* 3. Earnings */}
      <section>
        <SectionLabel>Earnings</SectionLabel>
        <TalentEarningsWidget />
      </section>

      {/* 4. Stats Strip */}
      <section>
        <TalentStatsStrip
          followers={publicProfile?.github_followers ?? null}
          repos={publicProfile?.github_stars ?? null}
          completedJobs={reputation?.totalDeployments ?? 0}
          reputationScore={reputation?.reputationScore ?? 0}
        />
      </section>

      {/* 5. Profile Completeness */}
      <section>
        <TalentProfileCompletenessWidget
          publicProfile={publicProfile}
          sessionName={session.name ?? null}
          liveSkills={liveSkills}
        />
      </section>

      {/* 6. Trust Score */}
      <section>
        <SectionLabel>Trust Score</SectionLabel>
        <div className="border border-zinc-800 rounded-sm px-3 py-2 inline-flex">
          <TrustScoreBadge
            score={session.trustScore}
            biometricVerified={session.identityTier === "BIOMETRIC_VERIFIED"}
          />
        </div>
      </section>

      {/* 7. Vetting Status */}
      <section>
        <SectionLabel>Vetting Status</SectionLabel>
        <VettingBadge tier={tierNum as 0 | 1 | 2} expandable />
      </section>

      {/* 8. Verified Skills & Platforms */}
      <section>
        <SectionLabel>Verified Skills &amp; Platforms</SectionLabel>
        <div className="border border-zinc-800 rounded-sm p-4 bg-zinc-900/60">
          <VerifiedSkillsChips
            signals={publicProfile ? buildSignals(publicProfile) : []}
            skills={liveSkills ?? []}
          />
        </div>
      </section>

      {/* 9. Reputation */}
      {reputation && (
        <section>
          <SectionLabel>Reputation</SectionLabel>
          <ReputationBadge {...reputation} onExportVc={async () => {}} />
        </section>
      )}

      {/* 10. Identity Stitching */}
      <section>
        <SectionLabel>Identity Stitching</SectionLabel>
        <div className="border border-zinc-800 rounded-sm p-4 bg-zinc-900">
          <StitchingDashboard
            currentTier={tierToStitching(session.identityTier)}
            trustScore={session.trustScore}
            biometricCommitment={undefined}
            deepLinkUrl="openid4vp://?request_uri=https%3A%2F%2Fapi.aistaffapp.com%2Fidentity%2Fvp-request"
            githubLogin={publicProfile?.github_connected ? (session.name ?? "user") : ""}
            linkedinVerified={publicProfile?.linkedin_connected ?? false}
          />
        </div>
      </section>

    </main>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/TalentDashboardContent.tsx
git commit -m "feat(ui): TalentDashboardContent — compose all talent dashboard widgets"
```

---

## Task 15: dashboard/page.tsx — Role Check + OperatorDashboardContent

**Files:**
- Modify: `apps/web/app/dashboard/page.tsx`

Three changes:
1. Remove the inline `roiToReputation` function (moved to `lib/roi.ts` in Task 6)
2. Add `import { roiToReputation } from "@/lib/roi"` (already done in Task 6)
3. Extract operator JSX into `function OperatorDashboardContent(...)` local to the file
4. Add role check after session is fetched: `if (role === "talent") return <TalentDashboardContent session={...} />`

- [ ] **Step 1: Add TalentDashboardContent import**

At the top of `apps/web/app/dashboard/page.tsx`, add:

```typescript
import TalentDashboardContent from "@/components/TalentDashboardContent";
```

- [ ] **Step 2: Add role check in the render**

The page currently starts its `return` with:
```typescript
return (
  <div className="flex flex-col lg:flex-row min-h-screen">
    {/* Sidebar */}
    <aside ...>
```

Add a role-based early branch **before** the main return. Find the line `return (` at line 332 and insert above it:

```typescript
// Talent role — render freelancer dashboard (session fetched, role confirmed)
const role = (session as { role?: string | null } | null)?.role ?? null;
if (role === "talent" && session) {
  return (
    <div className="flex flex-col lg:flex-row min-h-screen">
      <aside className="hidden lg:flex lg:flex-col w-56 border-r border-zinc-800 bg-zinc-950 p-4 gap-6 lg:h-screen lg:sticky lg:top-0 overflow-y-auto">
        <div className="flex items-center justify-between">
          <img src="/logo.png" alt="AiStaff" className="h-20 w-auto" />
          <span className="font-mono text-[9px] px-1.5 py-0.5 rounded-sm border border-zinc-700 text-zinc-500">TALENT</span>
        </div>
        <nav className="flex flex-col gap-1">
          {[
            { label: "Dashboard",   href: "/dashboard",   active: true  },
            { label: "Marketplace", href: "/marketplace", active: false },
            { label: "Leaderboard", href: "/leaderboard", active: false },
            { label: "Matching",    href: "/matching",    active: false },
            { label: "Profile",     href: "/profile",     active: false },
          ].map(({ label, href, active }) => (
            <a key={label} href={href}
              className={`px-3 py-2 rounded-sm font-mono text-xs transition-colors ${
                active ? "text-zinc-100 bg-zinc-800" : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900"
              }`}
            >{label}</a>
          ))}
        </nav>
        <div className="mt-auto pt-4 border-t border-zinc-800 space-y-2">
          <div className="px-2 space-y-0.5">
            <p className="font-mono text-xs text-zinc-300 truncate">{session.name}</p>
            <p className="font-mono text-[10px] text-zinc-600 truncate">
              Talent · {session.identityTier} · {session.trustScore} pts
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-sm font-mono text-xs text-zinc-500 hover:text-red-400 hover:bg-red-950/30 transition-colors border border-transparent hover:border-red-900/50"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign out
          </button>
        </div>
      </aside>
      <TalentDashboardContent
        session={{
          profileId:    session.profileId,
          name:         session.name ?? null,
          email:        session.email ?? null,
          identityTier: session.identityTier,
          trustScore:   session.trustScore,
        }}
      />
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 h-16 flex items-center border-t border-zinc-800 bg-zinc-950">
        {[
          { label: "Dashboard", href: "/dashboard",   active: true  },
          { label: "Market",    href: "/marketplace", active: false },
          { label: "Matching",  href: "/matching",    active: false },
          { label: "Profile",   href: "/profile",     active: false },
        ].map(({ label, href, active }) => (
          <a key={label} href={href} className={`nav-tab ${active ? "active" : ""}`}>
            <span className="text-[10px]">{label}</span>
          </a>
        ))}
      </nav>
    </div>
  );
}
```

> This branching happens at render time. If `session` is still null (loading), neither branch fires and the operator layout renders as before with demo data.

- [ ] **Step 3: TypeScript check + build**

```bash
cd apps/web && npm run build
```
Expected: build completes with zero TypeScript errors. No `console.log` in output.

- [ ] **Step 4: Smoke test manually**

1. Log in as a `talent` role user → should see talent dashboard (Invitations, Engagements, Earnings, Stats Strip, Completeness, existing badges)
2. Log in as a `client` or `agent-owner` → should see existing operator dashboard unchanged

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/dashboard/page.tsx
git commit -m "feat(dashboard): role-aware layout — talent role sees TalentDashboardContent"
```

> Note: `TalentDashboardContent.tsx` was already committed in Task 14 — only `page.tsx` is new here.

---

## Verification Commands

```bash
# Rust — full workspace compile check
powershell -File C:\Users\Admin\AppData\Local\Temp\full_check.ps1

# Frontend — TypeScript + Next.js build
cd apps/web && npm run build
```

Both must pass with zero errors before this feature is complete.
