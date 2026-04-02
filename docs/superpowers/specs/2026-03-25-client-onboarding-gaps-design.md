# Client Onboarding Gaps — Design Spec
**Date:** 2026-03-25
**Scope:** Lightweight gap-fill for client onboarding flow (Option B selected)
**Approach:** Option C — Hybrid (frontend-driven notification, server-side audit)

---

## 1. Goals

Fill five lightweight gaps in the existing client onboarding wizard:

| Gap | Solution |
|---|---|
| No ToS acceptance | Inline checkbox on final client step; `tos_accepted_at` written to DB |
| No welcome email | Fire-and-forget POST to `notification_service` on wizard completion |
| No audit log | Batch `POST /identity/audit-events` writes 3 events to `identity_audit_log` |
| No duplicate account warning | `is_linked_account` flag from OAuth callback; amber banner on StepWelcome |
| Client-side validation only | Server-side `tos_accepted` field validated in `PATCH /profile/{id}` |

**Out of scope:** KYC, Biometric Tier 2 ZKP UI, duplicate account merge flow.

---

## 2. Database

### Migration `0054_tos_accepted_at.sql`
Migration number confirmed: last committed migration is `0053_announcements.sql`.

```sql
ALTER TABLE unified_profiles
  ADD COLUMN tos_accepted_at TIMESTAMPTZ;
```

No changes to `identity_audit_log` — table already exists (migration 0018) with the correct schema:
```
id, profile_id, event_type, event_data (JSONB), old_tier, new_tier,
old_score, new_score, actor_id, created_at
```

---

## 3. Backend — `crates/identity_service`

All routes registered in `src/main.rs` (confirmed: no separate router module).
Axum 0.8 route param syntax: `{id}` throughout.

### 3.1 OAuth Callback — `is_linked_account` flag

**File:** `src/oauth_handler.rs`

Add `is_linked_account: bool` to `OAuthCallbackResponse`:
- `true` when profile was resolved by email match (existing profile, new provider added)
- `false` when resolved by provider UID (returning user) or new profile created

`OAuthCallbackResponse` is defined in `crates/common/src/types/identity.rs` (line 107)
and imported by `oauth_handler.rs`. Both files require changes:

**`crates/common/src/types/identity.rs`** — add field to struct:
```rust
pub struct OAuthCallbackResponse {
    pub profile_id:        Uuid,
    pub identity_tier:     String,
    pub trust_score:       i16,
    pub account_type:      String,
    pub role:              Option<String>,
    pub is_admin:          bool,
    pub is_linked_account: bool,   // NEW
}
```

**`crates/identity_service/src/oauth_handler.rs`** — populate the field in the `Ok(OAuthCallbackResponse { ... })` return (line 75): set `is_linked_account` to `true` when the profile resolution path was the email-match branch.

### 3.2 `PATCH /profile/{id}` — extend to accept `tos_accepted`

**File:** `src/main.rs` — `update_profile` function (line 190) and `UpdateProfilePayload` struct
(line 183). The handler lives directly in `main.rs`, not in `handlers.rs`.

Extend `UpdateProfilePayload`:
```rust
struct UpdateProfilePayload {
    bio:               Option<String>,
    hourly_rate_cents: Option<i32>,    // i32 — matches existing INT column (migration 0017)
    availability:      Option<String>,
    role:              Option<String>,
    tos_accepted:      Option<bool>,   // NEW
}
```

When `tos_accepted: true` is received, set `tos_accepted_at = NOW()` only if currently NULL
(idempotent — never overwrite an existing acceptance timestamp).

### 3.3 `POST /identity/audit-events` — new batch endpoint

**File:** `src/audit_handler.rs` (new file); route registered in `src/main.rs`.

**Auth:** Profile ID is included in the request body (injected by the Next.js proxy from
`session.user.profileId`). The handler validates that the `profile_id` in the body references
a real row in `unified_profiles` before inserting.

**Request body:**
```json
{
  "profile_id": "uuid-v7",
  "events": [
    { "event_type": "ROLE_SELECTED",       "event_data": { "role": "client" } },
    { "event_type": "TOS_ACCEPTED",        "event_data": { "tos_version": "1.0" } },
    { "event_type": "ONBOARDING_COMPLETE", "event_data": { "role": "client", "provider": "google" } }
  ]
}
```

