# Public Talent Profile Page — Design Spec

**Date:** 2026-03-19
**Status:** Approved

---

## Goal

Build a public `/talent/[id]` page so clients can view a talent's profile without authentication, while giving talents granular control over what is visible.

---

## Background

`GET /identity/public-profile/{id}` already exists in `identity_service` and returns: `profile_id`, `display_name`, `trust_score`, `identity_tier`, `bio`, `hourly_rate_cents`, `availability`, `role`. `GET /marketplace/talent-skills/{id}` returns the talent's skill tags with proficiency + verified_at. Neither endpoint enforces privacy — that logic lives in the new Next.js layer.

---

## Architecture

No Rust changes. All new logic is in Next.js using `pg` Pool (same pattern as `/api/transparency/missed-jobs` and `/api/reputation/*/export`).

### Files

| File | Action | Purpose |
|---|---|---|
| `migrations/0039_profile_privacy.sql` | Create | `profile_privacy` table — per-talent visibility flags |
| `apps/web/app/api/talent/[id]/route.ts` | Create | Public `GET` — fetches profile + skills, applies privacy filter |
| `apps/web/app/api/talent/privacy/route.ts` | Create | Auth-gated `PATCH` — talent updates their own visibility settings |
| `apps/web/app/talent/[id]/page.tsx` | Create | Public profile page — no auth required, client component |
| `apps/web/middleware.ts` | Modify | Add `/talent/` to `isPublic` paths |
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
1. Validate `id` is a UUID.
2. Fetch privacy settings from `profile_privacy` (LEFT JOIN so missing row = all defaults = all visible).
3. If `profile_public = false` → return `{ hidden: true, display_name, role }` (name + role always shown).
4. Fetch profile from identity_service: `GET {IDENTITY_SERVICE_URL}/identity/public-profile/{id}`.
5. Fetch skills from marketplace_service: `GET {MARKETPLACE_SERVICE_URL}/talent-skills/{id}`.
6. Strip hidden fields per privacy flags before returning.
7. Return unified response.

**Response shape:**

