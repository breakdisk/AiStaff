# AiTalent Dashboard Enhancement — Design Spec

## Goal

Transform `/dashboard` from a single operator-focused layout into a role-aware dashboard. When `session.role === "talent"`, render a freelancer-specific widget set. All other roles continue to see the existing operator layout. No new routes, no redirect changes.

## Architecture

**Approach:** Role-aware single `/dashboard`. Read `role` from session at page top and conditionally render `<TalentDashboardContent />` or the existing operator content. The existing sidebar, mobile nav, and session-fetching logic remain untouched.

**Pattern:**
```
DashboardPage
  ├── <Sidebar>  (unchanged)
  ├── if role === "talent" → <TalentDashboardContent session={session} />
  └── else                → existing operator widgets (unchanged)
```

---

## File Changes

| File | Action |
|---|---|
| `apps/web/app/dashboard/page.tsx` | Extract operator widgets into `<OperatorDashboardContent>`; add role check at top; add `import { roiToReputation } from "@/lib/roi"` — the operator path at line 251 still calls it after the function is moved out |
| `apps/web/components/TalentDashboardContent.tsx` | **New** — composes all talent widgets |
| `apps/web/components/TalentInvitationsWidget.tsx` | **New** — pending invitations with inline Accept/Decline |
| `apps/web/components/TalentEarningsWidget.tsx` | **New** — last 3 payouts table |
| `apps/web/components/TalentStatsStrip.tsx` | **New** — 4-column stat strip (followers, stars, jobs, reputation) |
| `apps/web/components/TalentProfileCompletenessWidget.tsx` | **New** — amber progress bar, hides at 100% |
| `apps/web/components/MyEngagementsWidget.tsx` | **New** — extract existing inline engagements JSX from `page.tsx` into a reusable component |
| `apps/web/lib/api.ts` | Add `fetchTalentPayouts()` + `TalentPayout` interface |
| `apps/web/app/api/talent/payouts/route.ts` | **New** — GET last 3 payouts from `escrow_payouts` |
| `migrations/0045_github_social_stats.sql` | **New** — add `github_followers` + `github_stars` to `unified_profiles` |
| `crates/common/src/types/identity.rs` | Add `github_followers: Option<u32>` + `github_stars: Option<u32>` to `OAuthCallbackPayload` |
| `apps/web/auth.ts` | Expand `githubExtra` type to include `followers: number`; add `github_followers?: number` + `github_stars?: number` to the local `OAuthCallbackPayload` interface; pass `githubExtra?.followers` as `github_followers` in the POST body to `/identity/oauth-callback` |
| `crates/identity_service/src/oauth_handler.rs` | Persist `github_followers` + `github_stars` from `OAuthCallbackPayload` into `unified_profiles` during upsert |
| `crates/identity_service/src/lib.rs` (public profile endpoint) | Return `github_followers` + `github_stars` in public profile response |
| `apps/web/lib/api.ts` | Add `github_followers?: number` + `github_stars?: number` to `PublicProfile`; move `roiToReputation()` from `page.tsx` to `apps/web/lib/roi.ts` and export it |
| `apps/web/lib/roi.ts` | **New** — export `roiToReputation(roi: RoiReport)` (moved from `page.tsx`) |

---

## Widget Spec — Talent View

### Widget order (top → bottom)

1. **Pending Invitations**
2. **My Engagements** (extracted from existing inline JSX)
3. **Earnings** (last 3 payouts)
4. **Stats Strip** (followers · stars · completed jobs · reputation)
5. **Profile Completeness**
6. **Trust Score** (existing `TrustScoreBadge`)
7. **Vetting Status** (existing `VettingBadge`)
8. **Verified Skills & Platforms** (existing `VerifiedSkillsChips`)
9. **Reputation** (existing `ReputationBadge`)
10. **Identity Stitching** (existing `StitchingDashboard`)

---

### 1. TalentInvitationsWidget

**Data:** `GET /api/matching/invitations/received` — already exists, returns `ReceivedInvitation[]`

**Behaviour:**
- On mount: fetch pending invitations (filter `status === "PENDING"`)
- If 0 pending: collapsed single row — mail icon + `"No new invitations"` + `"View all →"` link to `/invitations`
- If ≥ 1 pending: amber header with count badge + first pending card:
  - Client name (bold)
  - Message preview (first 120 chars, truncated)
  - `[Accept]` + `[Decline]` buttons with Loader2 spinner — calls `respondToInvitation(id, action)` from `api.ts`
  - On respond: optimistic update removes that card; if more remain, next one shows
  - If > 1 pending: `"+N more"` text below the first card
- `"View all invitations →"` link always visible at bottom

**States:** shimmer skeleton (2 rows) → populated → empty

---

### 2. MyEngagementsWidget (extracted)

Extract the existing inline engagements JSX from `DashboardPage` into `apps/web/components/MyEngagementsWidget.tsx`. Props: `profileId: string`. Fetches `GET /api/marketplace/my-deployments` internally. Renders identical UI to what exists today — agent name, state badge, created_at, Collaborate link. No behaviour change.

---

### 3. TalentEarningsWidget

**Data:** `GET /api/talent/payouts` — new route

