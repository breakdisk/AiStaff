# Client Onboarding Gaps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill five lightweight gaps in the client onboarding wizard — ToS acceptance, welcome email, audit log, duplicate account banner, and server-side tos validation.

**Architecture:** One DB migration adds `tos_accepted_at`; identity_service gains `is_linked_account` in its OAuth response and a new `/identity/audit-events` batch endpoint; two new Next.js API routes handle audit proxying and welcome email; `onboarding/page.tsx` wires the duplicate banner, ToS checkbox, and extended `markDone()`.

**Tech Stack:** Rust 1.94 / Axum 0.8 / SQLx 0.8 (identity_service), Next.js 15 / NextAuth v5 / TypeScript (frontend), PostgreSQL (unified_profiles + identity_audit_log).

**Spec:** `docs/superpowers/specs/2026-03-25-client-onboarding-gaps-design.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `migrations/0054_tos_accepted_at.sql` | Create | Add `tos_accepted_at TIMESTAMPTZ` to `unified_profiles` |
| `crates/common/src/types/identity.rs` | Modify (line 107) | Add `is_linked_account: bool` to `OAuthCallbackResponse` |
| `crates/identity_service/src/oauth_handler.rs` | Modify | `upsert_profile` → returns `(Uuid, bool)`; populate field in response |
| `crates/identity_service/src/main.rs` | Modify (lines 183–220) | Add `tos_accepted` to `UpdateProfilePayload`; `mod audit_handler`; register route |
| `crates/identity_service/src/audit_handler.rs` | Create | Batch audit-events endpoint |
| `apps/web/types/next-auth.d.ts` | Modify | Add `isLinkedAccount?: boolean` to Session + JWT |
| `apps/web/auth.ts` | Modify (lines 28–35, 222–249) | Forward `is_linked_account` through JWT → session |
| `apps/web/app/api/onboarding/audit-events/route.ts` | Create | Inject `profile_id` from session; proxy to identity_service |
| `apps/web/app/api/onboarding/welcome-email/route.ts` | Create | Call notification_service; fire-and-forget |
| `apps/web/app/onboarding/page.tsx` | Modify | Duplicate banner on StepWelcome; ToS checkbox on StepClientGoal; extended markDone() |

---

## Task 1: Database Migration

**Files:**
- Create: `migrations/0054_tos_accepted_at.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- migrations/0054_tos_accepted_at.sql
ALTER TABLE unified_profiles
  ADD COLUMN tos_accepted_at TIMESTAMPTZ;
```

- [ ] **Step 2: Verify file exists with correct content**

```bash
cat migrations/0054_tos_accepted_at.sql
```
Expected: the ALTER TABLE line above, nothing else.

- [ ] **Step 3: Commit**

```bash
git add migrations/0054_tos_accepted_at.sql
git commit -m "feat(db): add tos_accepted_at to unified_profiles"
```

---

## Task 2: Add `is_linked_account` to common OAuthCallbackResponse

**Files:**
- Modify: `crates/common/src/types/identity.rs:107-119`

The struct currently ends at line 119 with `is_admin`. Add the new field after it.

- [ ] **Step 1: Write the unit test first**

In `crates/common/src/types/identity.rs`, add inside the existing `#[cfg(test)]` block (or create one at the bottom of the file):

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn oauth_callback_response_is_linked_account_defaults_false() {
        // Deserialising a payload that omits is_linked_account must default to false
        // (existing callers don't send it yet — serde default is required)
        let json = r#"{
            "profile_id": "00000000-0000-0000-0000-000000000001",
            "identity_tier": "UNVERIFIED",
            "trust_score": 0,
            "account_type": "individual",
            "role": null,
            "is_admin": false
        }"#;
        let r: OAuthCallbackResponse = serde_json::from_str(json).unwrap();
        assert!(!r.is_linked_account);
    }
}
```

- [ ] **Step 2: Run test — expect FAIL (field doesn't exist yet)**

```bash
$env:SQLX_OFFLINE="true"; cargo test -p common oauth_callback_response_is_linked_account 2>&1
```
Expected: compile error — `unknown field is_linked_account` or field not found.

- [ ] **Step 3: Add the field to the struct**

In `crates/common/src/types/identity.rs`, find the `OAuthCallbackResponse` struct (line 107) and add the field:

```rust
// BEFORE (lines 107-119):
pub struct OAuthCallbackResponse {
    pub profile_id: Uuid,
    pub identity_tier: String,
    pub trust_score: i16,
    pub account_type: String,
    pub role: Option<String>,
    #[serde(default)]
    pub is_admin: bool,
}

// AFTER:
pub struct OAuthCallbackResponse {
    pub profile_id: Uuid,
    pub identity_tier: String,
    pub trust_score: i16,
    pub account_type: String,
    pub role: Option<String>,
    #[serde(default)]
    pub is_admin: bool,
    /// True when this login resolved an existing profile by email match
    /// (new OAuth provider linked to an existing account).
    #[serde(default)]
    pub is_linked_account: bool,
}
```

`#[serde(default)]` is **required** — existing identity_service responses don't include this field yet; without `default` the frontend's `auth.ts` JSON parse would fail for any cached responses.

- [ ] **Step 4: Run test — expect PASS**

