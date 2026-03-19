# Public Talent Profile + Privacy + Follow + Milestone Share — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a public `/talent/[id]` page with privacy controls, a follow button, and milestone achievement sharing — no auth required to view.

**Architecture:** Two new DB tables (`profile_privacy`, `talent_follows`) via migrations 0039–0040; four Next.js API routes (`GET /api/talent/[id]`, `GET+PATCH /api/talent/privacy`, `GET+POST /api/talent/[id]/follow`); a standalone public client-component page at `/talent/[id]`; `/talent/` added to middleware `isPublic`; Privacy section appended to the `/profile` edit form. All DB access via `pg` Pool (same pattern as `/api/transparency/missed-jobs`). Milestones computed client-side from profile data — no extra backend needed.

**Tech Stack:** Next.js 15 App Router (`"use client"`), `pg` Pool, Auth.js v5 `auth()`, Tailwind 4 (zinc/amber tokens), Lucide icons

**Spec:** `docs/superpowers/specs/2026-03-19-public-talent-profile-design.md`

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `migrations/0039_profile_privacy.sql` | Create | Per-talent visibility flags |
| `migrations/0040_talent_follows.sql` | Create | Follow relationships |
| `apps/web/app/api/talent/[id]/route.ts` | Create | Public GET — fetches profile+skills, applies privacy, includes follower_count |
| `apps/web/app/api/talent/privacy/route.ts` | Create | Auth-gated GET+PATCH for privacy settings |
| `apps/web/app/api/talent/[id]/follow/route.ts` | Create | Auth-gated GET+POST for follow toggle |
| `apps/web/app/talent/[id]/page.tsx` | Create | Public profile page — 5 states + follow button + milestone share |
| `apps/web/middleware.ts` | Modify | Add `/talent/` to `isPublic` |
| `apps/web/app/profile/page.tsx` | Modify | Add Privacy section + "Save privacy" button below edit form |

---

## Task 1: DB Migrations

**Files:**
- Create: `migrations/0039_profile_privacy.sql`
- Create: `migrations/0040_talent_follows.sql`

- [ ] **Step 1: Write migration 0039 — profile_privacy table**

