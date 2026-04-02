# Transparency Live Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded demo data on `/transparency` with real match data queried from the database via a new Next.js API route.

**Architecture:** A `GET /api/transparency/missed-jobs` route reads `match_results` → `match_requests` → `agent_listings` for the logged-in user's profileId, then recomputes 5 algorithm factors from live profile data (skills, trust score, rate, deployments). The transparency page replaces its `MISSED_JOBS` constant with a `useEffect` fetch, adding loading skeleton and empty state.

**Tech Stack:** Next.js 15 App Router, `pg` Pool (already used in `/api/proposals/submit`), Auth.js v5 `auth()`, TypeScript, Tailwind 4.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `apps/web/app/api/transparency/missed-jobs/route.ts` | **Create** | Auth-gated GET handler — queries DB, computes factors, returns `MissedJob[]` |
| `apps/web/app/transparency/page.tsx` | **Modify** | Replace `MISSED_JOBS` constant with fetched state; add loading + empty states |

---

## Task 1: Create the API route

**Files:**
- Create: `apps/web/app/api/transparency/missed-jobs/route.ts`

### Background

`match_results` stores one aggregated `match_score` (0–1 float, Jaccard-based) per talent per request. Factor-level detail was never persisted, so we recompute 5 factors from live profile data. This is more actionable — it shows the user their *current* gaps.

**SQL needed (three queries):**

1. Missed jobs — results where user ranked > 1:
```sql
WITH ranked AS (
  SELECT
    mr.request_id,
    mr.talent_id,
    mr.match_score,
    mr.created_at,
    RANK() OVER (PARTITION BY mr.request_id ORDER BY mr.match_score DESC) AS rank,
    MAX(mr.match_score) OVER (PARTITION BY mr.request_id) AS top_score
  FROM match_results mr
)
SELECT
  r.request_id,
  r.match_score          AS your_score,
  r.top_score,
  r.created_at,
  al.id                  AS listing_id,
  al.name                AS job_title,
  al.price_cents,
  mreq.required_skills,
  mreq.min_trust_score,
  dev.email              AS client_email
FROM ranked r
JOIN match_requests mreq ON mreq.id = r.request_id
JOIN agent_listings al   ON al.id = mreq.agent_id
JOIN unified_profiles dev ON dev.id = al.developer_id
WHERE r.talent_id = $1 AND r.rank > 1
ORDER BY r.created_at DESC
LIMIT 20
```

2. Profile snapshot for factor computation:
```sql
SELECT
  up.trust_score,
  up.identity_tier::TEXT AS tier,
  up.hourly_rate_cents,
  COALESCE(tr.total_deployments, 0) AS total_deployments
FROM unified_profiles up
LEFT JOIN talent_roi tr ON tr.talent_id = up.id
WHERE up.id = $1
```

3. User's verified skills (proficiency ≥ 3):
```sql
SELECT st.tag
FROM talent_skills ts
JOIN skill_tags st ON st.id = ts.tag_id
WHERE ts.talent_id = $1 AND ts.proficiency >= 3
```

**Factor computation rules (all in TypeScript, no extra DB calls):**

| Factor | id | weight | pass | partial | fail |
|---|---|---|---|---|---|
| Skill Match | `skill` | 30 | Jaccard ≥ 0.70 | 0.40–0.69 | < 0.40 |
| Trust Score | `trust` | 25 | score ≥ min | score ≥ min−15 | score < min−15 |
| Rate Competitiveness | `rate` | 20 | hourly_rate_cents × 8 ≤ price_cents | rate null | rate > budget |
| Portfolio Evidence | `portfolio` | 15 | deployments ≥ 3 | 1–2 | 0 |
| Response / Repeat | `response` | 10 | always partial | — | — |

**Jaccard function:**
```typescript
function jaccard(required: string[], userSkillSet: Set<string>): number {
  const req = new Set(required.map(s => s.toLowerCase()));
  const intersection = [...req].filter(s => userSkillSet.has(s)).length;
  const union = new Set([...req, ...userSkillSet]).size;
  return union === 0 ? 1 : intersection / union;
}
```

**Response shape** must exactly match the `MissedJob` interface already in the page:
```typescript
interface MissedJob {
  id:        string;   // use request_id (UUID)
  title:     string;   // al.name
  client:    string;   // dev.email (masked: user@… → "Client ••••") or first 8 chars of UUID
  budget:    string;   // format price_cents as "$X,XXX"
  postedAt:  string;   // created_at ISO date, slice to YYYY-MM-DD
  yourScore: number;   // your_score * 100, rounded
  topScore:  number;   // top_score * 100, rounded
  factors:   MatchFactor[];
}
```