```bash
$env:SQLX_OFFLINE="true"; cargo test -p common oauth_callback_response_is_linked_account 2>&1
```
Expected: `test types::identity::tests::oauth_callback_response_is_linked_account_defaults_false ... ok`

- [ ] **Step 5: Commit**

```bash
git add crates/common/src/types/identity.rs
git commit -m "feat(common): add is_linked_account to OAuthCallbackResponse"
```

---

## Task 3: Populate `is_linked_account` in oauth_handler

**Files:**
- Modify: `crates/identity_service/src/oauth_handler.rs`

The key change: `upsert_profile` currently returns `Result<Uuid>`. Change it to return `Result<(Uuid, bool)>` where the `bool` is `true` only when the **email-match branch** was taken (cross-provider account linking).

- [ ] **Step 1: Write the unit test**

Add to the `#[cfg(test)]` block in `crates/identity_service/src/oauth_handler.rs` (or create one):

```rust
#[cfg(test)]
mod tests {
    use super::*;

    /// The email-match resolution path is the only one that sets is_linked_account.
    /// We can test this by checking which branch of upsert_profile's logic is
    /// exercised — pure enum-style, no DB needed.
    #[test]
    fn linked_account_only_on_email_match() {
        // provider_match  → (_, false)
        // email_match     → (_, true)
        // new_insert      → (_, false)
        // existing_profile_id (connect flow) → (_, false)
        //
        // This is a logic invariant test — the bool returned by upsert_profile
        // must be true ONLY for the email-match branch.
        // Verified by reading the match arms in upsert_profile_with_flag.
        assert_eq!(resolve_link_flag(ResolutionPath::ByProvider), false);
        assert_eq!(resolve_link_flag(ResolutionPath::ByEmail),    true);
        assert_eq!(resolve_link_flag(ResolutionPath::NewInsert),  false);
    }
}
```

Add the supporting enum + pure function at the bottom of the file (above `#[cfg(test)]`):

```rust
/// Resolution path taken during upsert — used to derive is_linked_account.
#[derive(Debug, PartialEq)]
pub(crate) enum ResolutionPath { ByProvider, ByEmail, NewInsert }

pub(crate) fn resolve_link_flag(path: ResolutionPath) -> bool {
    path == ResolutionPath::ByEmail
}
```

- [ ] **Step 2: Run test — expect PASS (pure function, no DB)**

```bash
$env:SQLX_OFFLINE="true"; cargo test -p identity_service linked_account_only_on_email_match 2>&1
```
Expected: `test oauth_handler::tests::linked_account_only_on_email_match ... ok`

- [ ] **Step 3: Change `upsert_profile` to return `(Uuid, bool)`**

In `oauth_handler.rs`, replace the `upsert_profile` function and update its call-site in `handle_oauth_callback`:

```rust
// upsert_profile — now returns (profile_id, is_linked_account)
async fn upsert_profile(db: &PgPool, p: &OAuthCallbackPayload) -> Result<(Uuid, bool)> {
    if let Some(id) = find_by_provider(db, p).await? {
        return Ok((id, false)); // returning user — same provider
    }
    if let Some(id) = find_by_email(db, &p.email).await? {
        return Ok((id, true)); // email match — new provider linked to existing account
    }
    let id = insert_profile(db, p).await?;
    Ok((id, false)) // brand new profile
}
```

In `handle_oauth_callback` (line 42–46), update the call-site and populate the response field:

```rust
// BEFORE:
let profile_id = match payload.existing_profile_id {
    Some(id) => id,
    None => upsert_profile(db, &payload).await?,
};

// AFTER:
let (profile_id, is_linked_account) = match payload.existing_profile_id {
    // connect-provider flow: user is already logged in, linking a new provider.
    // Not a "duplicate account" situation — show no warning.
    Some(id) => (id, false),
    None => upsert_profile(db, &payload).await?,
};
```

And at the `Ok(OAuthCallbackResponse { ... })` return (line 75), add the field:

```rust
Ok(OAuthCallbackResponse {
    profile_id,
    identity_tier: tier_label(tier),
    trust_score: score,
    account_type,
    role,
    is_admin,
    is_linked_account,  // NEW
})
```

- [ ] **Step 4: Cargo check — no errors**

```bash
$env:SQLX_OFFLINE="true"; cargo check -p identity_service 2>&1
```
Expected: no errors, 0 warnings (or only pre-existing warnings).

- [ ] **Step 5: Run full tests**

```bash
$env:SQLX_OFFLINE="true"; cargo test -p identity_service 2>&1
```
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add crates/identity_service/src/oauth_handler.rs
git commit -m "feat(identity): populate is_linked_account on email-match OAuth resolution"
```

---

## Task 4: Extend UpdateProfilePayload with `tos_accepted`

**Files:**
- Modify: `crates/identity_service/src/main.rs:183-220`

- [ ] **Step 1: Write the unit test**

Add at the bottom of `main.rs` (in existing `#[cfg(test)]` or new block):