```sql
-- migrations/0039_profile_privacy.sql
CREATE TABLE profile_privacy (
  profile_id        UUID PRIMARY KEY REFERENCES unified_profiles(id) ON DELETE CASCADE,
  profile_public    BOOLEAN NOT NULL DEFAULT TRUE,
  show_bio          BOOLEAN NOT NULL DEFAULT TRUE,
  show_rate         BOOLEAN NOT NULL DEFAULT TRUE,
  show_skills       BOOLEAN NOT NULL DEFAULT TRUE,
  show_trust_score  BOOLEAN NOT NULL DEFAULT TRUE,
  show_availability BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

- [ ] **Step 2: Write migration 0040 — talent_follows table**

```sql
-- migrations/0040_talent_follows.sql
CREATE TABLE talent_follows (
  follower_id  UUID NOT NULL REFERENCES unified_profiles(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES unified_profiles(id) ON DELETE CASCADE,
  followed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (follower_id, following_id)
);

CREATE INDEX idx_talent_follows_following ON talent_follows(following_id);
```

- [ ] **Step 3: Apply migrations**

```bash
docker compose up -d postgres
sqlx migrate run
```

Expected: `Applied 0039_profile_privacy.sql` and `Applied 0040_talent_follows.sql` printed with no errors.

- [ ] **Step 4: Verify tables exist**

```bash
docker compose exec postgres psql -U aistaff -d aistaff -c "\d profile_privacy"
docker compose exec postgres psql -U aistaff -d aistaff -c "\d talent_follows"
```

Expected: Both tables described with correct columns.

- [ ] **Step 5: Commit**

```bash
git add migrations/0039_profile_privacy.sql migrations/0040_talent_follows.sql
git commit -m "feat(db): add profile_privacy and talent_follows tables (0039-0040)"
```

---

## Task 2: Public Profile API — GET /api/talent/[id]

**Files:**
- Create: `apps/web/app/api/talent/[id]/route.ts`

This route is public (no auth). It:
1. Validates UUID
2. Reads `profile_privacy` from local pg (missing row = all visible)
3. Fetches profile from `identity_service`
4. Fetches skills from `marketplace_service` (non-fatal on failure)
5. Queries `follower_count` from `talent_follows`
6. Applies privacy filter
7. Returns combined response

- [ ] **Step 1: Create the route file**

`apps/web/app/api/talent/[id]/route.ts`:

```typescript
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
  idleTimeoutMillis: 30_000,
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PrivacyRow {
  profile_public: boolean;
  show_bio: boolean;
  show_rate: boolean;
  show_skills: boolean;
  show_trust_score: boolean;
  show_availability: boolean;
}

const PRIVACY_DEFAULTS: PrivacyRow = {
  profile_public: true,
  show_bio: true,
  show_rate: true,
  show_skills: true,
  show_trust_score: true,
  show_availability: true,
};

interface IdentityProfile {
  profile_id: string;
  display_name: string;
  trust_score: number;
  identity_tier: string;
  bio: string | null;
  hourly_rate_cents: number | null;
  availability: string;
  role: string | null;
}

interface SkillEntry {
  tag: string;
  domain: string;
  proficiency: number;
  verified_at: string | null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid UUID" }, { status: 400 });
  }

  let client;
  try {
    client = await pool.connect();

    // 1. Privacy settings (missing row = all defaults)
    const privacyResult = await client.query(
      `SELECT profile_public, show_bio, show_rate, show_skills, show_trust_score, show_availability
       FROM profile_privacy WHERE profile_id = $1`,
      [id],
    );
    const privacy: PrivacyRow = privacyResult.rows[0] ?? PRIVACY_DEFAULTS;

    // 2. Follower count
    const followResult = await client.query(
      `SELECT COUNT(*) AS count FROM talent_follows WHERE following_id = $1`,
      [id],
    );
    const follower_count = parseInt(followResult.rows[0]?.count ?? "0", 10);

    // 3. Fetch profile from identity_service — 404 always wins
    const identityRes = await fetch(
      `${process.env.IDENTITY_SERVICE_URL}/identity/public-profile/${id}`,
    );
    if (identityRes.status === 404) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }
    if (!identityRes.ok) {
      return NextResponse.json({ error: "Upstream error" }, { status: 500 });
    }
    const profile = await identityRes.json() as IdentityProfile;

    // 4. Hidden profile — return minimal response only
    if (!privacy.profile_public) {
      return NextResponse.json({
        profile_id: profile.profile_id,
        display_name: profile.display_name,
        role: profile.role ?? null,
        hidden: true,
        follower_count,
      });
    }

    // 5. Skills from marketplace_service (non-fatal)
    let skills: Array<{ tag: string; domain: string; proficiency: number; verified: boolean }> = [];
    if (privacy.show_skills) {
      try {
        const skillsRes = await fetch(
          `${process.env.MARKETPLACE_SERVICE_URL}/talent-skills/${id}`,
        );
        if (skillsRes.ok) {
          const data = await skillsRes.json() as { skills: SkillEntry[] };
          skills = (data.skills ?? []).map((s) => ({
            tag: s.tag,
            domain: s.domain,
            proficiency: s.proficiency,
            verified: s.verified_at !== null,
          }));
        }
      } catch {
        // non-fatal — treat as empty
      }
    }

    // 6. Build response applying privacy flags
    const response: Record<string, unknown> = {
      profile_id: profile.profile_id,
      display_name: profile.display_name,
      role: profile.role ?? null,
      hidden: false,
      follower_count,
    };
    if (privacy.show_bio)          response.bio = profile.bio;
    if (privacy.show_rate)         response.hourly_rate_cents = profile.hourly_rate_cents;
    if (privacy.show_availability) response.availability = profile.availability;
    if (privacy.show_trust_score) {
      response.trust_score = profile.trust_score;
      response.identity_tier = profile.identity_tier;
    }
    if (privacy.show_skills) response.skills = skills;

    return NextResponse.json(response);
  } catch (err) {
    console.error("[api/talent/[id]]", err);
    return NextResponse.json({ error: "Failed to load profile" }, { status: 500 });
  } finally {
    client?.release();
  }
}
```

- [ ] **Step 2: Build check**

```bash
cd apps/web && npm run build
```

Expected: Build completes with no TypeScript errors for the new route. (Other unrelated errors, if any, are pre-existing.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/api/talent/
git commit -m "feat(api): public GET /api/talent/[id] with privacy filter and follower_count"
```

---

## Task 3: Privacy API — GET + PATCH /api/talent/privacy

**Files:**
- Create: `apps/web/app/api/talent/privacy/route.ts`

Auth-gated. Note: Next.js static route `/api/talent/privacy` takes precedence over dynamic `/api/talent/[id]` — no conflict.

- [ ] **Step 1: Create the route file**

`apps/web/app/api/talent/privacy/route.ts`:

