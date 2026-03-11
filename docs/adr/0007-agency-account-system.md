# ADR 0007 — Agency Account System

**Date:** 2026-03-11
**Status:** Accepted
**Affects:** `identity_service`, `marketplace_service`, `apps/web`

---

## Context

AiStaffGlobal originally modelled every account as an individual profile
(`unified_profiles`). Two gaps emerged during MVP validation:

1. **Missing listing metadata.** The `agent_listings` table lacked `category`
   (`AiTalent | AiStaff | AiRobot`) and `seller_type` (`Freelancer | Agency`)
   columns, even though the frontend TypeScript types defined them and the UI
   rendered them. The backend silently dropped both fields on write and omitted
   them on read.

2. **No org-level identity.** Agencies — teams of AI installers operating under
   a shared brand — had no first-class representation. They could not publish
   listings under an org name, manage members, or signal trust at the org level.

---

## Decision

### 1. Fix `agent_listings` schema (migration 0019)

Add `category TEXT NOT NULL DEFAULT 'AiStaff'` and
`seller_type TEXT NOT NULL DEFAULT 'Freelancer'` to `agent_listings`.
Use TEXT (not a PG enum) to avoid `$2::enum_type` cast boilerplate in
non-macro SQLx queries. Validation is enforced at the application layer
in `marketplace_service/src/handlers.rs`.

### 2. Agency identity on `unified_profiles` (migration 0019)

Add two nullable columns to `unified_profiles`:
- `account_type TEXT NOT NULL DEFAULT 'individual'` — flipped to `'agency'`
  on org creation.
- `org_name TEXT` — human-readable org label; duplicated from `agencies.name`
  for fast profile queries without a join.

### 3. New `agencies` table (migration 0019)

```
agencies (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID NOT NULL REFERENCES unified_profiles(id) ON DELETE RESTRICT,
  name        TEXT NOT NULL,
  handle      TEXT NOT NULL UNIQUE,   -- slug, lowercase, 3–40 chars
  description TEXT,
  website_url TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
```

`ON DELETE RESTRICT` on `owner_id` prevents profile deletion while an agency
exists, preserving the audit trail.

### 4. `POST /agencies` in `identity_service`

A new top-level route (not under `/identity/`) handles agency creation:

- Validates `handle` format (lowercase alphanumeric + hyphens, 3–40 chars).
- Updates owner's `account_type = 'agency'` and `org_name` atomically before
  inserting the `agencies` row.
- Returns 409 on duplicate `handle` (unique constraint `agencies_handle_key`).
- Uses `Uuid::now_v7()` for `agency_id` to maintain time-ordering invariant.

### 5. Frontend

- `api.ts` — `createAgency()` function, proxied via `/api/identity/agencies`
  → `http://localhost:3001/agencies`.
- `onboarding/page.tsx` — "I run an Agency" added as a third role option.
  Steps 3–4 collect `org_name` and `handle`; values are staged in
  `localStorage` (`org_name`, `org_handle`) and cleaned up on success.
- `agency/register/page.tsx` — dedicated full-page form; pre-fills from
  localStorage; handles 409 conflict inline; success state routes to
  `/marketplace`.

---

## Consequences

**Positive**
- Agencies can be created and listed as a distinct `seller_type` in the
  marketplace without breaking existing Freelancer flows.
- DB fix closes a silent data-loss bug present since the first listing migration.
- `account_type` on `unified_profiles` is the foundation for future org-level
  permissions (member roster, aggregate trust score, Phase 3 SOW auto-proposal).

**Negative / Trade-offs**
- No org-level OAuth. Agencies authenticate as the owner's individual account.
  The `owner_id` FK ties an agency to one profile; multi-admin and team member
  invitations are deferred to Phase 3.
- `org_name` is denormalised onto `unified_profiles` for query convenience.
  A rename of `agencies.name` requires a second UPDATE on `unified_profiles`.
  Accepted for MVP read-path simplicity.

---

## Alternatives Rejected

| Alternative | Reason rejected |
|---|---|
| PG enum for `seller_type` / `category` | Requires `ALTER TYPE` migrations on every new value; non-macro `sqlx::query()` cast syntax adds noise; TEXT + app-layer validation preferred. |
| Separate `agency_profiles` table (no columns on `unified_profiles`) | Would require a join on every identity lookup; account_type flag on the base table is cheaper and sufficient for MVP. |
| Org-level OAuth (GitHub org, Google Workspace) | Significant identity_service scope increase; deferred to Phase 3 per v2 business model roadmap. |
| Agency creation during onboarding (call API inline) | `profileId` from NextAuth session JWT may not be available during wizard; safer to buffer in localStorage and finalise on `/agency/register`. |
