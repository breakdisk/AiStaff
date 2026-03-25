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
| Client-side validation only | Server-side `tos_accepted` field validated in `PATCH /identity/profile/:id` |

**Out of scope:** KYC, Biometric Tier 2 ZKP UI, duplicate account merge flow.

---

## 2. Database

### Migration `0054_tos_accepted_at.sql`
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

### 3.1 OAuth Callback — `is_linked_account` flag

**File:** `src/oauth_handler.rs`

Add `is_linked_account: bool` to `OAuthCallbackResponse`:
- `true` when profile was resolved by email match (existing profile, new provider added)
- `false` when resolved by provider UID (returning user) or new profile created

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

### 3.2 `PATCH /identity/profile/:id` — extend to accept `tos_accepted`

**File:** `src/profile_handler.rs` (or equivalent handler)

Extend `UpdateProfileRequest`:
```rust
pub struct UpdateProfileRequest {
    pub bio:               Option<String>,
    pub hourly_rate_cents: Option<i32>,
    pub availability:      Option<String>,
    pub role:              Option<String>,
    pub tos_accepted:      Option<bool>,   // NEW
}
```

When `tos_accepted: true` is received, set `tos_accepted_at = NOW()` only if currently NULL (idempotent — never overwrite an existing acceptance timestamp).

### 3.3 `POST /identity/audit-events` — new batch endpoint

**File:** `src/audit_handler.rs` (new file)

Profile ID sourced from the `x-profile-id` header (set by Next.js proxy from session).

**Request body:**
```json
[
  { "event_type": "ROLE_SELECTED",       "event_data": { "role": "client" } },
  { "event_type": "TOS_ACCEPTED",        "event_data": { "tos_version": "1.0" } },
  { "event_type": "ONBOARDING_COMPLETE", "event_data": { "role": "client", "provider": "google" } }
]
```

**Constraints:**
- Max 10 events per batch
- `event_type` values validated against allowlist: `ROLE_SELECTED`, `TOS_ACCEPTED`, `ONBOARDING_COMPLETE`, `PROVIDER_CONNECTED`, `TIER_CHANGED`
- All rows inserted in a single transaction
- Returns `204 No Content` on success

---

## 4. Frontend — `apps/web`

### 4.1 Session types — `types/next-auth.d.ts`

Add `isLinkedAccount?: boolean` to both `Session["user"]` and `JWT`.

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

- Zinc-900 background, amber-400 border-left, zinc-50 text
- Dismissible (local state)
- Non-blocking — user proceeds normally

#### Change 2: ToS checkbox (StepClientGoal)
Add below the goal buttons, above the "Continue" CTA:

```
☐  I agree to the Terms of Service and Privacy Policy
```

- Links open `/terms` and `/privacy` in new tab
- "Continue" button disabled (`opacity-50 cursor-not-allowed`) until checked
- On check: immediately call `updateProfile(profileId, { tos_accepted: true })`
- If `updateProfile` fails: show inline red-500 error, keep button disabled

#### Change 3: `markDone()` — extended sequence (client path)

```
1. Guard: if (!tosChecked) return early   ← defensive, UI already prevents this
2. POST /api/identity/audit-events        ← 3 audit rows
3. POST /api/onboarding/welcome-email     ← fire-and-forget (non-blocking)
4. localStorage.setItem("onboarding_done", "true")
5. update(session)                        ← refresh JWT role/accountType
6. router.push("/marketplace")
```

Steps 2 and 3 are `Promise.allSettled` — failure of either does not block completion.

#### Change 4: Guard in other roles
Freelancer and agency `markDone()` paths are **unchanged** — ToS checkbox and audit batch are client-path only in this spec.

### 4.4 New API routes

#### `app/api/identity/audit-events/route.ts`
```
POST /api/identity/audit-events
Auth: session required (profile ID from session.user.profileId)
Proxies to: IDENTITY_SERVICE_URL/identity/audit-events
Adds header: x-profile-id: session.user.profileId
Returns: 204
```

#### `app/api/onboarding/welcome-email/route.ts`
```
POST /api/onboarding/welcome-email
Auth: session required
Calls: NOTIFICATION_SERVICE_URL/notify (2s timeout)
Body:
  recipient_email: session.user.email
  subject: "Welcome to AiStaff — you're all set"
  body: personalised plain-text with display_name, role, link to /marketplace
Returns: 200 { sent: true } or 200 { sent: false } — never 5xx
```

---

## 5. Data Flow

```
Client completes StepClientGoal
  │
  ├─ [checkbox checked] → PATCH /api/identity/profile/:id { tos_accepted: true }
  │                         → DB: unified_profiles.tos_accepted_at = NOW()
  │
  └─ [Continue clicked] → markDone()
        ├─ POST /api/identity/audit-events
        │    → identity_service → identity_audit_log (3 rows, 1 transaction)
        │
        ├─ POST /api/onboarding/welcome-email  (allSettled — non-blocking)
        │    → notification_service:3012/notify → SMTP email
        │
        ├─ localStorage onboarding_done = "true"
        ├─ NextAuth.update({ role: "client" })
        └─ router.push("/marketplace")
```

---

## 6. Audit Events Written Per Client

| Event | When | `event_data` |
|---|---|---|
| `ROLE_SELECTED` | Step 1 completion (role PATCH succeeds) | `{ "role": "client" }` |
| `TOS_ACCEPTED` | ToS checkbox checked | `{ "tos_version": "1.0" }` |
| `ONBOARDING_COMPLETE` | `markDone()` called | `{ "role": "client", "provider": "<oauth_provider>" }` |

---

## 7. Error Handling

| Failure | Behaviour |
|---|---|
| ToS PATCH fails | Red-500 inline error on checkbox; Continue button stays disabled |
| Audit batch fails | Logged to console; onboarding completion proceeds (non-fatal) |
| Welcome email fails | Silent (same pattern as proposals/submit); user is not blocked |
| Duplicate banner session read fails | Banner simply not shown (graceful degradation) |

---

## 8. Files Changed

| File | Change type |
|---|---|
| `migrations/0054_tos_accepted_at.sql` | New |
| `crates/identity_service/src/oauth_handler.rs` | Add `is_linked_account` to response |
| `crates/identity_service/src/profile_handler.rs` | Add `tos_accepted` field |
| `crates/identity_service/src/audit_handler.rs` | New endpoint |
| `crates/identity_service/src/main.rs` | Register new route |
| `apps/web/types/next-auth.d.ts` | Add `isLinkedAccount` |
| `apps/web/auth.ts` | Store `is_linked_account` in JWT/session |
| `apps/web/app/onboarding/page.tsx` | Banner + ToS checkbox + markDone() |
| `apps/web/app/api/identity/audit-events/route.ts` | New proxy route |
| `apps/web/app/api/onboarding/welcome-email/route.ts` | New email route |

---

## 9. Constraints & Non-Goals

- `tos_accepted_at` is **never overwritten** once set (idempotent)
- ToS version hardcoded as `"1.0"` — versioning system out of scope
- Welcome email is plain-text only — HTML templates out of scope
- Freelancer and agency onboarding paths are **not touched** in this spec
- No KYC, no Biometric Tier 2, no account merge flow