```typescript
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";
import { auth } from "@/auth";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
  idleTimeoutMillis: 30_000,
});

const DEFAULTS = {
  profile_public:    true,
  show_bio:          true,
  show_rate:         true,
  show_skills:       true,
  show_trust_score:  true,
  show_availability: true,
};

const FIELDS = [
  "profile_public",
  "show_bio",
  "show_rate",
  "show_skills",
  "show_trust_score",
  "show_availability",
] as const;

type PrivacyField = typeof FIELDS[number];

export async function GET() {
  const session = await auth();
  const profileId = (session?.user as { profileId?: string })?.profileId;
  if (!profileId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let client;
  try {
    client = await pool.connect();
    const result = await client.query(
      `SELECT profile_public, show_bio, show_rate, show_skills, show_trust_score, show_availability
       FROM profile_privacy WHERE profile_id = $1`,
      [profileId],
    );
    return NextResponse.json(result.rows[0] ?? DEFAULTS);
  } finally {
    client?.release();
  }
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  const profileId = (session?.user as { profileId?: string })?.profileId;
  if (!profileId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json() as Record<string, unknown>;

  for (const field of FIELDS) {
    if (field in body && typeof body[field] !== "boolean") {
      return NextResponse.json(
        { error: `${field} must be a boolean` },
        { status: 400 },
      );
    }
  }

  // null = unspecified → COALESCE keeps existing DB value
  const get = (f: PrivacyField): boolean | null =>
    f in body ? (body[f] as boolean) : null;

  let client;
  try {
    client = await pool.connect();
    const result = await client.query(
      `INSERT INTO profile_privacy
         (profile_id, profile_public, show_bio, show_rate, show_skills, show_trust_score, show_availability, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (profile_id) DO UPDATE SET
         profile_public    = COALESCE(EXCLUDED.profile_public,    profile_privacy.profile_public),
         show_bio          = COALESCE(EXCLUDED.show_bio,          profile_privacy.show_bio),
         show_rate         = COALESCE(EXCLUDED.show_rate,         profile_privacy.show_rate),
         show_skills       = COALESCE(EXCLUDED.show_skills,       profile_privacy.show_skills),
         show_trust_score  = COALESCE(EXCLUDED.show_trust_score,  profile_privacy.show_trust_score),
         show_availability = COALESCE(EXCLUDED.show_availability, profile_privacy.show_availability),
         updated_at        = NOW()
       RETURNING profile_public, show_bio, show_rate, show_skills, show_trust_score, show_availability`,
      [
        profileId,
        get("profile_public"),
        get("show_bio"),
        get("show_rate"),
        get("show_skills"),
        get("show_trust_score"),
        get("show_availability"),
      ],
    );
    return NextResponse.json(result.rows[0]);
  } finally {
    client?.release();
  }
}
```

- [ ] **Step 2: Build check**

```bash
cd apps/web && npm run build
```

Expected: No new TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/api/talent/privacy/
git commit -m "feat(api): GET+PATCH /api/talent/privacy with COALESCE partial upsert"
```

---

## Task 4: Follow API — GET + POST /api/talent/[id]/follow

**Files:**
- Create: `apps/web/app/api/talent/[id]/follow/route.ts`

GET is public (unauthenticated → `following` is absent from response). POST requires auth.

- [ ] **Step 1: Create the route file**

`apps/web/app/api/talent/[id]/follow/route.ts`:

```typescript
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";
import { auth } from "@/auth";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
  idleTimeoutMillis: 30_000,
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/talent/[id]/follow
// Public: returns follower_count.
// Authenticated: also returns whether the session user follows this profile.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid UUID" }, { status: 400 });
  }

  const session = await auth();
  const followerId = (session?.user as { profileId?: string })?.profileId;

  let client;
  try {
    client = await pool.connect();
    const countResult = await client.query(
      `SELECT COUNT(*) AS count FROM talent_follows WHERE following_id = $1`,
      [id],
    );
    const follower_count = parseInt(countResult.rows[0]?.count ?? "0", 10);

    let following = false;
    if (followerId && followerId !== id) {
      const followCheck = await client.query(
        `SELECT 1 FROM talent_follows WHERE follower_id = $1 AND following_id = $2`,
        [followerId, id],
      );
      following = followCheck.rows.length > 0;
    }

    return NextResponse.json({ follower_count, following });
  } finally {
    client?.release();
  }
}