**Constraints:**
- Max 10 events per batch
- `event_type` validated against allowlist: `ROLE_SELECTED`, `TOS_ACCEPTED`,
  `ONBOARDING_COMPLETE`, `PROVIDER_CONNECTED`, `TIER_CHANGED`
- All rows inserted in a single transaction
- Returns `204 No Content` on success

---

## 4. Frontend — `apps/web`

### 4.1 Session types — `types/next-auth.d.ts`

Add `isLinkedAccount?: boolean` to both `Session["user"]` and `JWT`
(follows existing pattern in that file for `profileId`, `trustScore`, etc.).

### 4.2 `auth.ts` — store `is_linked_account` in JWT

In the `jwt` callback, after the identity_service call:
```typescript
token.isLinkedAccount = identityData.is_linked_account ?? false;
```

In the `session` callback:
```typescript
session.user.isLinkedAccount = token.isLinkedAccount as boolean;
```

### 4.3 `onboarding/page.tsx` — 4 changes

#### Change 1: Duplicate account banner (StepWelcome)
Render an amber info banner at the top of `StepWelcome` when `session.user.isLinkedAccount === true`:

```
ℹ  We linked [Provider] to your existing account ([email]).
   Your trust score has been updated.
```

- Zinc-900 background, amber-400 left border, zinc-50 text
- Dismissible via local `useState` boolean
- Non-blocking — user proceeds normally

#### Change 2: ToS checkbox (StepClientGoal)
Add below the goal buttons, above the "Continue" CTA:

```
☐  I agree to the Terms of Service and Privacy Policy
```

- Links open `/terms` and `/privacy` in a new tab
- `tosChecked` state is set to `true` **only after** `updateProfile(profileId, { tos_accepted: true })`
  resolves successfully — not on the raw checkbox click
- "Continue" button disabled (`opacity-50 cursor-not-allowed`) while `!tosChecked`
- On PATCH failure: show inline red-500 error beneath checkbox; `tosChecked` stays `false`

#### Change 3: `markDone()` — extended sequence (client path)

```
1. Guard: if (!tosChecked) return early        ← defensive; tosChecked only true after PATCH succeeded
2. Promise.allSettled([
     POST /api/onboarding/audit-events,         ← 3 audit rows, non-blocking
     POST /api/onboarding/welcome-email,       ← fire-and-forget, non-blocking
   ])
3. localStorage.setItem("onboarding_done", "true")
4. update(session)                             ← refresh JWT role/accountType
5. router.push("/marketplace")
```

Both async calls in step 2 use `Promise.allSettled` — failure of either does not block completion.

#### Change 4: Guard in other roles
Freelancer and agency `markDone()` paths are **unchanged** — ToS checkbox and audit batch
are client-path only in this spec.

### 4.4 New API routes

#### `app/api/onboarding/audit-events/route.ts`
**Path is `/api/onboarding/...` — NOT `/api/identity/...`.**
The `next.config.ts` rewrite `source: "/api/identity/:path*"` would bypass the Next.js route
handler entirely, breaking the server-side profile_id injection. Using `/api/onboarding/`
avoids the rewrite and keeps the profile_id injection secure.

```
POST /api/onboarding/audit-events
Auth:    session required; returns 401 if no session
Body in: { events: AuditEvent[] }  ← from onboarding page (no profile_id)
Body out to identity_service: { profile_id: session.user.profileId, events: [...] }
Proxies to: IDENTITY_SERVICE_URL/identity/audit-events
Returns: 204 on success; forwards error status on failure
```
Profile ID is never trusted from the client request — always sourced from the server-side session.

#### `app/api/onboarding/welcome-email/route.ts`
```
POST /api/onboarding/welcome-email
Auth:    session required; returns 401 if no session
Calls:   NOTIFICATION_SERVICE_URL/notify  (AbortSignal.timeout(2000))
Body:
  recipient_email: session.user.email
  subject:         "Welcome to AiStaff — you're all set"
  body:            plain-text with display_name, role, link to /marketplace
Returns: 200 { sent: true } or 200 { sent: false } — never 5xx (same pattern as proposals/submit)
```