**API route — correct schema:**
```sql
SELECT ep.id,
       ep.created_at                      AS released_at,
       ep.amount_cents,
       COALESCE(al.name, 'Deleted Listing') AS agent_name,
       'RELEASED'                         AS status
  FROM escrow_payouts  ep
  JOIN deployments     d  ON d.id  = ep.deployment_id
  LEFT JOIN agent_listings al ON al.id = d.agent_id
 WHERE ep.recipient_id = $1
 ORDER BY ep.created_at DESC
 LIMIT 3
```

Note: `escrow_payouts` is an append-only released-payout ledger — every row is already released. Status is always `"RELEASED"`. The `recipient_id` column identifies the talent. The join to `agent_listings` is a LEFT JOIN because `deployments.agent_id` has no FK constraint — a listing may have been soft-deleted; `COALESCE` guards against null names.

**Response interface:**
```typescript
interface TalentPayout {
  id:           string;
  released_at:  string;   // ISO from created_at
  agent_name:   string;
  amount_cents: number;
  status:       "RELEASED";
}
```

**Render:** 4-column table — Date · Project · Amount · Status
- Amount: `$X,XXX` formatted, green text
- Status chip: green `Released`
- If no payouts: `"No payouts yet — complete your first engagement"`
- Loading: shimmer skeleton (3 rows)

---

### 4. TalentStatsStrip

**4-column stat strip — equal width, dividers between columns:**

| Column | Value source | Color |
|---|---|---|
| Followers | `publicProfile.github_followers` (new field) | amber |
| ★ Stars | `publicProfile.github_stars` (new field) | amber |
| Completed Jobs | `roiToReputation(roi).totalDeployments` — import from `@/lib/roi` | zinc-100 |
| Reputation | `roiToReputation(roi).reputationScore` — import from `@/lib/roi` (computed value, not raw) | green ≥70 / amber 50–69 / zinc <50 |

`roiToReputation` is moved from `apps/web/app/dashboard/page.tsx` to `apps/web/lib/roi.ts` and exported. `TalentDashboardContent` calls it and passes the result as props to `TalentStatsStrip` — the strip component itself does not import from `page.tsx`.

- If GitHub not connected or field is null: show `—` for followers/stars
- All labels: `font-mono text-[9px] text-zinc-600 uppercase tracking-widest`

**GitHub followers/stars — data pipeline:**

1. **Migration `0045`:** Add `github_followers INTEGER DEFAULT 0` and `github_stars INTEGER DEFAULT 0` to `unified_profiles`
2. **`identity_service/oauth_handler.rs`:** GitHub OAuth callback already fetches the GitHub user object which includes `followers`. For `github_stars`, sum `public_repos` star count via the GitHub API's `repos?per_page=100` endpoint (or store `public_repos` as proxy — see note below). Persist both into `unified_profiles` during upsert.
3. **Public profile endpoint:** Return `github_followers` and `github_stars` in the JSON response.
4. **`api.ts` `PublicProfile`:** Add `github_followers?: number` and `github_stars?: number`

**Note on star count complexity:** Summing stars across all repos requires an additional GitHub API call. If this adds too much latency to the OAuth flow, store `public_repos` count as a proxy for the Stars stat and label it `"Repos"` instead of `"Stars"`. Implementation decision deferred to plan phase.

---

### 5. TalentProfileCompletenessWidget

**Completeness fields and weights:**

| Field | Check | Weight |
|---|---|---|
| Display name | `publicProfile?.display_name || session?.name` | 15% |
| Bio | `publicProfile?.bio` non-empty | 20% |
| Hourly rate | `publicProfile?.hourly_rate_cents > 0` | 20% |
| Availability | `publicProfile?.availability` set | 15% |
| Skills | `liveSkills?.length > 0` | 20% |
| GitHub connected | `publicProfile?.github_connected` | 10% |

**Behaviour:**
- Score = sum of weights for completed fields
- If score = 100% (or `publicProfile` is null): widget does not render
- Otherwise: amber progress bar + nudge listing exactly which fields are missing
- `[Complete Profile →]` button links to `/profile`
- Fallback when `publicProfile` is null: hide widget entirely (don't show false "0% complete")

---

## Operator View (unchanged)

When `role !== "talent"` (client, agent-owner, null), the existing operator widget order stays. The operator JSX is extracted into `<OperatorDashboardContent>` inline in `page.tsx` (no new file needed — just a local function component).

---

## Data Flow Summary

```
DashboardPage mounts
  → GET /api/auth/me → session (role, profileId, identityTier, trustScore)
  → if role === "talent" → <TalentDashboardContent session={session} />
      → GET /api/matching/invitations/received   → TalentInvitationsWidget
      → GET /api/marketplace/my-deployments      → MyEngagementsWidget
      → GET /api/talent/payouts                  → TalentEarningsWidget
      → GET /api/identity/public-profile/:id     → TalentStatsStrip + ProfileCompleteness
      → GET /api/analytics/talent/:id/roi        → TalentStatsStrip (jobs + reputation)
      → GET /api/talent/skills/:id               → ProfileCompleteness
  → else → <OperatorDashboardContent> (existing fetches unchanged)
```

---

## Error Handling

- All widgets fall back gracefully if API unreachable — never crash the page
- Invitations: empty state if fetch fails
- Earnings: empty state (no fabricated financial data)
- Stats strip: `—` for unavailable values
- Profile completeness: hidden if `publicProfile` is null

---

## Not In Scope

- Agency dashboard (separate future spec)
- Enterprise/Admin dashboard (separate future spec)
- Earnings monthly chart or trend
- Push notifications for new invitations
- Pagination of invitations on dashboard