// POST /api/talent/[id]/follow
// Toggles follow/unfollow. Returns { following: boolean, follower_count: number }.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid UUID" }, { status: 400 });
  }

  const session = await auth();
  const followerId = (session?.user as { profileId?: string })?.profileId;
  if (!followerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (followerId === id) {
    return NextResponse.json({ error: "Cannot follow yourself" }, { status: 400 });
  }

  let client;
  try {
    client = await pool.connect();

    const existingCheck = await client.query(
      `SELECT 1 FROM talent_follows WHERE follower_id = $1 AND following_id = $2`,
      [followerId, id],
    );
    const wasFollowing = existingCheck.rows.length > 0;

    if (wasFollowing) {
      await client.query(
        `DELETE FROM talent_follows WHERE follower_id = $1 AND following_id = $2`,
        [followerId, id],
      );
    } else {
      await client.query(
        `INSERT INTO talent_follows (follower_id, following_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [followerId, id],
      );
    }

    const countResult = await client.query(
      `SELECT COUNT(*) AS count FROM talent_follows WHERE following_id = $1`,
      [id],
    );
    const follower_count = parseInt(countResult.rows[0]?.count ?? "0", 10);

    return NextResponse.json({ following: !wasFollowing, follower_count });
  } finally {
    client?.release();
  }
}
```

- [ ] **Step 2: Build check**

```bash
cd apps/web && npm run build
```

Expected: No new TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/api/talent/
git commit -m "feat(api): GET+POST /api/talent/[id]/follow — follow toggle with follower count"
```

---

## Task 5: Middleware Update

**Files:**
- Modify: `apps/web/middleware.ts` (line 14–28 — the `isPublic` block)

**Important constraint from spec:** `/api/talent/` must stay **inside** the matcher regex (not added to the negative lookahead exclusion list). The `isPublic` flag allows unauthenticated access; being inside the matcher means auth-gated handlers (privacy, follow POST) still receive the request and can return 401 themselves.

- [ ] **Step 1: Add /talent/ to isPublic**

In `apps/web/middleware.ts`, find the `isPublic` block and add two lines after the `/api/generate-pdf` line:

Before:
```typescript
  const isPublic =
    pathname === "/" ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/og") ||
    pathname.startsWith("/api/stripe/webhook") ||
    pathname.startsWith("/api/network-intl/webhook") ||
    pathname.startsWith("/api/network-intl/callback") ||
    pathname.startsWith("/api/network-intl/diag") ||
    pathname.startsWith("/sign/") ||
    pathname.startsWith("/api/sign/") ||
    pathname.startsWith("/api/generate-pdf") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    /\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff2?|ttf|otf)$/i.test(pathname);
```

After:
```typescript
  const isPublic =
    pathname === "/" ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/og") ||
    pathname.startsWith("/api/stripe/webhook") ||
    pathname.startsWith("/api/network-intl/webhook") ||
    pathname.startsWith("/api/network-intl/callback") ||
    pathname.startsWith("/api/network-intl/diag") ||
    pathname.startsWith("/sign/") ||
    pathname.startsWith("/api/sign/") ||
    pathname.startsWith("/api/generate-pdf") ||
    pathname.startsWith("/talent/") ||           // Public talent profiles
    pathname.startsWith("/api/talent/") ||       // Public talent API (profile + privacy GET/PATCH)
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    /\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff2?|ttf|otf)$/i.test(pathname);
```

- [ ] **Step 2: Build check**

```bash
cd apps/web && npm run build
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/middleware.ts
git commit -m "feat(middleware): add /talent/ and /api/talent/ to isPublic paths"
```

---

## Task 6: Public Profile Page — /talent/[id]

**Files:**
- Create: `apps/web/app/talent/[id]/page.tsx`

Standalone layout (no AppSidebar). Client component. Five states: loading shimmer, hidden (private), not-found, error, loaded. Includes follow button and milestone achievement sharing.

**Avatar initials logic:** split `display_name` by spaces, take first char of first word + first char of last word, uppercase.

**Role badge labels:** `"talent"` → `"Talent"`, `"agent-owner"` → `"Agency Owner"`, `"client"` → `"Client"`, null → no badge.

**Milestone computation** (client-side, from profile response fields):
- `identity_tier === "BIOMETRIC_VERIFIED"` → "Biometric Verified"
- `identity_tier === "SOCIAL_VERIFIED"` → "Social Verified"
- `(skills ?? []).filter(s => s.verified).length >= 3` → "3+ Skills Verified"
- `trust_score >= 75` → "Trust Score 75+"

**Share behavior:** `navigator.share` if available; else `navigator.clipboard.writeText`. Share text: `Check out {display_name}'s profile on AiStaff — {milestone} · {window.location.href}`

- [ ] **Step 1: Create the page file**

`apps/web/app/talent/[id]/page.tsx`:

```typescript
"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import { Users, Share2, UserPlus, UserMinus, CheckCircle2, ArrowLeft } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Skill {
  tag:         string;
  domain:      string;
  proficiency: number;
  verified:    boolean;
}

interface PublicProfile {
  profile_id:        string;
  display_name:      string;
  role:              string | null;
  hidden:            boolean;
  follower_count:    number;
  // present when not hidden and privacy flags allow:
  bio?:              string | null;
  hourly_rate_cents?: number | null;
  availability?:     string;
  identity_tier?:    string;
  trust_score?:      number;
  skills?:           Skill[];
}

interface FollowState {
  following:      boolean;
  follower_count: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function initials(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return (words[0][0] ?? "?").toUpperCase();
  return ((words[0][0] ?? "") + (words[words.length - 1][0] ?? "")).toUpperCase();
}

function roleLabel(role: string | null): string | null {
  if (role === "talent")      return "Talent";
  if (role === "agent-owner") return "Agency Owner";
  if (role === "client")      return "Client";
  return null;
}

function availabilityColor(a: string): string {
  if (a === "available")     return "border-emerald-700 text-emerald-400";
  if (a === "busy")          return "border-amber-700 text-amber-400";
  return "border-zinc-700 text-zinc-500";
}

function tierLabel(tier: string): string {
  if (tier === "BIOMETRIC_VERIFIED") return "Biometric Verified";
  if (tier === "SOCIAL_VERIFIED")    return "Social Verified";
  return "Unverified";
}

function computeMilestones(profile: PublicProfile): string[] {
  const milestones: string[] = [];
  if (profile.identity_tier === "BIOMETRIC_VERIFIED") milestones.push("Biometric Verified");
  else if (profile.identity_tier === "SOCIAL_VERIFIED") milestones.push("Social Verified");
  const verifiedSkills = (profile.skills ?? []).filter((s) => s.verified).length;
  if (verifiedSkills >= 3) milestones.push(`${verifiedSkills} Skills Verified`);
  if ((profile.trust_score ?? 0) >= 75) milestones.push("Trust Score 75+");
  return milestones;
}

async function shareAchievement(displayName: string, milestone: string) {
  const url = window.location.href;
  const text = `${displayName} achieved "${milestone}" on AiStaff — the AI talent marketplace with ZK identity verification.`;
  if (typeof navigator.share === "function") {
    await navigator.share({ title: displayName, text, url }).catch(() => {});
  } else {
    await navigator.clipboard.writeText(`${text} ${url}`).catch(() => {});
  }
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function ProfileSkeleton() {
  return (
    <div className="animate-pulse space-y-4" aria-hidden="true">
      <div className="border border-zinc-800 rounded-sm bg-zinc-900 p-5">
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 rounded-sm bg-zinc-800 flex-shrink-0" />
          <div className="flex-1 space-y-2 pt-1">
            <div className="h-4 bg-zinc-800 rounded w-40" />
            <div className="h-3 bg-zinc-800 rounded w-24" />
            <div className="h-3 bg-zinc-800 rounded w-32" />
          </div>
        </div>
      </div>
      <div className="h-16 border border-zinc-800 rounded-sm bg-zinc-900" />
      <div className="h-24 border border-zinc-800 rounded-sm bg-zinc-900" />
    </div>
  );
}

// ── Proficiency dots ───────────────────────────────────────────────────────────

function ProficiencyDots({ value }: { value: number }) {
  return (
    <span className="flex gap-0.5" aria-label={`Proficiency ${value} of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={`w-2 h-2 rounded-full ${i <= value ? "bg-amber-400" : "bg-zinc-700"}`}
        />
      ))}
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TalentProfilePage() {
  const params   = useParams<{ id: string }>();
  const router   = useRouter();
  const { data: session } = useSession();

  const profileId = params.id;
  const sessionProfileId = (session?.user as { profileId?: string } | undefined)?.profileId;

  const [profile,    setProfile]    = useState<PublicProfile | null>(null);
  const [loadState,  setLoadState]  = useState<"loading" | "loaded" | "hidden" | "not-found" | "error">("loading");
  const [followState, setFollowState] = useState<FollowState>({ following: false, follower_count: 0 });
  const [following,  setFollowing]  = useState(false);

  // Load profile
  useEffect(() => {
    if (!profileId) return;
    fetch(`/api/talent/${profileId}`)
      .then((res) => {
        if (res.status === 404) { setLoadState("not-found"); return null; }
        if (!res.ok)            { setLoadState("error");     return null; }
        return res.json() as Promise<PublicProfile>;
      })
      .then((data) => {
        if (!data) return;
        setProfile(data);
        setFollowState((prev) => ({ ...prev, follower_count: data.follower_count }));
        setLoadState(data.hidden ? "hidden" : "loaded");
      })
      .catch(() => setLoadState("error"));
  }, [profileId]);

  // Load follow state for authenticated users
  useEffect(() => {
    if (!profileId || !sessionProfileId || sessionProfileId === profileId) return;
    fetch(`/api/talent/${profileId}/follow`)
      .then((res) => res.ok ? res.json() as Promise<FollowState> : null)
      .then((data) => {
        if (!data) return;
        setFollowState(data);
        setFollowing(data.following);
      })
      .catch(() => {});
  }, [profileId, sessionProfileId]);

  const handleFollow = useCallback(async () => {
    if (!sessionProfileId) { router.push("/login"); return; }
    const res = await fetch(`/api/talent/${profileId}/follow`, { method: "POST" });
    if (!res.ok) return;
    const data = await res.json() as FollowState;
    setFollowState(data);
    setFollowing(data.following);
  }, [profileId, sessionProfileId, router]);

  const isOwnProfile = sessionProfileId === profileId;

  // ── Not Found ─────────────────────────────────────────────────────────────

  if (loadState === "not-found") {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
        <div className="text-center space-y-3">
          <p className="font-mono text-sm text-zinc-300">Profile not found.</p>
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1.5 font-mono text-xs text-amber-400 hover:text-amber-300 mx-auto"
          >
            <ArrowLeft className="w-3 h-3" /> Go back
          </button>
        </div>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────

  if (loadState === "error") {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
        <p className="font-mono text-sm text-zinc-400" role="alert">
          Could not load profile. Please try again.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur-sm">
        <div className="max-w-2xl mx-auto px-4 h-12 flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1.5 font-mono text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>
          <span className="font-mono text-xs text-zinc-400">Profile</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4 pb-24">

        {/* Loading state */}
        {loadState === "loading" && (
          <div aria-busy="true" aria-label="Loading profile">
            <ProfileSkeleton />
          </div>
        )}

        {/* Hidden profile */}
        {loadState === "hidden" && profile && (
          <div className="border border-zinc-800 rounded-sm bg-zinc-900 p-5 space-y-4">
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-sm bg-zinc-800 border border-zinc-700
                              flex items-center justify-center flex-shrink-0">
                <span className="font-mono text-xl font-medium text-zinc-300">
                  {initials(profile.display_name)}
                </span>
              </div>
              <div className="flex-1 space-y-1.5">
                <p className="font-mono text-base font-medium text-zinc-100">
                  {profile.display_name}
                </p>
                {roleLabel(profile.role) && (
                  <span className="inline-block font-mono text-[10px] border border-zinc-700
                                   text-zinc-400 px-1.5 py-0.5 rounded-sm">
                    {roleLabel(profile.role)}
                  </span>
                )}
              </div>
            </div>
            <p className="font-mono text-xs text-zinc-500">
              This talent has chosen to keep their profile private.
            </p>
            {/* Follow button even on hidden profiles */}
            {!isOwnProfile && (
              <FollowButton
                following={following}
                followerCount={followState.follower_count}
                onFollow={handleFollow}
              />
            )}
          </div>
        )}

        {/* Loaded profile */}
        {loadState === "loaded" && profile && (
          <>
            {/* Identity card */}
            <div className="border border-zinc-800 rounded-sm bg-zinc-900 p-5 space-y-4">
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 rounded-sm bg-zinc-800 border border-zinc-700
                                flex items-center justify-center flex-shrink-0">
                  <span className="font-mono text-xl font-medium text-zinc-300">
                    {initials(profile.display_name)}
                  </span>
                </div>
                <div className="flex-1 min-w-0 space-y-1.5">
                  <p className="font-mono text-base font-medium text-zinc-100">
                    {profile.display_name}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    {roleLabel(profile.role) && (
                      <span className="font-mono text-[10px] border border-zinc-700
                                       text-zinc-400 px-1.5 py-0.5 rounded-sm">
                        {roleLabel(profile.role)}
                      </span>
                    )}
                    {profile.availability && (
                      <span className={`font-mono text-[10px] border px-1.5 py-0.5 rounded-sm capitalize
                                        ${availabilityColor(profile.availability)}`}>
                        {profile.availability.replace("-", " ")}
                      </span>
                    )}
                    {profile.hourly_rate_cents != null && (
                      <span className="font-mono text-[10px] text-zinc-500">
                        ${Math.round(profile.hourly_rate_cents / 100)}/hr
                      </span>
                    )}
                  </div>
                  {profile.bio && (
                    <p className="font-mono text-xs text-zinc-400 leading-relaxed">
                      {profile.bio}
                    </p>
                  )}
                </div>
              </div>

              {/* Follow row */}
              {!isOwnProfile && (
                <FollowButton
                  following={following}
                  followerCount={followState.follower_count}
                  onFollow={handleFollow}
                />
              )}
              {isOwnProfile && followState.follower_count > 0 && (
                <div className="flex items-center gap-1.5 font-mono text-xs text-zinc-500">
                  <Users className="w-3.5 h-3.5" />
                  {followState.follower_count} follower{followState.follower_count !== 1 ? "s" : ""}
                </div>
              )}
            </div>

            {/* Trust score */}
            {profile.trust_score != null && profile.identity_tier && (
              <div className="border border-zinc-800 rounded-sm bg-zinc-900 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
                    Trust Score
                  </span>
                  <span className="font-mono text-[10px] text-zinc-400 tabular-nums">
                    {profile.trust_score} / 100
                  </span>
                </div>
                <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-400 rounded-full transition-all"
                    style={{ width: `${profile.trust_score}%` }}
                  />
                </div>
                <span className="inline-block font-mono text-[10px] border border-zinc-700
                                 text-zinc-400 px-1.5 py-0.5 rounded-sm">
                  {tierLabel(profile.identity_tier)}
                </span>
              </div>
            )}

            {/* Skills */}
            {(profile.skills ?? []).length > 0 && (
              <div className="border border-zinc-800 rounded-sm bg-zinc-900 p-4 space-y-3">
                <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
                  Skills
                </p>
                <div className="space-y-2">
                  {(profile.skills ?? []).map((skill) => (
                    <div key={skill.tag} className="flex items-center gap-3">
                      <span className="font-mono text-xs text-zinc-200 w-28 truncate">
                        {skill.tag}
                      </span>
                      <ProficiencyDots value={skill.proficiency} />
                      {skill.verified && (
                        <span className="flex items-center gap-1 font-mono text-[10px] text-emerald-400">
                          <CheckCircle2 className="w-3 h-3" /> Verified
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Milestones */}
            <MilestoneSection profile={profile} />
          </>
        )}
      </main>
    </div>
  );
}

// ── Follow Button ─────────────────────────────────────────────────────────────

function FollowButton({
  following,
  followerCount,
  onFollow,
}: {
  following:     boolean;
  followerCount: number;
  onFollow:      () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={onFollow}
        className={`flex items-center gap-1.5 h-8 px-3 rounded-sm border font-mono text-xs transition-all ${
          following
            ? "border-amber-400/40 bg-amber-400/10 text-amber-400 hover:bg-amber-400/5"
            : "border-zinc-700 text-zinc-300 hover:border-amber-400/40 hover:text-amber-400"
        }`}
        aria-label={following ? "Unfollow" : "Follow"}
      >
        {following
          ? <><UserMinus className="w-3.5 h-3.5" /> Following</>
          : <><UserPlus className="w-3.5 h-3.5" /> Follow</>}
      </button>
      {followerCount > 0 && (
        <span className="flex items-center gap-1 font-mono text-xs text-zinc-500">
          <Users className="w-3.5 h-3.5" />
          {followerCount} follower{followerCount !== 1 ? "s" : ""}
        </span>
      )}
    </div>
  );
}

// ── Milestones ────────────────────────────────────────────────────────────────

function MilestoneSection({ profile }: { profile: PublicProfile }) {
  const milestones = computeMilestones(profile);
  if (milestones.length === 0) return null;

  return (
    <div className="border border-zinc-800 rounded-sm bg-zinc-900 p-4 space-y-3">
      <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
        Milestones
      </p>
      <div className="space-y-2">
        {milestones.map((milestone) => (
          <div key={milestone} className="flex items-center justify-between">
            <span className="font-mono text-xs text-zinc-200">{milestone}</span>
            <button
              onClick={() => shareAchievement(profile.display_name, milestone)}
              className="flex items-center gap-1 h-6 px-2 rounded-sm border border-zinc-700
                         font-mono text-[10px] text-zinc-500 hover:border-amber-400/40
                         hover:text-amber-400 transition-colors"
              aria-label={`Share ${milestone}`}
            >
              <Share2 className="w-3 h-3" /> Share
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build check**

```bash
cd apps/web && npm run build
```

Expected: No TypeScript errors. The `/talent/[id]` route is now built.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/talent/
git commit -m "feat(page): public /talent/[id] profile page with follow button and milestone sharing"
```

---

## Task 7: Profile Page — Privacy Section

**Files:**
- Modify: `apps/web/app/profile/page.tsx`

Add a privacy state, fetch on mount, and a `PrivacySection` component rendered below `EditForm` when `editing === true`. Privacy saves independently via a dedicated "Save privacy" button.

- [ ] **Step 1: Add privacy state and fetch to ProfilePage**

In `apps/web/app/profile/page.tsx`, in the `ProfilePage` function:

After line 430 (`const [liveTier, setLiveTier] = useState<string | null>(null);`), add:

```typescript
  const [privacy, setPrivacy] = useState({
    profile_public:    true,
    show_bio:          true,
    show_rate:         true,
    show_skills:       true,
    show_trust_score:  true,
    show_availability: true,
  });
  const [privacySaving, setPrivacySaving] = useState(false);
  const [privacyMsg,    setPrivacyMsg]    = useState<string | null>(null);
```

- [ ] **Step 2: Fetch privacy settings on mount**

In the existing `useEffect` (around line 440), after the `fetchPublicProfile` call block, add:

```typescript
    fetch("/api/talent/privacy")
      .then((res) => res.ok ? res.json() : null)
      .then((data) => { if (data) setPrivacy(data); })
      .catch(() => {});
```

- [ ] **Step 3: Add privacy save handler**

After `function handleDisconnect(...)` in `ProfilePage`, add:

```typescript
  async function handleSavePrivacy() {
    setPrivacySaving(true);
    setPrivacyMsg(null);
    try {
      const res = await fetch("/api/talent/privacy", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(privacy),
      });
      if (res.ok) {
        const updated = await res.json() as typeof privacy;
        setPrivacy(updated);
        setPrivacyMsg("Privacy settings saved.");
      } else {
        setPrivacyMsg("Failed to save — try again.");
      }
    } catch {
      setPrivacyMsg("Backend offline — changes noted locally.");
    } finally {
      setPrivacySaving(false);
    }
  }
```

- [ ] **Step 4: Add PrivacySection component** (above the `ProfilePage` function, not inside it)

After the `EditForm` component definition (around line 402), add:

```typescript
// ── Privacy section ───────────────────────────────────────────────────────────

type PrivacySettings = {
  profile_public:    boolean;
  show_bio:          boolean;
  show_rate:         boolean;
  show_skills:       boolean;
  show_trust_score:  boolean;
  show_availability: boolean;
};

function PrivacySection({
  privacy,
  saving,
  msg,
  onChange,
  onSave,
}: {
  privacy:  PrivacySettings;
  saving:   boolean;
  msg:      string | null;
  onChange: (field: keyof PrivacySettings, value: boolean) => void;
  onSave:   () => void;
}) {
  const rows: Array<{ key: keyof PrivacySettings; label: string }> = [
    { key: "profile_public",    label: "Public profile"        },
    { key: "show_bio",          label: "Show bio"               },
    { key: "show_rate",         label: "Show hourly rate"        },
    { key: "show_skills",       label: "Show skills"             },
    { key: "show_trust_score",  label: "Show trust score & tier" },
    { key: "show_availability", label: "Show availability"       },
  ];

  return (
    <div className="border border-zinc-800 rounded-sm bg-zinc-900 p-4 space-y-3">
      <p className="font-mono text-xs text-zinc-400 uppercase tracking-widest">Privacy</p>

      {!privacy.profile_public && (
        <div className="border border-amber-900 bg-amber-950/20 px-3 py-2 rounded-sm">
          <p className="font-mono text-[10px] text-amber-400">
            Your profile is hidden from public view. Only your name and role are visible.
          </p>
        </div>
      )}

      <div className="divide-y divide-zinc-800">
        {rows.map(({ key, label }) => (
          <div key={key} className="flex items-center justify-between py-2.5">
            <span className="font-mono text-xs text-zinc-300">{label}</span>
            <button
              type="button"
              onClick={() => onChange(key, !privacy[key])}
              className={`relative w-10 h-5 rounded-sm border transition-all ${
                privacy[key]
                  ? "bg-amber-400/20 border-amber-400/60"
                  : "bg-zinc-800 border-zinc-700"
              }`}
              aria-pressed={privacy[key]}
              aria-label={label}
            >
              <span className={`absolute top-0.5 bottom-0.5 w-3.5 rounded-sm transition-all ${
                privacy[key] ? "right-0.5 bg-amber-400" : "left-0.5 bg-zinc-600"
              }`} />
            </button>
          </div>
        ))}
      </div>

      {msg && (
        <p className="font-mono text-[10px] text-amber-400 border border-amber-900 bg-amber-950/20 px-2 py-1.5 rounded-sm">
          {msg}
        </p>
      )}

      <button
        onClick={onSave}
        disabled={saving}
        className="w-full h-9 flex items-center justify-center gap-2 rounded-sm border
                   border-zinc-700 text-zinc-300 font-mono text-xs
                   hover:border-zinc-500 hover:text-zinc-100 disabled:opacity-40 transition-all"
      >
        {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</> : "Save privacy"}
      </button>
    </div>
  );
}
```

- [ ] **Step 5: Render PrivacySection in the JSX**

In the `ProfilePage` JSX, after the closing `</div>` of the `EditForm` block (around line 685), add:

```tsx
        {/* Privacy section (edit mode only) */}
        {editing && (
          <PrivacySection
            privacy={privacy}
            saving={privacySaving}
            msg={privacyMsg}
            onChange={(field, value) => setPrivacy((p) => ({ ...p, [field]: value }))}
            onSave={handleSavePrivacy}
          />
        )}
```

Also add the public profile link in view mode (below the Identity card, around line 671), after the trust score bar block:

```tsx
        {/* Public profile link (view mode) */}
        {!editing && profileId && (
          <div className="flex items-center gap-2">
            <a
              href={`/talent/${profileId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[10px] text-zinc-500 hover:text-amber-400 transition-colors"
            >
              View public profile →
            </a>
          </div>
        )}
```

- [ ] **Step 6: Build check**

```bash
cd apps/web && npm run build
```

Expected: No TypeScript errors. Verify that `PrivacySection` props and the privacy state type are consistent.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/profile/page.tsx
git commit -m "feat(profile): add Privacy section to edit form with per-field toggles and independent save"
```

---

## Verification Checklist

After all tasks are complete, verify:

- [ ] `GET /api/talent/{uuid}` returns full profile when no privacy row exists
- [ ] `GET /api/talent/{uuid}` with `show_bio=false` in DB omits `bio` from response
- [ ] `GET /api/talent/{uuid}` with `profile_public=false` returns `{ hidden: true, display_name, role, follower_count }`
- [ ] `GET /api/talent/{uuid}` returns 404 for unknown UUID
- [ ] `PATCH /api/talent/privacy` without session returns 401
- [ ] `PATCH /api/talent/privacy` with `{ show_bio: false }` only — GET after returns `show_bio: false`, all other flags still `true`
- [ ] `GET /api/talent/privacy` returns all-true defaults when no row exists
- [ ] `/talent/{uuid}` loads without auth (open browser in incognito)
- [ ] Follow button appears on other users' profiles; follower count increments on click
- [ ] Milestone chips appear for BIOMETRIC_VERIFIED tier or 3+ verified skills; share button copies text or opens share dialog
- [ ] Privacy section appears in profile edit form; "Save privacy" saves independently from "Save profile"
- [ ] Profile page shows "View public profile →" link in view mode