For `client` field: use masked email if available (`user@domain.com` → `user@…`), otherwise `"Client " + listing_id.slice(0, 6)`.

- [ ] **Step 1: Create the route file with Pool setup and auth check**

Create `apps/web/app/api/transparency/missed-jobs/route.ts`:

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

// Jaccard similarity: fraction of required skills the user covers
function jaccard(required: string[], userSkills: Set<string>): number {
  const req = new Set(required.map(s => s.toLowerCase()));
  const intersection = [...req].filter(s => userSkills.has(s)).length;
  const union = new Set([...req, ...userSkills]).size;
  return union === 0 ? 1 : intersection / union;
}

function formatBudget(cents: number): string {
  return "$" + Math.round(cents / 100).toLocaleString("en-US");
}

function maskClient(email: string | null, listingId: string): string {
  if (email) {
    const [local] = email.split("@");
    return local.slice(0, 4) + "…";
  }
  return "Client " + listingId.slice(0, 6);
}

export async function GET() {
  const session = await auth();
  const profileId = session?.user?.profileId;
  if (!profileId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let client;
  try {
    client = await pool.connect();

    // 1. Missed jobs
    const { rows: jobs } = await client.query(
      `WITH ranked AS (
        SELECT
          mr.request_id,
          mr.talent_id,
          mr.match_score,
          mr.created_at,
          RANK() OVER (PARTITION BY mr.request_id ORDER BY mr.match_score DESC) AS rank,
          MAX(mr.match_score) OVER (PARTITION BY mr.request_id) AS top_score
        FROM match_results mr
      )
      SELECT
        r.request_id,
        r.match_score          AS your_score,
        r.top_score,
        r.created_at,
        al.id                  AS listing_id,
        al.name                AS job_title,
        al.price_cents,
        mreq.required_skills,
        mreq.min_trust_score,
        dev.email              AS client_email
      FROM ranked r
      JOIN match_requests mreq ON mreq.id = r.request_id
      JOIN agent_listings al   ON al.id = mreq.agent_id
      JOIN unified_profiles dev ON dev.id = al.developer_id
      WHERE r.talent_id = $1 AND r.rank > 1
      ORDER BY r.created_at DESC
      LIMIT 20`,
      [profileId],
    );

    // Return early — no missed jobs yet
    if (jobs.length === 0) {
      return NextResponse.json([]);
    }

    // 2. Profile snapshot
    const { rows: profileRows } = await client.query(
      `SELECT
        up.trust_score,
        up.identity_tier::TEXT AS tier,
        up.hourly_rate_cents,
        COALESCE(tr.total_deployments, 0) AS total_deployments
       FROM unified_profiles up
       LEFT JOIN talent_roi tr ON tr.talent_id = up.id
       WHERE up.id = $1`,
      [profileId],
    );
    const profile = profileRows[0] ?? { trust_score: 0, tier: "UNVERIFIED", hourly_rate_cents: null, total_deployments: "0" };

    // 3. User's verified skills
    const { rows: skillRows } = await client.query(
      `SELECT st.tag
       FROM talent_skills ts
       JOIN skill_tags st ON st.id = ts.tag_id
       WHERE ts.talent_id = $1 AND ts.proficiency >= 3`,
      [profileId],
    );
    const userSkills = new Set<string>(skillRows.map((r: { tag: string }) => r.tag.toLowerCase()));

    const trustScore   = Number(profile.trust_score)       || 0;
    const rateCents    = profile.hourly_rate_cents != null ? Number(profile.hourly_rate_cents) : null;
    const deployments  = parseInt(profile.total_deployments, 10) || 0;
    const tier         = (profile.tier as string) ?? "UNVERIFIED";

    const result = jobs.map((job: {
      request_id: string;
      your_score: number;
      top_score: number;
      created_at: string;
      listing_id: string;
      job_title: string;
      price_cents: number;
      required_skills: string[];
      min_trust_score: number;
      client_email: string | null;
    }) => {
      const required: string[] = job.required_skills ?? [];
      const minTrust           = Number(job.min_trust_score) || 40;
      const budget             = Number(job.price_cents)     || 0;
      const skillPct           = jaccard(required, userSkills);

      // ── Skill factor ──────────────────────────────────────────────────────
      const skillStatus = skillPct >= 0.70 ? "pass" : skillPct >= 0.40 ? "partial" : "fail";
      const missingSkills = required.filter(s => !userSkills.has(s.toLowerCase()));
      const skillFactor = {
        id: "skill", category: "Skills", label: "Skill Match",
        yourValue: `${Math.round(skillPct * 100)}% (${userSkills.size} tags)`,
        required:  `≥ 70% (${required.join(", ") || "any"})`,
        status:    skillStatus,
        weight:    30,
        gap:       skillStatus !== "pass"
          ? missingSkills.length > 0
            ? `Missing: ${missingSkills.slice(0, 3).join(", ")}${missingSkills.length > 3 ? " +" + (missingSkills.length - 3) + " more" : ""}`
            : "Add more skill tags with proficiency ≥ 3"
          : undefined,
        tip: skillStatus === "pass"
          ? "Skill match is strong for this listing."
          : `Add these skill tags to your profile: ${missingSkills.slice(0, 3).join(", ") || "update proficiency levels"}.`,
      };

      // ── Trust factor ──────────────────────────────────────────────────────
      const trustStatus = trustScore >= minTrust ? "pass"
        : trustScore >= minTrust - 15 ? "partial" : "fail";
      const trustFactor = {
        id: "trust", category: "Trust", label: "Trust Score",
        yourValue: `${trustScore} / 100`,
        required:  `≥ ${minTrust}`,
        status:    trustStatus,
        weight:    25,
        gap:       trustStatus !== "pass"
          ? `${minTrust - trustScore} points below threshold`
          : undefined,
        tip: trustStatus === "pass"
          ? "Trust score meets this listing's minimum."
          : tier === "UNVERIFIED"
            ? "Complete biometric verification to gain +40 trust points and reach Tier 2."
            : "Connect GitHub and LinkedIn to increase your trust score.",
      };

      // ── Rate factor ───────────────────────────────────────────────────────
      const dayRateCents  = rateCents != null ? rateCents * 8 : null;
      const rateStatus    = dayRateCents == null ? "partial"
        : dayRateCents <= budget ? "pass" : "fail";
      const rateFactor = {
        id: "rate", category: "Rate", label: "Rate Competitiveness",
        yourValue: rateCents != null ? `$${Math.round(rateCents / 100)}/hr` : "Not set",
        required:  `≤ ${formatBudget(budget)} budget`,
        status:    rateStatus,
        weight:    20,
        gap:       rateStatus === "fail"
          ? `Day rate ${formatBudget(dayRateCents!)} exceeds budget ${formatBudget(budget)}`
          : rateStatus === "partial" ? "Set your hourly rate on your profile" : undefined,
        tip: rateStatus === "pass"
          ? "Rate is within the listing budget."
          : rateStatus === "partial"
            ? "Add your hourly rate to your profile so clients can evaluate competitiveness."
            : "Consider offering a fixed-price SOW instead of hourly for this budget range.",
      };

      // ── Portfolio factor ──────────────────────────────────────────────────
      const portStatus = deployments >= 3 ? "pass" : deployments >= 1 ? "partial" : "fail";
      const portFactor = {
        id: "portfolio", category: "Portfolio", label: "Verified Deployments",
        yourValue: `${deployments} verified`,
        required:  "≥ 3 preferred",
        status:    portStatus,
        weight:    15,
        gap:       portStatus !== "pass" ? `${3 - deployments} more verified deployments needed` : undefined,
        tip: portStatus === "pass"
          ? "Strong deployment history."
          : "Complete more deployments through the platform to build verified portfolio evidence.",
      };

      // ── Response/Repeat factor ────────────────────────────────────────────
      const responseFactor = {
        id: "response", category: "Response", label: "Response / Repeat Hire",
        yourValue: "N/A",
        required:  "< 2h response, > 25% repeat",
        status:    "partial" as const,
        weight:    10,
        tip: "Enable notifications and respond to proposals within 2h. A single repeat hire significantly boosts this score.",
      };

      return {
        id:        job.request_id,
        title:     job.job_title,
        client:    maskClient(job.client_email, job.listing_id),
        budget:    formatBudget(budget),
        postedAt:  (job.created_at as string).slice(0, 10),
        yourScore: Math.round(Number(job.your_score) * 100),
        topScore:  Math.round(Number(job.top_score)  * 100),
        factors:   [skillFactor, trustFactor, rateFactor, portFactor, responseFactor],
      };
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("[transparency/missed-jobs]", err);
    return NextResponse.json({ error: "Failed to load transparency data" }, { status: 500 });
  } finally {
    client?.release();
  }
}
```

- [ ] **Step 2: Add `/api/transparency/missed-jobs` to the public allowlist in middleware**

Open `apps/web/middleware.ts`. The route is auth-gated (returns 401, not a redirect), so no middleware change is needed — the handler calls `auth()` directly. **Skip this step.**

- [ ] **Step 3: Verify TypeScript compiles cleanly**

Run from `apps/web/`:
```bash
npx tsc --noEmit
```
Expected: zero errors. Fix any type errors before continuing.

- [ ] **Step 4: Commit the API route**

```bash
git add apps/web/app/api/transparency/missed-jobs/route.ts
git commit -m "feat(transparency): GET /api/transparency/missed-jobs — live match data with factor breakdown"
```

---

## Task 2: Wire the page to live data

**Files:**
- Modify: `apps/web/app/transparency/page.tsx`

The page is a client component (`"use client"`). Replace the `MISSED_JOBS` constant usage with fetched state. Keep all existing UI components untouched — only the data source and the top-level `TransparencyPage` component change.

### Changes needed in `TransparencyPage`

1. Add imports: `useEffect`, `useState` (already imported)
2. Add state: `const [jobs, setJobs] = useState<MissedJob[] | null>(null)` (`null` = loading, `[]` = empty)
3. Add `useEffect` fetch on mount
4. Replace `MISSED_JOBS` references in the JSX with `jobs ?? []`
5. Add loading skeleton (3 shimmer cards) when `jobs === null`
6. Add empty state when `jobs?.length === 0`

### Loading skeleton component (add near top of file, before `TransparencyPage`):

```tsx
function MissedJobSkeleton() {
  return (
    <div className="border border-zinc-800 rounded-sm bg-zinc-900/40 overflow-hidden animate-pulse">
      <div className="flex items-start gap-3 px-3 py-3">
        <div className="flex-1 space-y-2">
          <div className="h-4 w-48 bg-zinc-800 rounded-sm" />
          <div className="h-3 w-32 bg-zinc-800 rounded-sm" />
          <div className="h-3 w-24 bg-zinc-800 rounded-sm" />
        </div>
        <div className="w-36 space-y-2">
          <div className="h-2 bg-zinc-800 rounded-full" />
          <div className="h-2 bg-zinc-800 rounded-full" />
        </div>
      </div>
    </div>
  );
}
```

### Updated `TransparencyPage` function (replace only the function body — keep all helper components above unchanged):

```tsx
export default function TransparencyPage() {
  const [tab,  setTab]  = useState<"missed" | "algorithm">("missed");
  const [jobs, setJobs] = useState<MissedJob[] | null>(null);
  const [err,  setErr]  = useState(false);

  useEffect(() => {
    fetch("/api/transparency/missed-jobs")
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((data: MissedJob[]) => setJobs(data))
      .catch(() => setErr(true));
  }, []);

  const displayJobs = jobs ?? [];
  const totalGaps   = displayJobs.flatMap(j => j.factors).filter(f => f.status === "fail").length;
  const topGap      = displayJobs.flatMap(j => j.factors).find(f => f.status === "fail" && f.category === "Trust");

  return (
    <div className="flex min-h-screen bg-zinc-950 text-zinc-100">
      {/* Sidebar — unchanged */}
      ...

      <main className="flex-1 min-w-0 px-4 sm:px-6 py-6 pb-24 sm:pb-6">
        {/* Header — unchanged */}
        ...

        {/* Promise callout — unchanged */}
        ...

        {/* Top action item — unchanged, uses topGap from live data */}
        ...

        {/* Summary stats — replace MISSED_JOBS.length with displayJobs.length */}
        <div className="grid grid-cols-3 gap-2 mb-5">
          {[
            { label: "Missed jobs (30d)", value: jobs === null ? "—" : displayJobs.length, color: "text-zinc-100" },
            { label: "Gaps identified",   value: jobs === null ? "—" : totalGaps,           color: "text-red-400"  },
            { label: "Fixable this week", value: jobs === null ? "—" : Math.min(2, totalGaps), color: "text-green-400"},
          ].map(({ label, value, color }) => (
            <div key={label} className="border border-zinc-800 rounded-sm p-2.5 text-center bg-zinc-900/40">
              <p className={`font-mono text-xl font-medium ${color}`}>{value}</p>
              <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* Tabs — replace count in label */}
        <div className="flex gap-1 border-b border-zinc-800 mb-4">
          {[
            { key: "missed"    as const, label: jobs === null ? "Missed Jobs" : `Missed Jobs (${displayJobs.length})` },
            { key: "algorithm" as const, label: "How The Algorithm Works" },
          ].map(({ key, label }) => (
            <button key={key} onClick={() => setTab(key)}
              className={`px-3 py-2 font-mono text-xs border-b-2 transition-colors ${
                tab === key ? "border-amber-500 text-amber-400" : "border-transparent text-zinc-500 hover:text-zinc-300"
              }`}
            >{label}</button>
          ))}
        </div>

        {/* Missed jobs tab */}
        {tab === "missed" && (
          <div className="space-y-3">
            {err ? (
              <div className="border border-red-900/50 rounded-sm px-3 py-4 text-center">
                <p className="font-mono text-xs text-red-400">Failed to load match data. Please try refreshing.</p>
              </div>
            ) : jobs === null ? (
              /* Loading skeleton */
              <>
                <MissedJobSkeleton />
                <MissedJobSkeleton />
                <MissedJobSkeleton />
              </>
            ) : jobs.length === 0 ? (
              /* Empty state */
              <div className="border border-zinc-800 rounded-sm px-3 py-8 text-center bg-zinc-900/40">
                <Eye className="w-6 h-6 text-zinc-700 mx-auto mb-2" />
                <p className="font-mono text-sm text-zinc-400">No missed jobs yet</p>
                <p className="font-mono text-xs text-zinc-600 mt-1">
                  Match breakdowns appear here once the matching engine has ranked you for listings.
                </p>
              </div>
            ) : (
              jobs.map(job => <MissedJobCard key={job.id} job={job} />)
            )}
          </div>
        )}

        {/* Algorithm tab — unchanged */}
        ...
      </main>

      {/* Mobile nav — unchanged */}
      ...
    </div>
  );
}
```

> **Note on pseudocode above:** The `...` sections mean keep existing code exactly as-is. Only replace the parts shown. Do NOT rewrite the sidebar, mobile nav, algorithm tab, or helper components.

- [ ] **Step 1: Add `MissedJobSkeleton` component**

Insert `MissedJobSkeleton` function just before the `export default function TransparencyPage()` line (after `MissedJobCard`).

- [ ] **Step 2: Update `TransparencyPage` — add state + useEffect**

Replace the `TransparencyPage` function body with the updated version above. Keep all code above the function unchanged.

Specifically:
- Add `const [jobs, setJobs] = useState<MissedJob[] | null>(null)` and `const [err, setErr] = useState(false)`
- Replace `const totalGaps = MISSED_JOBS...` with `const displayJobs = jobs ?? []` + recomputed `totalGaps` / `topGap`
- Add `useEffect` fetch
- In JSX: replace `MISSED_JOBS` with `displayJobs`, add loading/empty/error states in the "missed" tab
- Replace the hardcoded `"Missed Jobs (3)"` tab label with dynamic count

- [ ] **Step 3: Verify TypeScript compiles cleanly**

```bash
npx tsc --noEmit
```
Expected: zero errors.

- [ ] **Step 4: Remove the `MISSED_JOBS` constant**

Once the page compiles cleanly and uses live data, delete the `const MISSED_JOBS: MissedJob[] = [...]` block (lines 94–143). The `ALGO_WEIGHTS` constant stays — it's used by the Algorithm tab.

- [ ] **Step 5: Verify TypeScript still compiles after constant removal**

```bash
npx tsc --noEmit
```
Expected: zero errors. If `MISSED_JOBS` is still referenced somewhere, fix it first.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/transparency/page.tsx
git commit -m "feat(transparency): wire page to live API — loading skeleton, empty state, error state"
```

---

## Task 3: Manual verification

- [ ] **Step 1: Check empty state renders correctly**

The local dev DB likely has no `match_results` rows. Start dev server (`npm run dev` in `apps/web/`), navigate to `/transparency`. Expected: skeleton flashes briefly, then "No missed jobs yet" empty state appears with the Eye icon. The "Algorithm" tab should still show all content unchanged.

- [ ] **Step 2: Check API returns 401 when unauthenticated**

```bash
curl -s http://localhost:3000/api/transparency/missed-jobs
```
Expected: `{"error":"Unauthorized"}` with status 401.

- [ ] **Step 3: Smoke-test with seed data (optional)**

If you want to see real cards, insert one row into `match_results` for your profileId with a lower score than another row for the same `request_id`. The API will return one missed job with all 5 factors computed from your live profile.

---

## Rollback

If anything goes wrong after push:
```bash
git revert HEAD~2..HEAD   # reverts both commits
git push
```
No DB migrations — this is purely additive (new API route + page wiring). Safe to revert.
