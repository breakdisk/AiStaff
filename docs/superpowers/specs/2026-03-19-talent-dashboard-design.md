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
| `apps/web/app/dashboard/page.tsx` | Extract existing operator content into inline section; add role check + render `<TalentDashboardContent>` |
| `apps/web/components/TalentDashboardContent.tsx` | **New** — all talent widgets composed here |
| `apps/web/components/TalentInvitationsWidget.tsx` | **New** — pending invitations with inline Accept/Decline |
| `apps/web/components/TalentEarningsWidget.tsx` | **New** — last 3 payouts table |
| `apps/web/components/TalentStatsStrip.tsx` | **New** — 4-column stat strip (followers, stars, jobs, reputation) |
| `apps/web/components/TalentProfileCompletenessWidget.tsx` | **New** — amber progress bar with nudge text, hides at 100% |
| `apps/web/lib/api.ts` | Add `fetchTalentPayouts()` + `TalentPayout` interface |
| `apps/web/app/api/talent/payouts/route.ts` | **New** — GET last 3 payouts from `escrow_payouts` for talent |

---

## Widget Spec — Talent View

### Widget order (top → bottom)

1. **Pending Invitations**
2. **My Engagements** (existing)
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

**Data:** `GET /api/matching/invitations/received` — returns `ReceivedInvitation[]`

**Behaviour:**
- On mount: fetch pending invitations
- If 0 pending: render a single collapsed row — `"No new invitations"` with mail icon + `"View all →"` link to `/invitations`
- If ≥ 1 pending: show amber header with count badge, then render first pending invitation as a card:
  - Client name (bold)
  - Message preview (first 120 chars, truncated with ellipsis)
  - `[Accept]` + `[Decline]` buttons with spinner — calls `respondToInvitation(id, action)` from `api.ts`
  - On respond: optimistic update removes card; if more pending remain, next one slides in
  - `"View all invitations →"` link always visible at bottom
- If > 1 pending: show `"+N more"` below the first card

**States:** loading skeleton (shimmer) → populated → empty

---

### 2. My Engagements

No changes. Existing implementation reads from `GET /api/marketplace/my-deployments`. Already shows state, agent name, Collaborate link.

---

### 3. TalentEarningsWidget

**Data:** `GET /api/talent/payouts` — new route, returns last 3 rows from `escrow_payouts WHERE talent_id = $1 ORDER BY released_at DESC LIMIT 3`

**Response shape:**
```typescript
interface TalentPayout {
  id:           string;
  released_at:  string;      // ISO timestamp
  agent_name:   string;      // joined from deployments
  amount_cents: number;      // talent's share (amount_talent from escrow_payouts)
  status:       "RELEASED" | "PENDING";
}
```

**Render:** 4-column table — Date · Project · Amount · Status
- Amount: `$X,XXX` formatted, green for RELEASED, amber for PENDING
- Status chip: green `Released` or amber `Pending`
- If no payouts: `"No payouts yet — complete your first engagement"`
- Loading: shimmer skeleton (3 rows)

**API route logic:**
```sql
SELECT ep.id, ep.released_at, ep.amount_talent AS amount_cents,
       d.agent_name,
       CASE WHEN ep.released_at IS NOT NULL THEN 'RELEASED' ELSE 'PENDING' END AS status
  FROM escrow_payouts ep
  JOIN deployments d ON d.id = ep.deployment_id
 WHERE ep.talent_id = $1
 ORDER BY ep.created_at DESC
 LIMIT 3
```

---

### 4. TalentStatsStrip

**Data sources (all already available in session or from existing API calls):**

| Stat | Source |
|---|---|
| Followers | `publicProfile.github_followers` — add to `GET /api/identity/public-profile/:id` response |
| Stars | `publicProfile.github_stars` — add to same response |
| Completed Jobs | `roi.total_deployments` — already fetched via `fetchRoiReport()` |
| Reputation | `roi.reputation_score` — already fetched via `fetchRoiReport()` |

**Render:** Single row, 4 equal columns, dividers between columns.
- Followers: amber number, `"Followers"` label below
- Stars: amber `★ N` number, `"Stars"` label below
- Completed Jobs: zinc-100 number, `"Completed Jobs"` label below
- Reputation: green number (≥70) or amber (50–69) or zinc (< 50), `"Reputation"` label below
- All labels: `font-mono text-[9px] text-zinc-600 uppercase tracking-widest`
- If GitHub not connected: show `—` for followers/stars

**identity_service change needed:** `GET /api/identity/public-profile/:id` must return `github_followers: number` and `github_stars: number`. These are fetched from GitHub API during OAuth and stored in `oauth_providers` table (or fetched live). **Scope: add these two fields to the existing public profile endpoint response only — no DB schema change needed if we fetch from GitHub API on profile read.**

---

### 5. TalentProfileCompletenessWidget

**Logic:** Completeness score = sum of completed fields ÷ total fields × 100

| Field | Weight |
|---|---|
| `display_name` set | 15% |
| `bio` set (non-empty) | 20% |
| `hourly_rate_cents` > 0 | 20% |
| `availability` set | 15% |
| At least 1 skill tag | 20% |
| GitHub connected | 10% |

**Behaviour:**
- If score = 100%: widget does not render (hidden completely)
- Otherwise: amber progress bar + nudge text listing missing fields
- "Add hourly rate + bio to attract more invitations" — dynamic, lists exactly which fields are missing
- `[Complete Profile →]` link to `/profile`

**Data:** Reads from `publicProfile` (already fetched) + `liveSkills` (already fetched) + session

---

## Operator View (unchanged)

When `role !== "talent"` (client, agent-owner, null), the existing operator widget order remains:

1. VetoCard
2. My Engagements
3. Talent Matches (MatchScoreCard)
4. License + Reputation
5. Agent Health
6. DoD Checklist
7. Vetting Status
8. Verified Skills
9. Identity Stitching

---

## Data Flow Summary

```
DashboardPage mounts
  → fetch /api/auth/me → session (role, profileId, identityTier, trustScore)
  → if role === "talent":
      → fetch /api/matching/invitations/received   → TalentInvitationsWidget
      → fetch /api/marketplace/my-deployments      → My Engagements (existing)
      → fetch /api/talent/payouts                  → TalentEarningsWidget
      → fetch /api/identity/public-profile/:id     → TalentStatsStrip + ProfileCompleteness
      → fetch /api/analytics/roi/:id               → TalentStatsStrip (jobs + reputation)
      → fetch /api/talent/skills/:id               → ProfileCompleteness
  → else:
      → existing fetches (unchanged)
```

---

## Error Handling

- All new widgets fall back to a demo/empty state if API is unreachable — never crash
- Invitations: empty state if fetch fails
- Earnings: empty state if fetch fails (no demo data — don't fabricate financial data)
- Stats strip: `—` for unavailable values
- Profile completeness: hides widget if profile data unavailable

---

## Not In Scope

- Agency dashboard (separate future spec)
- Enterprise/Admin dashboard (separate future spec)
- Earnings chart / monthly breakdown (future enhancement)
- Push notifications for new invitations
- Pagination of invitations on dashboard (use `/invitations` page for that)