---

## 5. Data Flow

```
New client logs in via OAuth
  │
  └─ identity_service oauth-callback
       ├─ resolved by email match → is_linked_account: true
       └─ new profile / returning user → is_linked_account: false
            │
            └─ auth.ts stores isLinkedAccount in JWT

Client reaches /onboarding (role === null)
  │
  ├─ Step 0 (StepWelcome): if isLinkedAccount → amber banner shown
  ├─ Step 1 (StepRole): select "client" → PATCH /profile/{id} { role: "client" }
  └─ Step 2 (StepClientGoal):
       ├─ [checkbox clicked] → PATCH /profile/{id} { tos_accepted: true }
       │                         → unified_profiles.tos_accepted_at = NOW() (if NULL)
       │                         → tosChecked = true (only on success)
       │
       └─ [Continue clicked] → markDone()
             ├─ Promise.allSettled([
             │    POST /api/onboarding/audit-events → identity_audit_log (3 rows, 1 tx),
             │    POST /api/onboarding/welcome-email → notification_service → SMTP
             │  ])
             ├─ localStorage onboarding_done = "true"
             ├─ NextAuth.update({ role: "client", accountType: "individual" })
             └─ router.push("/marketplace")
```

---

## 6. Audit Events Written Per Client

All three events are sent together in a single batch inside `markDone()`.
The "When" column describes the logical meaning of each event, not the time of the API call.

| Event | Logical meaning | `event_data` |
|---|---|---|
| `ROLE_SELECTED` | User chose "client" in step 1 | `{ "role": "client" }` |
| `TOS_ACCEPTED` | User checked the ToS box (PATCH already persisted) | `{ "tos_version": "1.0" }` |
| `ONBOARDING_COMPLETE` | Wizard finished | `{ "role": "client", "provider": "<oauth_provider>" }` |

---

## 7. Error Handling

| Failure | Behaviour |
|---|---|
| ToS PATCH fails | Red-500 inline error on checkbox; `tosChecked` stays false; Continue stays disabled |
| Audit batch fails | `console.error`; onboarding completion proceeds (non-fatal) |
| Welcome email fails | Silent; user not blocked (same pattern as `proposals/submit/route.ts`) |
| Duplicate banner: `isLinkedAccount` missing from session | Banner not shown (graceful degradation) |

---

## 8. Files Changed

| File | Change type |
|---|---|
| `migrations/0054_tos_accepted_at.sql` | New |
| `crates/common/src/types/identity.rs` | Add `is_linked_account` field to `OAuthCallbackResponse` struct |
| `crates/identity_service/src/oauth_handler.rs` | Populate `is_linked_account` in response |
| `crates/identity_service/src/audit_handler.rs` | New file — batch audit endpoint |
| `crates/identity_service/src/main.rs` | Add `tos_accepted` to `UpdateProfilePayload`; `mod audit_handler`; register `POST /identity/audit-events` |
| `apps/web/types/next-auth.d.ts` | Add `isLinkedAccount?: boolean` to Session + JWT |
| `apps/web/auth.ts` | Store + forward `is_linked_account` in JWT/session callbacks |
| `apps/web/app/onboarding/page.tsx` | Duplicate banner + ToS checkbox + extended `markDone()` |
| `apps/web/app/api/onboarding/audit-events/route.ts` | New — injects profile_id from session, proxies to identity_service |
| `apps/web/app/api/onboarding/welcome-email/route.ts` | New welcome email route |

---

## 9. Constraints & Non-Goals

- `tos_accepted_at` is **never overwritten** once set (idempotent — `WHERE tos_accepted_at IS NULL`)
- ToS version hardcoded as `"1.0"` — versioning system out of scope
- Welcome email is plain-text only — HTML templates out of scope
- Freelancer and agency onboarding paths are **not touched** in this spec
- No KYC, no Biometric Tier 2, no account merge flow
- `profile_id` in audit-events body is always overwritten server-side from session — client cannot spoof it
