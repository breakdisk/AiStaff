# Public Talent Profile Page — Design Spec

**Date:** 2026-03-19
**Status:** Approved

---

## Goal

Build a public `/talent/[id]` page so clients can view a talent's profile without authentication, while giving talents granular control over what is visible.

---

## Background

`GET /identity/public-profile/{id}` already exists in `identity_service` and returns: `profile_id`, `display_name`, `trust_score`, `identity_tier`, `bio`, `hourly_rate_cents`, `availability`, `role` (nullable). `GET /talent-skills/{id}` in `marketplace_service` (route mounted at service root) returns the talent's skill tags with proficiency + verified_at. Neither endpoint enforces privacy — that logic lives in the new Next.js layer.

---

## Architecture

No Rust changes. All new logic is in Next.js using `pg` Pool (same pattern as `/api/transparency/missed-jobs` and `/api/reputation/*/export`).

### Files

| File | Action | Purpose |
|---|---|---|
| `migrations/0039_profile_privacy.sql` | Create | `profile_privacy` table — per-talent visibility flags |
| `apps/web/app/api/talent/[id]/route.ts` | Create | Public `GET` — fetches profile + skills, applies privacy filter |
| `apps/web/app/api/talent/privacy/route.ts` | Create | Auth-gated `GET` + `PATCH` — read and update visibility settings |
| `apps/web/app/talent/[id]/page.tsx` | Create | Public profile page — no auth required, client component |
| `apps/web/middleware.ts` | Modify | Add `/talent/` to `isPublic` paths (page + API) |
| `apps/web/app/profile/page.tsx` | Modify | Add Privacy section to edit form |

---

## Database

### `profile_privacy` table (migration 0039)