```typescript
interface PublicProfileResponse {
  profile_id:    string;
  display_name:  string;
  role:          string;
  hidden:        boolean;           // true = profile_public=false, only name+role present
  // conditionally present (omitted if privacy flag is false):
  bio?:          string | null;
  hourly_rate_cents?: number | null;
  availability?: string;
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
- `404` — profile not found (identity_service returns 404)
- `500` — upstream fetch failed

### `PATCH /api/talent/privacy`

**Auth:** Required — `auth()` session, uses `session.user.profileId`.

**Request body:**
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
2. Validate all provided fields are booleans.
3. Upsert into `profile_privacy` (INSERT ... ON CONFLICT DO UPDATE).
4. Return updated privacy settings.

---

## Public Profile Page (`/talent/[id]`)

**Route:** `apps/web/app/talent/[id]/page.tsx`
**Auth:** Not required — middleware marks `/talent/` as public.
**Rendering:** Client component (`"use client"`) — consistent with all other pages.

### Page states

| State | Condition | UI |
|---|---|---|
| Loading | Fetch in progress | Shimmer skeleton (avatar + 3 content blocks) |
| Hidden | `hidden: true` | Name + "This talent has chosen to keep their profile private." |
| Not found | 404 from API | "Profile not found." |
| Error | Network / 500 | "Could not load profile. Please try again." |
| Loaded | Success | Full profile (with hidden sections omitted) |

### Loaded layout

```
┌──────────────────────────────────────────┐
│ [Avatar initials]  Display Name          │
│                    Role badge            │
│                    Availability chip ──▶ show_availability
├──────────────────────────────────────────┤
│ Bio text                           ──▶ show_bio
├──────────────────────────────────────────┤
│ $150/hr  ·  Available              ──▶ show_rate
├──────────────────────────────────────────┤
│ Trust Score [bar]  Tier badge      ──▶ show_trust_score
├──────────────────────────────────────────┤
│ Skills                             ──▶ show_skills
│   rust ●●●●○ Verified ✓            │
│   kafka ●●●○○                      │
└──────────────────────────────────────────┘
```

- Avatar: coloured circle with initials (no file upload; initials from `display_name`)
- Role badge: zinc border pill ("talent" / "client" / "agent-owner")
- Trust score bar: amber progress bar 0–100, tier label beside it
- Skills: tag name + proficiency dots (filled/empty) + green "Verified" if `verified_at` was set
- No action buttons on this page (Express Interest is a separate MVP task)
- Design tokens: zinc-950 background, zinc-900 surface, zinc-800 border, amber-400 accent — matches existing app

### Page does NOT include
- Sidebar navigation (public page — no app shell)
- Edit controls
- Connected account details
- BYOK / AI provider settings
- Express Interest / contact button (deferred — separate task)

---

## Profile Page Changes (`/profile`)

Add a **Privacy** section at the bottom of the edit form (visible only when `editing === true`).

Six toggle rows — one per privacy flag:

| Toggle label | Controls |
|---|---|
| Public profile | `profile_public` |
| Show bio | `show_bio` |
| Show hourly rate | `show_rate` |
| Show skills | `show_skills` |
| Show trust score & tier | `show_trust_score` |
| Show availability | `show_availability` |

When "Public profile" is OFF, a callout appears: "Your profile is hidden from public view. Only your name and role are visible."

Privacy settings are **saved separately** from the main profile save — a dedicated "Save privacy" button calls `PATCH /api/talent/privacy`. This avoids coupling privacy state to the profile form.

Privacy settings are **loaded on mount** (alongside skills/profile) via `GET /api/talent/[profileId]` (reuses the public endpoint — no new fetch needed; the talent's own profile returns all fields regardless of privacy since the page is rendered server-side with no auth restriction on the GET endpoint).

Wait — actually the public GET endpoint strips fields based on privacy. To load *current* privacy settings into the edit form, a separate fetch is needed: `GET /api/talent/privacy` (auth-gated, returns the raw `profile_privacy` row for the current user).

### `GET /api/talent/privacy`

**Auth:** Required.
**Returns:** Current `profile_privacy` row for `session.user.profileId`, or all-default values if no row exists.

---

## Middleware Change

`apps/web/middleware.ts` — add to the `isPublic` block:

```typescript
pathname.startsWith("/talent/") ||          // Public talent profiles
pathname.startsWith("/api/talent/") ||      // Public talent profile API
```

Note: `/api/talent/privacy` is auth-gated in the route handler itself (returns 401), so it is safe to exclude from the middleware auth check. The middleware would otherwise redirect API calls to `/login` instead of returning 401.

---

## Privacy Defaults

- New users: no `profile_privacy` row → API returns all fields (open-world default = fully visible)
- Talent can opt out of any section at any time
- Toggling `profile_public = false` overrides all other flags — page shows hidden state regardless

---

## What This Does NOT Include

- CV / document upload (no file storage in scope)
- Endorsements or client reviews
- Work history / past projects
- Contact / Express Interest button (separate task)
- Profile sharing link button (nice-to-have, not required)
- Analytics (profile view count)

---

## Verification Criteria

1. `GET /api/talent/{uuid}` returns full profile when no privacy row exists
2. `GET /api/talent/{uuid}` omits `bio` when `show_bio = false`
3. `GET /api/talent/{uuid}` returns `{ hidden: true, display_name, role }` when `profile_public = false`
4. `GET /api/talent/{uuid}` returns 404 for unknown UUID
5. `PATCH /api/talent/privacy` returns 401 without session
6. `PATCH /api/talent/privacy` upserts correctly on first and subsequent saves
7. `/talent/[id]` renders without auth (middleware allows through)
8. `/talent/[id]` shows shimmer → loads → displays correct sections
9. Profile edit form shows Privacy section when `editing = true`
10. Toggling privacy and saving reflects on the public page on reload