```rust
#[cfg(test)]
mod tests {
    #[test]
    fn tos_accepted_payload_deserialises() {
        // Verify the new field parses correctly and is optional
        let with_tos: serde_json::Value =
            serde_json::from_str(r#"{"tos_accepted": true}"#).unwrap();
        assert_eq!(with_tos["tos_accepted"], true);

        // Missing field must not error (Option<bool>)
        let without: serde_json::Value =
            serde_json::from_str(r#"{"bio": "hello"}"#).unwrap();
        assert!(without.get("tos_accepted").is_none());
    }
}
```

- [ ] **Step 2: Run test — expect PASS (pure JSON test, no DB needed)**

```bash
$env:SQLX_OFFLINE="true"; cargo test -p identity_service tos_accepted_payload_deserialises 2>&1
```

- [ ] **Step 3: Add `tos_accepted` to `UpdateProfilePayload` (line 183)**

```rust
// BEFORE (lines 182-188):
#[derive(Debug, Deserialize)]
struct UpdateProfilePayload {
    bio: Option<String>,
    hourly_rate_cents: Option<i32>,
    availability: Option<String>,
    role: Option<String>,
}

// AFTER:
#[derive(Debug, Deserialize)]
struct UpdateProfilePayload {
    bio: Option<String>,
    hourly_rate_cents: Option<i32>,
    availability: Option<String>,
    role: Option<String>,
    tos_accepted: Option<bool>,  // NEW — writes tos_accepted_at = NOW() if NULL
}
```

- [ ] **Step 4: Update the `update_profile` SQL handler (line 195)**

Replace the `update_profile` function body with:

```rust
async fn update_profile(
    State(pool): State<sqlx::PgPool>,
    Path(id): Path<Uuid>,
    Json(payload): Json<UpdateProfilePayload>,
) -> impl IntoResponse {
    let res = sqlx::query(
        "UPDATE unified_profiles
         SET bio               = COALESCE($2, bio),
             hourly_rate_cents = COALESCE($3, hourly_rate_cents),
             availability      = COALESCE($4, availability),
             role              = COALESCE($5, role),
             tos_accepted_at   = CASE
                                   WHEN $6 = TRUE AND tos_accepted_at IS NULL
                                   THEN NOW()
                                   ELSE tos_accepted_at
                                 END,
             updated_at        = NOW()
         WHERE id = $1",
    )
    .bind(id)
    .bind(&payload.bio)
    .bind(payload.hourly_rate_cents)
    .bind(&payload.availability)
    .bind(&payload.role)
    .bind(payload.tos_accepted.unwrap_or(false))
    .execute(&pool)
    .await;

    match res {
        Ok(r) if r.rows_affected() == 0 => StatusCode::NOT_FOUND.into_response(),
        Ok(_) => (StatusCode::OK, Json(serde_json::json!({ "ok": true }))).into_response(),
        Err(e) => {
            tracing::error!("update_profile: {e:#}");
            (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response()
        }
    }
}
```

Key design: `CASE WHEN $6 = TRUE AND tos_accepted_at IS NULL THEN NOW() ELSE tos_accepted_at END` — idempotent, never overwrites an existing timestamp.

- [ ] **Step 5: Cargo check — no errors**

```bash
$env:SQLX_OFFLINE="true"; cargo check -p identity_service 2>&1
```

- [ ] **Step 6: Commit**

```bash
git add crates/identity_service/src/main.rs
git commit -m "feat(identity): add tos_accepted to update_profile — writes tos_accepted_at idempotently"
```

---

## Task 5: New `audit_handler.rs` — batch audit-events endpoint

**Files:**
- Create: `crates/identity_service/src/audit_handler.rs`

- [ ] **Step 0: Verify `serde_json` is in identity_service Cargo.toml**

```bash
grep "serde_json" crates/identity_service/Cargo.toml
```
If missing, add `serde_json.workspace = true` to `[dependencies]`. It is almost certainly already present transitively, but must be listed explicitly for `use serde_json;` to compile without warning.

- [ ] **Step 1: Write the unit test for the allowlist validator**

Create the file with the test first:

```rust
// crates/identity_service/src/audit_handler.rs
use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use serde_json;      // required for serde_json::Value + serde_json::json!()
use sqlx::PgPool;
use uuid::Uuid;

// ── Types ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct AuditBatchRequest {
    pub profile_id: Uuid,
    pub events: Vec<AuditEvent>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct AuditEvent {
    pub event_type: String,
    pub event_data: serde_json::Value,
}

const ALLOWED_EVENT_TYPES: &[&str] = &[
    "ROLE_SELECTED",
    "TOS_ACCEPTED",
    "ONBOARDING_COMPLETE",
    "PROVIDER_CONNECTED",
    "TIER_CHANGED",
];

pub(crate) fn validate_event_types(events: &[AuditEvent]) -> Result<(), String> {
    for ev in events {
        if !ALLOWED_EVENT_TYPES.contains(&ev.event_type.as_str()) {
            return Err(format!("invalid event_type: {}", ev.event_type));
        }
    }
    Ok(())
}

// ── Handler ───────────────────────────────────────────────────────────────────

pub async fn batch_audit_events(
    State(pool): State<PgPool>,
    Json(body): Json<AuditBatchRequest>,
) -> StatusCode {
    if body.events.is_empty() {
        return StatusCode::NO_CONTENT;
    }
    if body.events.len() > 10 {
        return StatusCode::UNPROCESSABLE_ENTITY;
    }
    if let Err(e) = validate_event_types(&body.events) {
        tracing::warn!("audit_events rejected: {e}");
        return StatusCode::UNPROCESSABLE_ENTITY;
    }

    // Verify profile exists — propagate DB errors as 500, not 404
    let exists: Option<(Uuid,)> =
        match sqlx::query_as("SELECT id FROM unified_profiles WHERE id = $1")
            .bind(body.profile_id)
            .fetch_optional(&pool)
            .await
        {
            Ok(row) => row,
            Err(e) => {
                tracing::error!("audit_events profile check: {e:#}");
                return StatusCode::INTERNAL_SERVER_ERROR;
            }
        };

    if exists.is_none() {
        return StatusCode::NOT_FOUND;
    }

    // Insert all rows in one transaction
    let mut tx = match pool.begin().await {
        Ok(t) => t,
        Err(e) => {
            tracing::error!("audit_events tx begin: {e:#}");
            return StatusCode::INTERNAL_SERVER_ERROR;
        }
    };

    for ev in &body.events {
        let res = sqlx::query(
            "INSERT INTO identity_audit_log
               (id, profile_id, event_type, event_data, created_at)
             VALUES ($1, $2, $3, $4, NOW())",
        )
        .bind(Uuid::now_v7())
        .bind(body.profile_id)
        .bind(&ev.event_type)
        .bind(&ev.event_data)
        .execute(&mut *tx)
        .await;

        if let Err(e) = res {
            tracing::error!("audit_events insert: {e:#}");
            let _ = tx.rollback().await;
            return StatusCode::INTERNAL_SERVER_ERROR;
        }
    }

    match tx.commit().await {
        Ok(_) => StatusCode::NO_CONTENT,
        Err(e) => {
            tracing::error!("audit_events commit: {e:#}");
            StatusCode::INTERNAL_SERVER_ERROR
        }
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn ev(event_type: &str) -> AuditEvent {
        AuditEvent {
            event_type: event_type.to_string(),
            event_data: serde_json::json!({}),
        }
    }

    #[test]
    fn allowlist_accepts_valid_types() {
        let events = vec![
            ev("ROLE_SELECTED"),
            ev("TOS_ACCEPTED"),
            ev("ONBOARDING_COMPLETE"),
        ];
        assert!(validate_event_types(&events).is_ok());
    }

    #[test]
    fn allowlist_rejects_unknown_type() {
        let events = vec![ev("DROP_TABLE_users")];
        assert!(validate_event_types(&events).is_err());
    }

    #[test]
    fn allowlist_rejects_empty_string() {
        let events = vec![ev("")];
        assert!(validate_event_types(&events).is_err());
    }
}
```

- [ ] **Step 2: Run tests — expect PASS**

```bash
$env:SQLX_OFFLINE="true"; cargo test -p identity_service allowlist 2>&1
```
Expected: 3 tests pass (`allowlist_accepts_valid_types`, `allowlist_rejects_unknown_type`, `allowlist_rejects_empty_string`).

- [ ] **Step 3: Register the module and route in `main.rs`**

At the top of `main.rs`, add:
```rust
mod audit_handler;
```
(alongside the existing `mod admin_handlers;`, `mod enterprise_handlers;`, etc.)

In the Axum router (inside `let app = Router::new()`), add after the last existing route:
```rust
.route("/identity/audit-events", post(audit_handler::batch_audit_events))
```

- [ ] **Step 4: Cargo check — no errors**

```bash
$env:SQLX_OFFLINE="true"; cargo check -p identity_service 2>&1
```

- [ ] **Step 5: Run all identity_service tests**

```bash
$env:SQLX_OFFLINE="true"; cargo test -p identity_service 2>&1
```
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add crates/identity_service/src/audit_handler.rs crates/identity_service/src/main.rs
git commit -m "feat(identity): batch audit-events endpoint POST /identity/audit-events"
```

---

## Task 6: Frontend — session types + auth.ts

**Files:**
- Modify: `apps/web/types/next-auth.d.ts`
- Modify: `apps/web/auth.ts`

### 6a — `types/next-auth.d.ts`

- [ ] **Step 1: Add `isLinkedAccount` to Session and JWT**

In `apps/web/types/next-auth.d.ts`, add to both interfaces:

```typescript
// In Session["user"] (after isAdmin line):
isLinkedAccount: boolean;