```sql
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

- Row created on first `PATCH /api/talent/privacy` call (upsert).
- If no row exists for a profile, all fields default to visible (open-world assumption).

---

## API Routes

### `GET /api/talent/[id]`

**Auth:** None required — public endpoint.

**Logic:**
1. Validate `id` is a valid UUID (regex check) — return 400 if not.
2. Query `profile_privacy` via `pg` Pool for this `id` (LEFT JOIN / single SELECT; missing row = all defaults = all visible).
3. If `profile_public = false` → fetch only `display_name` and `role` from identity_service (`GET {IDENTITY_SERVICE_URL}/identity/public-profile/{id}`), then return `{ hidden: true, display_name, role: role ?? null }`. Do not fetch skills. Identity_service 404 on this call → return 404.
4. Fetch full profile from identity_service: `GET {IDENTITY_SERVICE_URL}/identity/public-profile/{id}`. If identity_service returns 404, return 404 to client immediately — do not consult `profile_privacy` row presence. 404 from identity_service always wins.
5. Fetch skills from marketplace_service: `GET {MARKETPLACE_SERVICE_URL}/talent-skills/{id}`. If this fails (404 or error), treat as empty skills array (non-fatal).
6. Apply privacy filter: omit fields whose flag is `false`.
7. Return unified response.

**Upstream URL notes:**
- identity_service: `GET {IDENTITY_SERVICE_URL}/identity/public-profile/{id}` — confirmed route from `identity_service/src/main.rs`.
- marketplace_service: `GET {MARKETPLACE_SERVICE_URL}/talent-skills/{id}` — route is mounted at service root (not prefixed). Confirm against `marketplace_service/src/main.rs` before implementing.

**Response shape:**

```typescript
interface PublicProfileResponse {
  profile_id:    string;
  display_name:  string;
  role:          string | null;      // null if not set (new user)
  hidden:        boolean;            // true = profile_public=false; only name+role present
  // conditionally present (omitted when privacy flag is false OR hidden=true):
  bio?:          string | null;
  hourly_rate_cents?: number | null;
  availability?: string;
  // identity_tier and trust_score are intentionally absent when hidden=true
  identity_tier?: string;
  trust_score?:  number;
  skills?:       Array<{
    tag:         string;
    domain:      string;
    proficiency: number;           // 1–5
    verified:    boolean;          // verified_at IS NOT NULL
  }>;
}
```

**Error responses:**
- `400` — invalid UUID format
- `404` — profile not found (identity_service returns 404; privacy row presence is irrelevant)
- `500` — upstream fetch failed

---

### `GET /api/talent/privacy`

**Auth:** Required — `auth()` session, uses `session.user.profileId`. Returns 401 if no session.

**Logic:**
1. Get `profileId` from session — return 401 if missing.
2. Query `profile_privacy` for `profileId`.
3. If no row, return the default values (all `true`).

**Response shape:**
```typescript
{
  profile_public:    boolean;  // default true
  show_bio:          boolean;  // default true
  show_rate:         boolean;  // default true
  show_skills:       boolean;  // default true
  show_trust_score:  boolean;  // default true
  show_availability: boolean;  // default true
}
```

---

### `PATCH /api/talent/privacy`

**Auth:** Required — `auth()` session, uses `session.user.profileId`. Returns 401 if no session.

**Request body** (all fields optional — partial update):
```typescript
{
  profile_public?:    boolean;
  show_bio?:          boolean;
  show_rate?:         boolean;
  show_skills?:       boolean;
  show_trust_score?:  boolean;
  show_availability?: boolean;
}
```

**Logic:**
1. Get `profileId` from session — return 401 if missing.
2. Validate all provided fields are booleans — return 400 on invalid type.
3. Upsert with **partial merge** — unspecified fields keep their existing DB value using `COALESCE(EXCLUDED.field, profile_privacy.field)`. This prevents a partial PATCH from silently resetting unspecified flags to `TRUE`.

```sql
INSERT INTO profile_privacy (profile_id, profile_public, show_bio, show_rate, show_skills, show_trust_score, show_availability, updated_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
ON CONFLICT (profile_id) DO UPDATE SET
  profile_public    = COALESCE(EXCLUDED.profile_public,    profile_privacy.profile_public),
  show_bio          = COALESCE(EXCLUDED.show_bio,          profile_privacy.show_bio),
  show_rate         = COALESCE(EXCLUDED.show_rate,         profile_privacy.show_rate),
  show_skills       = COALESCE(EXCLUDED.show_skills,       profile_privacy.show_skills),
  show_trust_score  = COALESCE(EXCLUDED.show_trust_score,  profile_privacy.show_trust_score),
  show_availability = COALESCE(EXCLUDED.show_availability, profile_privacy.show_availability),
  updated_at        = NOW()
```

Since COALESCE skips NULL, pass `null` (not `undefined`) for unspecified fields in the query parameters so the merge works correctly.

4. Return the full updated `profile_privacy` row (same shape as `GET /api/talent/privacy`).

---

## Public Profile Page (`/talent/[id]`)

**Route:** `apps/web/app/talent/[id]/page.tsx`
**Auth:** Not required — middleware marks `/talent/` as public.
**Rendering:** Client component (`"use client"`) — consistent with all other pages.

### Page states

| State | Condition | UI |
|---|---|---|
| Loading | Fetch in progress | Shimmer skeleton (avatar block + 3 content blocks) |
| Hidden | `hidden: true` | Avatar + name + "This talent has chosen to keep their profile private." |
| Not found | 404 from API | "Profile not found." with back link |
| Error | Network / 500 | "Could not load profile. Please try again." |
| Loaded | Success | Full profile (hidden sections simply absent — no "hidden" placeholder) |

### Loaded layout

```
┌──────────────────────────────────────────┐
│ [Avatar initials]  Display Name          │
│                    Role badge            │
│                    Availability chip ──▶ show_availability
├──────────────────────────────────────────┤
│ Bio text                           ──▶ show_bio
├──────────────────────────────────────────┤
│ $150/hr                            ──▶ show_rate
├──────────────────────────────────────────┤
│ Trust Score [bar]  Tier badge      ──▶ show_trust_score
├──────────────────────────────────────────┤
│ Skills                             ──▶ show_skills
│   rust ●●●●○ Verified ✓            │
│   kafka ●●●○○                      │
└──────────────────────────────────────────┘
```

- **Avatar:** coloured circle with initials derived from `display_name` (first char of first and last word)
- **Role badge:** zinc border pill — display value: "talent" → "Talent", "agent-owner" → "Agency Owner", "client" → "Client"; null role → no badge
- **Trust score bar:** amber progress bar 0–100, tier label beside it (UNVERIFIED / SOCIAL_VERIFIED / BIOMETRIC_VERIFIED)
- **Skills:** tag name + 5 proficiency dots (filled/empty) + green "Verified" chip if `verified = true`
- **No action buttons** on this page (Express Interest is a separate MVP task)
- **Design tokens:** zinc-950 background, zinc-900 surface, zinc-800 border, amber-400 accent, font-mono text

### Page does NOT include
- Sidebar navigation (public page — standalone layout)
- Edit controls
- Connected account details
- BYOK / AI provider settings
- Express Interest / contact button (deferred)

---

## Profile Page Changes (`/profile`)

Add a **Privacy** section at the bottom of the edit form — visible only when `editing === true`.

### Loading privacy settings

On mount (alongside existing profile/skills fetch), call `GET /api/talent/privacy` and store the result in a `privacy` state variable. Default to all-true while loading.

### Privacy section UI

Six toggle rows — one per flag:

| Toggle label | Controls |
|---|---|
| Public profile | `profile_public` |
| Show bio | `show_bio` |
| Show hourly rate | `show_rate` |
| Show skills | `show_skills` |
| Show trust score & tier | `show_trust_score` |
| Show availability | `show_availability` |

When `profile_public = false`, show an amber callout: "Your profile is hidden from public view. Only your name and role are visible."

### Saving privacy

A dedicated **"Save privacy"** button at the bottom of the Privacy section calls `PATCH /api/talent/privacy` with the current toggle state. This is intentionally decoupled from the main "Save profile" button — privacy and profile data are independent saves.

Toggle implementation: simple boolean state, rendered as a styled `<button>` that toggles between on/off visually (amber = on, zinc = off). No external toggle library.

---

## Middleware Change

`apps/web/middleware.ts` — add to the `isPublic` block only (do **not** add to the matcher regex exclusion list):

```typescript
pathname.startsWith("/talent/") ||          // Public talent profiles
pathname.startsWith("/api/talent/") ||      // Public talent API (profile + privacy GET/PATCH)
```

**Important:** `/api/talent/` must remain **inside** the matcher (not added to the negative lookahead). This ensures unauthenticated requests to `/api/talent/privacy` (PATCH) pass through the middleware and reach the route handler, which returns 401. If `/api/talent/` were in the matcher exclusion, the handler's auth check would never execute.

---

## Privacy Defaults

- New users: no `profile_privacy` row → all fields visible (open-world assumption)
- Talent can toggle any section at any time
- `profile_public = false` overrides all other flags — page shows hidden state regardless of other flags

---

## What This Does NOT Include

- CV / document upload
- Endorsements or client reviews
- Work history / past projects
- Contact / Express Interest button (separate task)
- Profile sharing link / copy URL button
- Analytics (profile view count)

---

## Verification Criteria

1. `GET /api/talent/{uuid}` returns full profile when no privacy row exists
2. `GET /api/talent/{uuid}` omits `bio` when `show_bio = false`; omits `trust_score`/`identity_tier` when `show_trust_score = false`
3. `GET /api/talent/{uuid}` returns `{ hidden: true, display_name, role }` (role may be null) when `profile_public = false`
4. `GET /api/talent/{uuid}` returns 404 for unknown UUID regardless of privacy row
5. `PATCH /api/talent/privacy` returns 401 without session
6. `PATCH /api/talent/privacy` with only `{ show_bio: false }` does not reset other flags
7. `GET /api/talent/privacy` returns all-true defaults when no row exists
8. `/talent/[id]` renders without auth (middleware allows through)
9. `/talent/[id]` shows shimmer → hidden/not-found/error/loaded states correctly
10. Profile edit form shows Privacy section when `editing = true`; privacy saves independently