// In JWT (after isAdmin line):
isLinkedAccount?: boolean;
```

Full file after change:

```typescript
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      profileId:          string;
      identityTier:       "UNVERIFIED" | "SOCIAL_VERIFIED" | "BIOMETRIC_VERIFIED";
      trustScore:         number;
      provider:           string;
      accountType:        string;
      role:               string | null;
      roles:              string[];
      isAdmin:            boolean;
      isLinkedAccount:    boolean;          // NEW
      githubAccessToken?: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    profileId?:          string;
    identityTier?:       string;
    trustScore?:         number;
    provider?:           string;
    accountType?:        string;
    role?:               string | null;
    roles?:              string[];
    isAdmin?:            boolean;
    isLinkedAccount?:    boolean;           // NEW
    githubAccessToken?:  string;
  }
}
```

### 6b — `auth.ts`

- [ ] **Step 2: Update the TypeScript `OAuthCallbackResponse` interface and fallback in `auth.ts`**

In `auth.ts`, find the `OAuthCallbackResponse` interface (lines 28–35) and add the field:

```typescript
interface OAuthCallbackResponse {
  profile_id:        string;
  identity_tier:     "UNVERIFIED" | "SOCIAL_VERIFIED" | "BIOMETRIC_VERIFIED";
  trust_score:       number;
  account_type:      string;
  role:              string | null;
  is_admin:          boolean;
  is_linked_account: boolean;   // NEW
}
```

Also update the **fallback return** in `callIdentityOAuthCallback` (lines 76–83) to include the new field — otherwise TypeScript will error on a missing required property:

```typescript
// Fallback: return Unverified tier so login still succeeds
return {
  profile_id:        account.providerAccountId,
  identity_tier:     "UNVERIFIED",
  trust_score:       0,
  account_type:      "individual",
  role:              null,
  is_admin:          false,
  is_linked_account: false,   // NEW — fallback is never a linked account
};
```

- [ ] **Step 3: Store in JWT token**

In `auth.ts`, after line 229 (`token.isAdmin = result.is_admin ?? false;`), add:

```typescript
token.isLinkedAccount = result.is_linked_account ?? false;
```

- [ ] **Step 4: Forward to session**

In the `session` callback (line 240–251), after `session.user.isAdmin = ...` add:

```typescript
session.user.isLinkedAccount = (token.isLinkedAccount as boolean) ?? false;
```

- [ ] **Step 5: TypeScript build check**

```bash
cd apps/web && npx tsc --noEmit 2>&1
```
Expected: no errors related to `isLinkedAccount`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/types/next-auth.d.ts apps/web/auth.ts
git commit -m "feat(auth): forward is_linked_account through JWT to session"
```

---

## Task 7: New API route — `/api/onboarding/audit-events`

**Files:**
- Create: `apps/web/app/api/onboarding/audit-events/route.ts`

**Important:** Path is `/api/onboarding/...` NOT `/api/identity/...`. The `next.config.ts` rewrite `source: "/api/identity/:path*"` would bypass this handler — `onboarding` avoids that rewrite.

- [ ] **Step 1: Create the route file**

```typescript
// apps/web/app/api/onboarding/audit-events/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";

interface AuditEvent {
  event_type: string;
  event_data: Record<string, unknown>;
}

interface AuditEventsBody {
  events: AuditEvent[];
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.profileId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: AuditEventsBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!Array.isArray(body.events) || body.events.length === 0) {
    return NextResponse.json({ error: "events array required" }, { status: 400 });
  }

  const identityUrl =
    process.env.IDENTITY_SERVICE_URL ?? "http://localhost:3001";

  try {
    const res = await fetch(`${identityUrl}/identity/audit-events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // profile_id is ALWAYS sourced from the server-side session —
        // never trusted from the client request body.
        profile_id: session.user.profileId,
        events: body.events,
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (res.ok) return new NextResponse(null, { status: 204 });
    const text = await res.text().catch(() => "");
    return NextResponse.json(
      { error: "identity_service error", detail: text },
      { status: res.status }
    );
  } catch (err) {
    // identity_service offline — log but don't block the user
    console.error("[audit-events] identity_service unreachable:", err);
    return NextResponse.json({ error: "service unavailable" }, { status: 503 });
  }
}
```

- [ ] **Step 2: TypeScript build check**

```bash
cd apps/web && npx tsc --noEmit 2>&1
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/api/onboarding/audit-events/route.ts
git commit -m "feat(web): POST /api/onboarding/audit-events — server-side profile_id injection"
```

---

## Task 8: New API route — `/api/onboarding/welcome-email`

**Files:**
- Create: `apps/web/app/api/onboarding/welcome-email/route.ts`

Pattern reference: `apps/web/app/api/proposals/submit/route.ts` (the `tryNotify` helper).

- [ ] **Step 1: Create the route file**

```typescript
// apps/web/app/api/onboarding/welcome-email/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";

export async function POST(_req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { email, name, role } = {
    email: session.user.email,
    name:  session.user.name ?? "there",
    role:  session.user.role ?? "client",
  };

  const notifUrl =
    process.env.NOTIFICATION_SERVICE_URL ?? "http://localhost:3012";

  try {
    const res = await fetch(`${notifUrl}/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient_email: email,
        subject: "Welcome to AiStaff — you're all set",
        body:
          `Hi ${name},\n\n` +
          `Your AiStaff account is ready. You joined as a ${role}.\n\n` +
          `Head to the marketplace to deploy your first AI agent:\n` +
          `${process.env.NEXT_PUBLIC_APP_URL ?? "https://aistaffglobal.com"}/marketplace\n\n` +
          `Every deployment is protected by a 30-second veto window and a 7-day warranty.\n\n` +
          `— The AiStaff team`,
      }),
      signal: AbortSignal.timeout(2000),
    });
    return NextResponse.json({ sent: res.ok });
  } catch {
    // notification_service offline — non-fatal, user is not blocked
    return NextResponse.json({ sent: false });
  }
}
```

Note: always returns `200 { sent: true/false }` — never `5xx`. Same contract as `proposals/submit`.

- [ ] **Step 2: TypeScript build check**

```bash
cd apps/web && npx tsc --noEmit 2>&1
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/api/onboarding/welcome-email/route.ts
git commit -m "feat(web): POST /api/onboarding/welcome-email — fire-and-forget welcome notification"
```

---

## Task 9: Onboarding page — duplicate banner + ToS checkbox + markDone

**Files:**
- Modify: `apps/web/app/onboarding/page.tsx`

Three independent changes. Apply them one at a time and verify TypeScript after each.

### 9a — Duplicate account banner on `StepWelcome`

`StepWelcome` is a pure presentational component (line 106). Add an optional `isLinkedAccount` prop.

- [ ] **Step 1: Update `StepWelcome` signature and add banner**

```typescript
// BEFORE (line 106):
function StepWelcome({ name, onNext }: { name: string | null; onNext: () => void }) {
  return (
    <div className="space-y-6">

// AFTER:
function StepWelcome({
  name,
  onNext,
  isLinkedAccount,
  linkedEmail,
  linkedProvider,
}: {
  name: string | null;
  onNext: () => void;
  isLinkedAccount?: boolean;
  linkedEmail?: string;
  linkedProvider?: string;
}) {
  const [bannerDismissed, setBannerDismissed] = React.useState(false);
  return (
    <div className="space-y-6">
      {isLinkedAccount && !bannerDismissed && (
        <div className="flex items-start gap-3 p-3 rounded-sm border-l-2 border-amber-400
                        bg-zinc-900 text-zinc-50">
          <Info className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-zinc-100">
              {linkedProvider
                ? `${linkedProvider} linked to your existing account`
                : "New login method linked to your existing account"}
            </p>
            {linkedEmail && (
              <p className="font-mono text-xs text-zinc-400 mt-0.5">{linkedEmail}</p>
            )}
            <p className="font-mono text-xs text-zinc-500 mt-0.5">
              Your trust score has been updated.
            </p>
          </div>
          <button
            onClick={() => setBannerDismissed(true)}
            className="text-zinc-500 hover:text-zinc-300 transition-colors"
            aria-label="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
```

- [ ] **Step 2: Ensure `Info` and `X` are imported from `lucide-react`**

Check the existing import at the top of the file and add `Info` and `X` if not already present. The file already imports from `lucide-react` — just add to that import.

- [ ] **Step 3: Pass props at the call-site (line 1034)**

```typescript
// BEFORE:
case 0: return <StepWelcome name={name} onNext={() => setStep(1)} />;

// AFTER:
case 0: return (
  <StepWelcome
    name={name}
    onNext={() => setStep(1)}
    isLinkedAccount={session?.user?.isLinkedAccount}
    linkedEmail={session?.user?.email ?? undefined}
    linkedProvider={session?.user?.provider
      ? session.user.provider.charAt(0).toUpperCase() + session.user.provider.slice(1)
      : undefined}
  />
);
```

### 9b — ToS checkbox on `StepClientGoal`

`StepClientGoal` currently takes `onDone(dest: string)` and calls it directly from button clicks. It needs local state for `tosChecked` and `tosError`, and a `profileId` prop to call `updateProfile`.

- [ ] **Step 4: Rewrite `StepClientGoal` with ToS state**

```typescript
// BEFORE (line 537):
function StepClientGoal({ onDone }: { onDone: (dest: string) => void }) {
  return (
    <div className="space-y-6">
      ...
      <div className="space-y-2.5">
        <button onClick={() => onDone("/marketplace")} ...>Deploy an AI Agent</button>
        <button onClick={() => onDone("/scoping")} ...>Hire AI Talent</button>
        <button onClick={() => onDone("/marketplace")} ...>Both</button>
      </div>
    </div>
  );
}

// AFTER — replace the entire function:
function StepClientGoal({
  onDone,
  profileId,
}: {
  onDone: (dest: string) => void;
  profileId: string;
}) {
  const [tosChecked, setTosChecked] = React.useState(false);
  const [tosLoading, setTosLoading] = React.useState(false);
  const [tosError,   setTosError]   = React.useState<string | null>(null);
  const [pendingDest, setPendingDest] = React.useState<string | null>(null);

  async function handleTosCheck(checked: boolean) {
    if (!checked) { setTosChecked(false); return; }
    setTosLoading(true);
    setTosError(null);
    try {
      await updateProfile(profileId, { tos_accepted: true });
      // Note: no type cast needed — Step 6 adds tos_accepted to UpdateProfileRequest
      setTosChecked(true);
      // If user had already picked a destination, proceed now
      if (pendingDest) onDone(pendingDest);
    } catch {
      setTosError("Could not record your acceptance — please try again.");
      setTosChecked(false);
    } finally {
      setTosLoading(false);
    }
  }

  function handleGoalClick(dest: string) {
    if (!tosChecked) {
      setPendingDest(dest);
      setTosError("Please accept the Terms of Service before continuing.");
      return;
    }
    onDone(dest);
  }

  return (
    <div className="space-y-6">
      <div className="text-center space-y-1">
        <h2 className="text-lg font-semibold text-zinc-100">How it works</h2>
        <p className="font-mono text-xs text-zinc-500">
          AiStaff protects every engagement with escrow + a human veto window.
        </p>
      </div>

      {/* Escrow trust strip */}
      <div className="space-y-1.5">
        {[
          { icon: Clock,       label: "30-second veto window",     desc: "You approve every payout before it moves" },
          { icon: Shield,      label: "7-day warranty",            desc: "Full fix or refund if deliverables fail" },
          { icon: CheckCircle, label: "Definition-of-Done gates",  desc: "Money releases only when checklist passes" },
        ].map(({ icon: Icon, label, desc }) => (
          <div key={label}
               className="flex items-center gap-3 p-2.5 rounded-sm border border-zinc-800 bg-zinc-900/40">
            <Icon className="w-4 h-4 text-amber-400 shrink-0" />
            <div>
              <p className="text-xs font-medium text-zinc-200">{label}</p>
              <p className="font-mono text-[10px] text-zinc-500">{desc}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-1">
        <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest text-center">
          What do you need?
        </p>
      </div>

      <div className="space-y-2.5">
        <button
          onClick={() => handleGoalClick("/marketplace")}
          className="w-full p-4 rounded-sm border border-amber-400/40 bg-amber-400/5
                     hover:bg-amber-400/10 transition-all active:scale-[0.98] text-left group"
        >
          <div className="flex items-center gap-3">
            <Zap className="w-5 h-5 text-amber-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-zinc-100 text-sm">Deploy an AI Agent</p>
              <p className="font-mono text-xs text-zinc-500 mt-0.5">
                Pick from ready-to-deploy agents in the marketplace
              </p>
            </div>
            <ArrowRight className="w-4 h-4 text-amber-400 shrink-0" />
          </div>
        </button>

        <button
          onClick={() => handleGoalClick("/scoping")}
          className="w-full p-4 rounded-sm border border-zinc-700 bg-zinc-900/60
                     hover:border-zinc-600 hover:bg-zinc-800 transition-all
                     active:scale-[0.98] text-left group"
        >
          <div className="flex items-center gap-3">
            <Bot className="w-5 h-5 text-zinc-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-zinc-100 text-sm">Hire AI Talent</p>
              <p className="font-mono text-xs text-zinc-500 mt-0.5">
                Scope a job with our AI PM — auto-matches vetted installers
              </p>
            </div>
            <ArrowRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400
                                   shrink-0 transition-colors" />
          </div>
        </button>

        <button
          onClick={() => handleGoalClick("/marketplace")}
          className="w-full p-4 rounded-sm border border-zinc-700 bg-zinc-900/60
                     hover:border-zinc-600 hover:bg-zinc-800 transition-all
                     active:scale-[0.98] text-left group"
        >
          <div className="flex items-center gap-3">
            <Briefcase className="w-5 h-5 text-zinc-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-zinc-100 text-sm">Both</p>
              <p className="font-mono text-xs text-zinc-500 mt-0.5">
                Explore the full marketplace — agents and talent
              </p>
            </div>
            <ArrowRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400
                                   shrink-0 transition-colors" />
          </div>
        </button>
      </div>

      {/* ToS acceptance */}
      <div className="space-y-1.5">
        <label className="flex items-start gap-2.5 cursor-pointer group">
          <input
            type="checkbox"
            checked={tosChecked}
            disabled={tosLoading}
            onChange={(e) => handleTosCheck(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded-sm accent-amber-400 cursor-pointer"
            aria-label="Accept Terms of Service and Privacy Policy"
          />
          <span className="font-mono text-xs text-zinc-400 leading-relaxed">
            I agree to the{" "}
            <a href="/terms"   target="_blank" rel="noopener noreferrer"
               className="text-amber-400 hover:text-amber-300 underline underline-offset-2">
              Terms of Service
            </a>
            {" "}and{" "}
            <a href="/privacy" target="_blank" rel="noopener noreferrer"
               className="text-amber-400 hover:text-amber-300 underline underline-offset-2">
              Privacy Policy
            </a>
            {tosLoading && <span className="text-zinc-500 ml-1">saving…</span>}
          </span>
        </label>
        {tosError && (
          <p className="font-mono text-xs text-red-500 flex items-center gap-1">
            <AlertCircle className="w-3 h-3 shrink-0" />
            {tosError}
          </p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Ensure `AlertCircle` is imported from `lucide-react`**

Add `AlertCircle` to the existing lucide-react import if not already present.

- [ ] **Step 6: Update the `updateProfile` call signature in `api.ts`**

`updateProfile` currently accepts `UpdateProfileRequest` which doesn't include `tos_accepted`. Add it:

In `apps/web/lib/api.ts`, find `UpdateProfileRequest` and add:

```typescript
export interface UpdateProfileRequest {
  bio?:                string;
  hourly_rate_cents?:  number;
  availability?:       "available" | "busy" | "not-available";
  role?:               "talent" | "client" | "agent-owner";
  tos_accepted?:       boolean;   // NEW
}
```

- [ ] **Step 7: Update the `StepClientGoal` call-site (line 1038)**

```typescript
// BEFORE:
if (role === "client")  return <StepClientGoal onDone={markDone} />;

// AFTER:
if (role === "client")  return <StepClientGoal onDone={markDone} profileId={profileId} />;
```

### 9c — Extend `markDone()` for the client path

- [ ] **Step 8: Rewrite `markDone` to add audit + email calls on the client path**

```typescript
// apps/web/app/onboarding/page.tsx  — markDone (line 979)
// BEFORE:
const markDone = useCallback(async (destination?: string) => {
  if (typeof window !== "undefined") {
    localStorage.setItem(LS.done,  "1");
    if (role) localStorage.setItem(LS.uRole, role);
    localStorage.removeItem(LS.step);
    localStorage.removeItem(LS.role);
  }
  if (profileId && role && role !== "agency") {
    updateProfile(profileId, { role: toBackendRole(role) }).catch(() => {});
  }
  if (role) {
    await update({
      role:        toBackendRole(role),
      accountType: role === "agency" ? "agency" : "individual",
    }).catch(() => {});
  }
  router.push(destination ?? (role === "client" ? "/marketplace" : "/dashboard"));
}, [role, profileId, update, router]);

// AFTER:
const markDone = useCallback(async (destination?: string) => {
  // Client path: send audit batch + welcome email (non-blocking, allSettled).
  // ToS guard is enforced at the button level: StepClientGoal's handleGoalClick()
  // only calls onDone() (which triggers markDone) after tosChecked === true.
  // tosChecked is only set to true after the PATCH /profile succeeds.
  // No duplicate guard needed here — the call path is already gated.
  if (role === "client") {
    const provider = (session?.user as { provider?: string })?.provider ?? "unknown";
    await Promise.allSettled([
      fetch("/api/onboarding/audit-events", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          events: [
            { event_type: "ROLE_SELECTED",       event_data: { role: "client" } },
            { event_type: "TOS_ACCEPTED",        event_data: { tos_version: "1.0" } },
            { event_type: "ONBOARDING_COMPLETE", event_data: { role: "client", provider } },
          ],
        }),
      }).catch((e) => console.error("[onboarding] audit-events failed:", e)),
      fetch("/api/onboarding/welcome-email", { method: "POST" })
        .catch((e) => console.error("[onboarding] welcome-email failed:", e)),
    ]);
  }

  if (typeof window !== "undefined") {
    localStorage.setItem(LS.done,  "1");
    if (role) localStorage.setItem(LS.uRole, role);
    localStorage.removeItem(LS.step);
    localStorage.removeItem(LS.role);
  }
  if (profileId && role && role !== "agency") {
    updateProfile(profileId, { role: toBackendRole(role) }).catch(() => {});
  }
  if (role) {
    await update({
      role:        toBackendRole(role),
      accountType: role === "agency" ? "agency" : "individual",
    }).catch(() => {});
  }
  router.push(destination ?? (role === "client" ? "/marketplace" : "/dashboard"));
}, [role, profileId, session, update, router]);
```

Note: `session` is already the local alias from `const { data: session, update } = useSession()` at the top of the component — do NOT add a second `const session` declaration. Just add `session` to the `useCallback` dependency array.

- [ ] **Step 9: TypeScript build check**

```bash
cd apps/web && npx tsc --noEmit 2>&1
```
Expected: no errors.

- [ ] **Step 10: Run ESLint**

```bash
cd apps/web && npx eslint app/onboarding/page.tsx --max-warnings 0 2>&1
```
Expected: no errors or warnings.

- [ ] **Step 11: Commit**

```bash
git add apps/web/app/onboarding/page.tsx apps/web/lib/api.ts
git commit -m "feat(onboarding): duplicate banner, ToS checkbox, audit + welcome email on client completion"
```

---

## Task 10: Final check + push

- [ ] **Step 1: Full workspace check**

```bash
$env:SQLX_OFFLINE="true"; cargo check --workspace 2>&1
```
Expected: 0 errors.

- [ ] **Step 2: Run identity_service tests**

```bash
$env:SQLX_OFFLINE="true"; cargo test -p identity_service 2>&1
```
Expected: all pass.

- [ ] **Step 3: Run common tests**

```bash
$env:SQLX_OFFLINE="true"; cargo test -p common 2>&1
```
Expected: all pass.

- [ ] **Step 4: Next.js build**

```bash
cd apps/web && npm run build 2>&1 | tail -20
```
Expected: `✓ Compiled successfully` (or equivalent). No type errors.

- [ ] **Step 5: Push**

```bash
git push
```

---

## Summary of Commits Expected

| Task | Commit message |
|---|---|
| 1 | `feat(db): add tos_accepted_at to unified_profiles` |
| 2 | `feat(common): add is_linked_account to OAuthCallbackResponse` |
| 3 | `feat(identity): populate is_linked_account on email-match OAuth resolution` |
| 4 | `feat(identity): add tos_accepted to update_profile — writes tos_accepted_at idempotently` |
| 5 | `feat(identity): batch audit-events endpoint POST /identity/audit-events` |
| 6 | `feat(auth): forward is_linked_account through JWT to session` |
| 7 | `feat(web): POST /api/onboarding/audit-events — server-side profile_id injection` |
| 8 | `feat(web): POST /api/onboarding/welcome-email — fire-and-forget welcome notification` |
| 9 | `feat(onboarding): duplicate banner, ToS checkbox, audit + welcome email on client completion` |
| 10 | (push only, no new commit) |
