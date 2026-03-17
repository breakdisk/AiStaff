# AiTalent Deployment Business Logic Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the end-to-end business logic for engaging a human freelancer (AiTalent) — from client accepting a proposal through milestone-gated escrow release.

**Architecture:** Client accepts a freelancer proposal → creates a `TALENT`-type deployment + custom DoD milestones. Freelancer submits work per milestone; client approves each. When all milestones pass, `ChecklistFinalized` + `DeploymentComplete` fire → existing payout_service 30s veto window → 70/30 payout. No Wasm sandbox involved.

**Tech Stack:** Rust/Axum (marketplace_service port 3002, checklist_service port 3003), SQLx non-macro queries (no cache regeneration needed), Next.js 15 App Router, Tailwind 4, Kafka `EventEnvelope<T>`, existing payout_service veto flow unchanged.

---

## Exact Patterns (read these before writing any code)

### Rust state types
- `marketplace_service`: `pub type SharedState = Arc<AppState>` — handlers use `State(state): State<SharedState>`
- `checklist_service`: `pub type AppState = Arc<ChecklistService>` — handlers use `State(svc): State<AppState>`

### Kafka publish pattern (both services)
```rust
state.producer.publish(
    TOPIC_DEPLOYMENT_STARTED,          // topic constant from common::events
    &deployment_id.to_string(),        // partition key
    &EventEnvelope::new("DeploymentStarted", &payload),  // first arg = type name string
).await?;
```

### Non-macro query pattern (use everywhere — avoids .sqlx/ cache dependency)
```rust
use sqlx::Row;
let row = sqlx::query("SELECT id, state::TEXT AS state FROM deployments WHERE id = $1")
    .bind(deployment_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
let id: Uuid = row.get("id");
```

### Next.js 15 dynamic route params (all proxy routes)
```typescript
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params   // must await — Next.js 15 requirement
```

---

## File Map

### New files
- `migrations/0027_talent_engagement.sql` — proposal lifecycle, deployment_type, milestone submit/approve
- `crates/marketplace_service/src/proposal_handlers.rs` — list proposals, accept, reject
- `crates/checklist_service/src/milestone_handlers.rs` — list, submit, approve milestones
- `apps/web/app/proposals/inbox/page.tsx` — server component shell (auth guard)
- `apps/web/app/proposals/inbox/ProposalsInboxClient.tsx` — client: fetches proposals
- `apps/web/app/proposals/inbox/ProposalCard.tsx` — single proposal + accept/reject actions
- `apps/web/app/proposals/inbox/MilestoneForm.tsx` — client defines milestones on accept
- `apps/web/app/engagements/page.tsx` — server component shell (auth guard)
- `apps/web/app/engagements/EngagementsClient.tsx` — client: loads active engagements
- `apps/web/app/engagements/MilestonePanel.tsx` — submit (talent) + approve (client) per milestone
- `apps/web/app/api/marketplace/listings/[listingId]/proposals/route.ts`
- `apps/web/app/api/marketplace/proposals/[proposalId]/accept/route.ts`
- `apps/web/app/api/marketplace/proposals/[proposalId]/reject/route.ts`
- `apps/web/app/api/checklist/checklist/[deploymentId]/milestones/route.ts`
- `apps/web/app/api/checklist/checklist/[deploymentId]/step/[stepId]/submit/route.ts`
- `apps/web/app/api/checklist/checklist/[deploymentId]/step/[stepId]/approve/route.ts`

### Modified files
- `crates/marketplace_service/src/main.rs` — register proposal routes + `mod proposal_handlers`
- `crates/checklist_service/src/main.rs` — register milestone routes + `mod milestone_handlers`
- `apps/web/lib/api.ts` — add proposal + milestone API helpers
- `apps/web/components/AppSidebar.tsx` — add Proposals Inbox + Engagements nav items

---

## Task 1: DB Migration 0027

**Files:**
- Create: `migrations/0027_talent_engagement.sql`

- [ ] **Step 1: Write the migration**

```sql
-- migrations/0027_talent_engagement.sql
-- AiTalent engagement: proposal lifecycle + talent deployment type + milestone submit/approve

-- 1. Proposal lifecycle columns
ALTER TABLE proposals
    ADD COLUMN IF NOT EXISTS job_listing_id  UUID REFERENCES agent_listings(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS freelancer_id   UUID REFERENCES unified_profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS status          TEXT NOT NULL DEFAULT 'PENDING',
    ADD COLUMN IF NOT EXISTS deployment_id   UUID REFERENCES deployments(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS rejected_at     TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS accepted_at     TIMESTAMPTZ;

ALTER TABLE proposals
    ADD CONSTRAINT proposals_status_check
    CHECK (status IN ('PENDING', 'ACCEPTED', 'REJECTED'));

-- 2. Deployment type: AGENT (existing AI Agent flow) vs TALENT (human freelancer)
ALTER TABLE deployments
    ADD COLUMN IF NOT EXISTS deployment_type TEXT NOT NULL DEFAULT 'AGENT';

ALTER TABLE deployments
    ADD CONSTRAINT deployments_type_check
    CHECK (deployment_type IN ('AGENT', 'TALENT'));

-- 3. Milestone submit/approve columns on dod_checklist_steps
--    completed_at made nullable so pending milestones can be inserted without a timestamp
ALTER TABLE dod_checklist_steps
    ALTER COLUMN completed_at DROP NOT NULL,
    ADD COLUMN IF NOT EXISTS submitted_by   UUID REFERENCES unified_profiles(id),
    ADD COLUMN IF NOT EXISTS submitted_at   TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS approved_by    UUID REFERENCES unified_profiles(id),
    ADD COLUMN IF NOT EXISTS approved_at    TIMESTAMPTZ;

-- 4. Indexes
-- NOTE: idx_proposals_freelancer already exists on proposals(freelancer_email) from 0021
--       Use a distinct name for the freelancer_id index.
CREATE INDEX IF NOT EXISTS idx_proposals_freelancer_id
    ON proposals (freelancer_id) WHERE freelancer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_proposals_job_listing
    ON proposals (job_listing_id) WHERE job_listing_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_deployments_type
    ON deployments (deployment_type);
```

- [ ] **Step 2: Visual review**

Confirm: `idx_proposals_freelancer` (from 0021) is NOT recreated. New index is `idx_proposals_freelancer_id`. `completed_at DROP NOT NULL` is present before new column adds.

- [ ] **Step 3: Commit**

```bash
git add migrations/0027_talent_engagement.sql
git commit -m "feat(talent): migration 0027 — proposal lifecycle, deployment_type, milestone submit/approve"
```

---

## Task 2: marketplace_service — Proposal Handlers

**Files:**
- Create: `crates/marketplace_service/src/proposal_handlers.rs`
- Modify: `crates/marketplace_service/src/main.rs`

- [ ] **Step 1: Create `proposal_handlers.rs`**

```rust
// crates/marketplace_service/src/proposal_handlers.rs
//
// State type: SharedState = Arc<AppState>  (see handlers.rs line 26)
// Kafka: state.producer.publish(TOPIC, &key, &EventEnvelope::new("TypeName", &payload))
// Queries: non-macro sqlx::query() + .bind() — no .sqlx/ cache dependency

use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use chrono::Utc;
use common::events::{DeploymentStarted, EventEnvelope, TOPIC_DEPLOYMENT_STARTED};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use uuid::Uuid;

use crate::handlers::SharedState;

// ── DTOs ──────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct ProposalRow {
    pub id: String,
    pub job_listing_id: Option<String>,
    pub freelancer_id: Option<String>,
    pub freelancer_email: String,
    pub job_title: String,
    pub cover_letter: String,
    pub proposed_budget: String,
    pub proposed_timeline: String,
    pub status: String,
    pub submitted_at: String,
}

#[derive(Debug, Deserialize)]
pub struct AcceptProposalRequest {
    /// UUID v7 idempotency key — safe to retry with same value
    pub transaction_id: Uuid,
    /// Escrow amount in USD cents
    pub escrow_amount_cents: i64,
    /// Milestone labels defined by the client
    pub milestones: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct AcceptProposalResponse {
    pub deployment_id: String,
    pub milestone_count: usize,
}

#[derive(Debug, Deserialize)]
pub struct RejectProposalRequest {
    pub reason: Option<String>,
}

// ── Handlers ──────────────────────────────────────────────────────────────────

/// GET /listings/:listing_id/proposals
/// Client views all proposals submitted for their job listing.
pub async fn list_proposals_for_job(
    State(state): State<SharedState>,
    Path(listing_id): Path<Uuid>,
) -> Result<Json<Vec<ProposalRow>>, (StatusCode, String)> {
    let rows = sqlx::query(
        r#"
        SELECT id::TEXT, job_listing_id::TEXT, freelancer_id::TEXT,
               freelancer_email, job_title, cover_letter,
               proposed_budget, proposed_timeline, status,
               submitted_at::TEXT
        FROM proposals
        WHERE job_listing_id = $1
        ORDER BY submitted_at DESC
        "#,
    )
    .bind(listing_id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let proposals = rows
        .iter()
        .map(|r| ProposalRow {
            id:               r.try_get("id").unwrap_or_default(),
            job_listing_id:   r.try_get("job_listing_id").unwrap_or(None),
            freelancer_id:    r.try_get("freelancer_id").unwrap_or(None),
            freelancer_email: r.try_get("freelancer_email").unwrap_or_default(),
            job_title:        r.try_get("job_title").unwrap_or_default(),
            cover_letter:     r.try_get("cover_letter").unwrap_or_default(),
            proposed_budget:  r.try_get("proposed_budget").unwrap_or_default(),
            proposed_timeline:r.try_get("proposed_timeline").unwrap_or_default(),
            status:           r.try_get("status").unwrap_or_default(),
            submitted_at:     r.try_get("submitted_at").unwrap_or_default(),
        })
        .collect();

    Ok(Json(proposals))
}

/// POST /proposals/:proposal_id/accept
/// Client accepts a proposal:
///   1. Loads proposal, validates it is still PENDING.
///   2. Idempotency: if transaction_id already used, returns existing deployment.
///   3. Creates TALENT-type deployment record.
///   4. Marks proposal ACCEPTED, auto-rejects all other proposals for the same listing.
///   5. Bulk-inserts client-defined DoD milestones.
///   6. Emits DeploymentStarted Kafka event.
pub async fn accept_proposal(
    State(state): State<SharedState>,
    Path(proposal_id): Path<Uuid>,
    Json(req): Json<AcceptProposalRequest>,
) -> Result<Json<AcceptProposalResponse>, (StatusCode, String)> {
    // 1. Load proposal
    let row = sqlx::query(
        "SELECT id, freelancer_id, job_listing_id, status FROM proposals WHERE id = $1",
    )
    .bind(proposal_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .ok_or((StatusCode::NOT_FOUND, "Proposal not found".to_string()))?;

    let status: String = row.try_get("status").unwrap_or_default();
    if status != "PENDING" {
        return Err((StatusCode::CONFLICT, format!("Proposal is already {status}")));
    }

    let freelancer_id: Option<Uuid> = row.try_get("freelancer_id").unwrap_or(None);
    let job_listing_id: Option<Uuid> = row.try_get("job_listing_id").unwrap_or(None);

    // 2. Idempotency check
    let existing = sqlx::query(
        "SELECT id::TEXT FROM deployments WHERE transaction_id = $1",
    )
    .bind(req.transaction_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if let Some(row) = existing {
        let dep_id: String = row.try_get("id").unwrap_or_default();
        return Ok(Json(AcceptProposalResponse {
            deployment_id: dep_id,
            milestone_count: req.milestones.len(),
        }));
    }

    let now = Utc::now();
    let deployment_id = Uuid::now_v7();
    let fl_id = freelancer_id.unwrap_or(Uuid::nil());
    let listing_id = job_listing_id.unwrap_or(Uuid::nil());

    // 3. Create TALENT deployment (non-macro for deployment_type literal + enum cast)
    sqlx::query(
        r#"
        INSERT INTO deployments
            (id, agent_id, client_id, freelancer_id, agent_artifact_hash,
             escrow_amount_cents, total_amount_cents, state, transaction_id,
             deployment_type, created_at, updated_at)
        VALUES
            ($1, $2, $3, $4, 'talent-engagement',
             $5, $5, 'PENDING'::deployment_status, $6,
             'TALENT', $7, $7)
        "#,
    )
    .bind(deployment_id)
    .bind(listing_id)        // agent_id = job listing UUID
    .bind(Uuid::nil())       // client_id: pass via auth middleware in prod
    .bind(fl_id)
    .bind(req.escrow_amount_cents)
    .bind(req.transaction_id)
    .bind(now)
    .execute(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // 4a. Mark this proposal as ACCEPTED
    sqlx::query(
        "UPDATE proposals SET status = 'ACCEPTED', deployment_id = $1, accepted_at = $2 WHERE id = $3",
    )
    .bind(deployment_id)
    .bind(now)
    .bind(proposal_id)
    .execute(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // 4b. Auto-reject all other PENDING proposals for the same job (one hire per listing)
    if let Some(lid) = job_listing_id {
        sqlx::query(
            "UPDATE proposals SET status = 'REJECTED', rejected_at = $1 WHERE job_listing_id = $2 AND id != $3 AND status = 'PENDING'",
        )
        .bind(now)
        .bind(lid)
        .bind(proposal_id)
        .execute(&state.db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    }

    // 5. Bulk-insert DoD milestones (completed_at is now nullable after migration 0027)
    let milestone_count = req.milestones.len();
    for (i, label) in req.milestones.iter().enumerate() {
        let step_id = format!("milestone_{}", i + 1);
        sqlx::query(
            r#"
            INSERT INTO dod_checklist_steps
                (id, deployment_id, step_id, step_label, passed)
            VALUES (gen_random_uuid(), $1, $2, $3, FALSE)
            ON CONFLICT (deployment_id, step_id) DO NOTHING
            "#,
        )
        .bind(deployment_id)
        .bind(&step_id)
        .bind(label)
        .execute(&state.db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    }

    // 6. Emit DeploymentStarted
    let event = DeploymentStarted {
        deployment_id,
        agent_id: listing_id,
        client_id: Uuid::nil(),
        freelancer_id: fl_id,
    };
    if let Err(e) = state
        .producer
        .publish(
            TOPIC_DEPLOYMENT_STARTED,
            &deployment_id.to_string(),
            &EventEnvelope::new("DeploymentStarted", &event),
        )
        .await
    {
        tracing::warn!("Failed to emit DeploymentStarted: {e}");
    }

    Ok(Json(AcceptProposalResponse {
        deployment_id: deployment_id.to_string(),
        milestone_count,
    }))
}

/// POST /proposals/:proposal_id/reject
/// Client rejects a freelancer proposal.
pub async fn reject_proposal(
    State(state): State<SharedState>,
    Path(proposal_id): Path<Uuid>,
    Json(req): Json<RejectProposalRequest>,
) -> Result<StatusCode, (StatusCode, String)> {
    let result = sqlx::query(
        "UPDATE proposals SET status = 'REJECTED', rejected_at = NOW() WHERE id = $1 AND status = 'PENDING'",
    )
    .bind(proposal_id)
    .execute(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if result.rows_affected() == 0 {
        return Err((StatusCode::CONFLICT, "Proposal already processed".to_string()));
    }

    if let Some(reason) = req.reason {
        tracing::info!("Proposal {proposal_id} rejected: {reason}");
    }

    Ok(StatusCode::NO_CONTENT)
}
```

- [ ] **Step 2: Register routes in `marketplace_service/src/main.rs`**

Open `crates/marketplace_service/src/main.rs`. Add at the top alongside existing `mod` declarations:

```rust
mod proposal_handlers;
```

Add routes in the router builder (alongside existing listing/deployment routes). Use `axum::routing::get` and `axum::routing::post` — check existing imports:

```rust
.route("/listings/:listing_id/proposals", get(proposal_handlers::list_proposals_for_job))
.route("/proposals/:proposal_id/accept",  post(proposal_handlers::accept_proposal))
.route("/proposals/:proposal_id/reject",  post(proposal_handlers::reject_proposal))
```

- [ ] **Step 3: Cargo check**

```bash
cmd /c "cd D:\AiStaffApp && set SQLX_OFFLINE=true && cargo check -p marketplace_service 2>&1"
```

Expected: no errors. The non-macro queries do not require `.sqlx/` cache entries.

- [ ] **Step 4: Commit**

```bash
git add crates/marketplace_service/src/proposal_handlers.rs crates/marketplace_service/src/main.rs
git commit -m "feat(talent): proposal accept/reject + list endpoints in marketplace_service"
```

---

## Task 3: checklist_service — Milestone Submit & Approve

**Files:**
- Create: `crates/checklist_service/src/milestone_handlers.rs`
- Modify: `crates/checklist_service/src/main.rs`

**Key context:**
- `AppState = Arc<ChecklistService>` (handlers.rs line 12)
- `ChecklistService` has `pub db: PgPool` and `pub producer: KafkaProducer` (checklist.rs lines 22-23)
- Handlers use `State(svc): State<AppState>` and access `svc.db`, `svc.producer`
- The existing `try_finalize()` in checklist.rs only triggers for AI Agent REQUIRED_STEPS.
  For TALENT milestones (step_ids = "milestone_1", "milestone_2", ...) it will never fire.
  Therefore `approve_milestone` MUST directly emit `ChecklistFinalized` + `DeploymentComplete`.

- [ ] **Step 1: Create `milestone_handlers.rs`**

```rust
// crates/checklist_service/src/milestone_handlers.rs
//
// State type: AppState = Arc<ChecklistService>  (handlers.rs line 12)
// Access: svc.db, svc.producer
// Kafka: svc.producer.publish(TOPIC, &key, &EventEnvelope::new("TypeName", &payload))

use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use chrono::Utc;
use common::events::{
    ChecklistFinalized, DeploymentComplete, EventEnvelope,
    TOPIC_CHECKLIST_EVENTS, TOPIC_DEPLOYMENT_COMPLETE,
};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use uuid::Uuid;

use crate::handlers::AppState;

#[derive(Debug, Deserialize)]
pub struct SubmitMilestoneRequest {
    pub freelancer_id: Uuid,
    pub notes: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ApproveMilestoneRequest {
    pub client_id: Uuid,
}

#[derive(Debug, Serialize)]
pub struct MilestoneStatus {
    pub step_id: String,
    pub step_label: String,
    pub passed: bool,
    pub submitted_at: Option<String>,
    pub approved_at: Option<String>,
    pub notes: Option<String>,
}

/// GET /checklist/:deployment_id/milestones
/// Both client and freelancer can view milestone statuses.
pub async fn list_milestones(
    State(svc): State<AppState>,
    Path(deployment_id): Path<Uuid>,
) -> Result<Json<Vec<MilestoneStatus>>, (StatusCode, String)> {
    let rows = sqlx::query(
        r#"
        SELECT step_id, step_label, passed,
               submitted_at::TEXT, approved_at::TEXT, notes
        FROM dod_checklist_steps
        WHERE deployment_id = $1
        ORDER BY step_id ASC
        "#,
    )
    .bind(deployment_id)
    .fetch_all(&svc.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let milestones = rows
        .iter()
        .map(|r| MilestoneStatus {
            step_id:      r.try_get("step_id").unwrap_or_default(),
            step_label:   r.try_get("step_label").unwrap_or_default(),
            passed:       r.try_get("passed").unwrap_or(false),
            submitted_at: r.try_get("submitted_at").unwrap_or(None),
            approved_at:  r.try_get("approved_at").unwrap_or(None),
            notes:        r.try_get("notes").unwrap_or(None),
        })
        .collect();

    Ok(Json(milestones))
}

/// POST /checklist/:deployment_id/step/:step_id/submit
/// Freelancer marks work as submitted for a milestone.
/// Idempotent: silently no-ops if already submitted.
pub async fn submit_milestone(
    State(svc): State<AppState>,
    Path((deployment_id, step_id)): Path<(Uuid, String)>,
    Json(req): Json<SubmitMilestoneRequest>,
) -> Result<StatusCode, (StatusCode, String)> {
    let now = Utc::now();

    let result = sqlx::query(
        r#"
        UPDATE dod_checklist_steps
        SET submitted_by = $1, submitted_at = $2,
            notes = COALESCE($3, notes)
        WHERE deployment_id = $4 AND step_id = $5
          AND submitted_at IS NULL
        "#,
    )
    .bind(req.freelancer_id)
    .bind(now)
    .bind(req.notes)
    .bind(deployment_id)
    .bind(&step_id)
    .execute(&svc.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if result.rows_affected() == 0 {
        // Either not found or already submitted — treat as idempotent success
        tracing::warn!(%deployment_id, %step_id, "submit_milestone: already submitted or step not found");
    }

    Ok(StatusCode::NO_CONTENT)
}

/// POST /checklist/:deployment_id/step/:step_id/approve
/// Client approves a submitted milestone.
/// When ALL milestones for this TALENT deployment are approved:
///   1. Upserts dod_checklist_summaries (all_passed = TRUE)
///   2. Emits ChecklistFinalized to TOPIC_CHECKLIST_EVENTS
///   3. Emits DeploymentComplete to TOPIC_DEPLOYMENT_COMPLETE
///      → payout_service starts the 30-second veto window
pub async fn approve_milestone(
    State(svc): State<AppState>,
    Path((deployment_id, step_id)): Path<(Uuid, String)>,
    Json(req): Json<ApproveMilestoneRequest>,
) -> Result<StatusCode, (StatusCode, String)> {
    let now = Utc::now();

    // 1. Approve this step (only if it has been submitted and not yet approved)
    let result = sqlx::query(
        r#"
        UPDATE dod_checklist_steps
        SET approved_by = $1, approved_at = $2,
            passed = TRUE, completed_at = $2
        WHERE deployment_id = $3 AND step_id = $4
          AND submitted_at IS NOT NULL
          AND approved_at IS NULL
        "#,
    )
    .bind(req.client_id)
    .bind(now)
    .bind(deployment_id)
    .bind(&step_id)
    .execute(&svc.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if result.rows_affected() == 0 {
        return Err((
            StatusCode::CONFLICT,
            "Milestone not submitted, already approved, or not found".to_string(),
        ));
    }

    // 2. Count total vs approved milestones
    let total: i64 = sqlx::query(
        "SELECT COUNT(*)::BIGINT FROM dod_checklist_steps WHERE deployment_id = $1",
    )
    .bind(deployment_id)
    .fetch_one(&svc.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .try_get(0)
    .unwrap_or(0);

    let approved: i64 = sqlx::query(
        "SELECT COUNT(*)::BIGINT FROM dod_checklist_steps WHERE deployment_id = $1 AND passed = TRUE",
    )
    .bind(deployment_id)
    .fetch_one(&svc.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .try_get(0)
    .unwrap_or(0);

    if total > 0 && total == approved {
        // 3. All milestones done — upsert summary
        sqlx::query(
            r#"
            INSERT INTO dod_checklist_summaries
                (deployment_id, all_passed, failed_steps, finalized_at)
            VALUES ($1, TRUE, ARRAY[]::TEXT[], $2)
            ON CONFLICT (deployment_id) DO UPDATE
              SET all_passed = TRUE,
                  failed_steps = ARRAY[]::TEXT[],
                  finalized_at = $2
            "#,
        )
        .bind(deployment_id)
        .bind(now)
        .execute(&svc.db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

        // 4. Emit ChecklistFinalized
        let finalized = ChecklistFinalized {
            deployment_id,
            all_passed: true,
            failed_steps: vec![],
        };
        if let Err(e) = svc
            .producer
            .publish(
                TOPIC_CHECKLIST_EVENTS,
                &deployment_id.to_string(),
                &EventEnvelope::new("ChecklistFinalized", &finalized),
            )
            .await
        {
            tracing::warn!("Failed to emit ChecklistFinalized: {e}");
        }

        // 5. Emit DeploymentComplete → triggers payout_service 30s veto window
        //    Fetch escrow amount + developer_id from deployments table
        let dep = sqlx::query(
            "SELECT developer_id, freelancer_id, escrow_amount_cents, agent_artifact_hash FROM deployments WHERE id = $1",
        )
        .bind(deployment_id)
        .fetch_optional(&svc.db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

        if let Some(row) = dep {
            let developer_id: Option<Uuid> = row.try_get("developer_id").unwrap_or(None);
            let freelancer_id: Uuid = row.try_get("freelancer_id").unwrap_or(Uuid::nil());
            let escrow_cents: i64 = row.try_get("escrow_amount_cents").unwrap_or(0);
            let artifact_hash: String = row.try_get("agent_artifact_hash").unwrap_or_default();

            let complete = DeploymentComplete {
                deployment_id,
                developer_id: developer_id.unwrap_or(freelancer_id),
                talent_id: freelancer_id,
                total_cents: escrow_cents as u64,
                artifact_hash,
            };
            if let Err(e) = svc
                .producer
                .publish(
                    TOPIC_DEPLOYMENT_COMPLETE,
                    &deployment_id.to_string(),
                    &EventEnvelope::new("DeploymentComplete", &complete),
                )
                .await
            {
                tracing::warn!("Failed to emit DeploymentComplete: {e}");
            }

            tracing::info!(
                %deployment_id,
                "All milestones approved — DeploymentComplete emitted, 30s veto window starting"
            );
        }
    }

    Ok(StatusCode::NO_CONTENT)
}
```

- [ ] **Step 2: Register routes in `checklist_service/src/main.rs`**

Add at the top:
```rust
mod milestone_handlers;
```

Add routes in the router builder (Axum 0.8 uses `{param}` syntax — match existing routes):
```rust
.route("/checklist/{deployment_id}/milestones",                    get(milestone_handlers::list_milestones))
.route("/checklist/{deployment_id}/step/{step_id}/submit",  post(milestone_handlers::submit_milestone))
.route("/checklist/{deployment_id}/step/{step_id}/approve", post(milestone_handlers::approve_milestone))
```

- [ ] **Step 3: Cargo check**

```bash
cmd /c "cd D:\AiStaffApp && set SQLX_OFFLINE=true && cargo check -p checklist_service 2>&1"
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add crates/checklist_service/src/milestone_handlers.rs crates/checklist_service/src/main.rs
git commit -m "feat(talent): milestone submit/approve endpoints + ChecklistFinalized + DeploymentComplete"
```

---

## Task 4: api.ts — Add AiTalent API Helpers

**Files:**
- Modify: `apps/web/lib/api.ts`

- [ ] **Step 1: Append the following to `apps/web/lib/api.ts`**

```typescript
// ── AiTalent Proposal & Engagement ──────────────────────────────────────────

export interface Proposal {
  id: string
  job_listing_id: string | null
  freelancer_id: string | null
  freelancer_email: string
  job_title: string
  cover_letter: string
  proposed_budget: string
  proposed_timeline: string
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED'
  submitted_at: string
}

export interface AcceptProposalRequest {
  transaction_id: string
  escrow_amount_cents: number
  milestones: string[]
}

export interface AcceptProposalResponse {
  deployment_id: string
  milestone_count: number
}

export interface MilestoneStatus {
  step_id: string
  step_label: string
  passed: boolean
  submitted_at: string | null
  approved_at: string | null
  notes: string | null
}

export async function fetchProposalsForJob(listingId: string): Promise<Proposal[]> {
  const res = await fetch(`/api/marketplace/listings/${listingId}/proposals`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function acceptProposal(
  proposalId: string,
  req: AcceptProposalRequest,
): Promise<AcceptProposalResponse> {
  const res = await fetch(`/api/marketplace/proposals/${proposalId}/accept`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function rejectProposal(proposalId: string, reason?: string): Promise<void> {
  const res = await fetch(`/api/marketplace/proposals/${proposalId}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  })
  if (!res.ok) throw new Error(await res.text())
}

export async function fetchMilestones(deploymentId: string): Promise<MilestoneStatus[]> {
  const res = await fetch(`/api/checklist/checklist/${deploymentId}/milestones`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function submitMilestone(
  deploymentId: string,
  stepId: string,
  freelancerId: string,
  notes?: string,
): Promise<void> {
  const res = await fetch(
    `/api/checklist/checklist/${deploymentId}/step/${stepId}/submit`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ freelancer_id: freelancerId, notes }),
    },
  )
  if (!res.ok) throw new Error(await res.text())
}

export async function approveMilestone(
  deploymentId: string,
  stepId: string,
  clientId: string,
): Promise<void> {
  const res = await fetch(
    `/api/checklist/checklist/${deploymentId}/step/${stepId}/approve`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId }),
    },
  )
  if (!res.ok) throw new Error(await res.text())
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/api.ts
git commit -m "feat(talent): api.ts — proposal + milestone helpers"
```

---

## Task 5: Next.js Proxy Routes

**Files:** 6 new route files under `apps/web/app/api/`

**Pattern** (Next.js 15 — params is a Promise, must be awaited):
```typescript
export async function METHOD(
  req: NextRequest,
  { params }: { params: Promise<{ paramName: string }> }
) {
  const { paramName } = await params
```

Reference: `apps/web/app/api/admin/listings/[id]/approve/route.ts` uses this exact pattern.

- [ ] **Step 1: Create all 6 proxy route files**

**`apps/web/app/api/marketplace/listings/[listingId]/proposals/route.ts`:**
```typescript
import { auth } from '@/auth'
import { NextRequest, NextResponse } from 'next/server'

const MARKETPLACE = process.env.MARKETPLACE_SERVICE_URL ?? 'http://localhost:3002'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ listingId: string }> },
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { listingId } = await params
  const res = await fetch(`${MARKETPLACE}/listings/${listingId}/proposals`)
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
```

**`apps/web/app/api/marketplace/proposals/[proposalId]/accept/route.ts`:**
```typescript
import { auth } from '@/auth'
import { NextRequest, NextResponse } from 'next/server'

const MARKETPLACE = process.env.MARKETPLACE_SERVICE_URL ?? 'http://localhost:3002'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ proposalId: string }> },
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { proposalId } = await params
  const body = await req.json()
  const res = await fetch(`${MARKETPLACE}/proposals/${proposalId}/accept`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
```

**`apps/web/app/api/marketplace/proposals/[proposalId]/reject/route.ts`:**
```typescript
import { auth } from '@/auth'
import { NextRequest, NextResponse } from 'next/server'

const MARKETPLACE = process.env.MARKETPLACE_SERVICE_URL ?? 'http://localhost:3002'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ proposalId: string }> },
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { proposalId } = await params
  const body = await req.json()
  const res = await fetch(`${MARKETPLACE}/proposals/${proposalId}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return new NextResponse(null, { status: res.status })
}
```

**`apps/web/app/api/checklist/checklist/[deploymentId]/milestones/route.ts`:**
```typescript
import { auth } from '@/auth'
import { NextRequest, NextResponse } from 'next/server'

const CHECKLIST = process.env.CHECKLIST_SERVICE_URL ?? 'http://localhost:3003'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ deploymentId: string }> },
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { deploymentId } = await params
  const res = await fetch(`${CHECKLIST}/checklist/${deploymentId}/milestones`)
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
```

**`apps/web/app/api/checklist/checklist/[deploymentId]/step/[stepId]/submit/route.ts`:**
```typescript
import { auth } from '@/auth'
import { NextRequest, NextResponse } from 'next/server'

const CHECKLIST = process.env.CHECKLIST_SERVICE_URL ?? 'http://localhost:3003'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ deploymentId: string; stepId: string }> },
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { deploymentId, stepId } = await params
  const body = await req.json()
  const res = await fetch(
    `${CHECKLIST}/checklist/${deploymentId}/step/${stepId}/submit`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
  )
  return new NextResponse(null, { status: res.status })
}
```

**`apps/web/app/api/checklist/checklist/[deploymentId]/step/[stepId]/approve/route.ts`:**
```typescript
import { auth } from '@/auth'
import { NextRequest, NextResponse } from 'next/server'

const CHECKLIST = process.env.CHECKLIST_SERVICE_URL ?? 'http://localhost:3003'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ deploymentId: string; stepId: string }> },
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { deploymentId, stepId } = await params
  const body = await req.json()
  const res = await fetch(
    `${CHECKLIST}/checklist/${deploymentId}/step/${stepId}/approve`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
  )
  return new NextResponse(null, { status: res.status })
}
```

- [ ] **Step 2: Next.js build check**

```bash
cd apps/web && npx next build 2>&1 | tail -20
```

Expected: no type errors or missing module errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/api/marketplace/ apps/web/app/api/checklist/
git commit -m "feat(talent): Next.js proxy routes — proposals + milestones"
```

---

## Task 6: Client Proposals Inbox UI

**Files:**
- Create: `apps/web/app/proposals/inbox/page.tsx`
- Create: `apps/web/app/proposals/inbox/ProposalsInboxClient.tsx`
- Create: `apps/web/app/proposals/inbox/ProposalCard.tsx`
- Create: `apps/web/app/proposals/inbox/MilestoneForm.tsx`

- [ ] **Step 1: Create `MilestoneForm.tsx`**

```tsx
// apps/web/app/proposals/inbox/MilestoneForm.tsx
'use client'
import { useState } from 'react'
import { Plus, X } from 'lucide-react'

interface Props {
  onConfirm: (milestones: string[], escrowCents: number) => void
  onCancel: () => void
  loading: boolean
}

export function MilestoneForm({ onConfirm, onCancel, loading }: Props) {
  const [milestones, setMilestones] = useState<string[]>([''])
  const [budget, setBudget] = useState('')

  const add = () => setMilestones(m => [...m, ''])
  const remove = (i: number) => setMilestones(m => m.filter((_, idx) => idx !== i))
  const update = (i: number, val: string) =>
    setMilestones(m => m.map((s, idx) => (idx === i ? val : s)))

  const handleSubmit = () => {
    const clean = milestones.map(m => m.trim()).filter(Boolean)
    if (clean.length === 0) return
    const cents = Math.round(parseFloat(budget || '0') * 100)
    onConfirm(clean, cents)
  }

  return (
    <div className="space-y-4 rounded border border-zinc-700 bg-zinc-950 p-4">
      <h3 className="text-sm font-semibold text-zinc-50">Define Milestones</h3>
      <div className="space-y-2">
        {milestones.map((m, i) => (
          <div key={i} className="flex gap-2">
            <input
              value={m}
              onChange={e => update(i, e.target.value)}
              placeholder={`Milestone ${i + 1}`}
              className="flex-1 rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-50 placeholder-zinc-500 focus:border-amber-400 focus:outline-none"
            />
            {milestones.length > 1 && (
              <button
                onClick={() => remove(i)}
                aria-label="Remove milestone"
                className="text-zinc-500 hover:text-red-400"
              >
                <X size={16} />
              </button>
            )}
          </div>
        ))}
      </div>

      <button
        onClick={add}
        className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300"
      >
        <Plus size={14} /> Add milestone
      </button>

      <div>
        <label className="mb-1 block text-xs text-zinc-400">Escrow Amount (USD)</label>
        <input
          type="number"
          value={budget}
          onChange={e => setBudget(e.target.value)}
          placeholder="0.00"
          className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-50 placeholder-zinc-500 focus:border-amber-400 focus:outline-none"
        />
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="flex-1 rounded bg-amber-400 py-2 text-xs font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
        >
          {loading ? 'Locking escrow…' : 'Hire & Lock Escrow'}
        </button>
        <button
          onClick={onCancel}
          className="rounded border border-zinc-700 px-4 py-2 text-xs text-zinc-400 hover:text-zinc-50"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `ProposalCard.tsx`**

```tsx
// apps/web/app/proposals/inbox/ProposalCard.tsx
'use client'
import { useState } from 'react'
import { CheckCircle, XCircle, Clock } from 'lucide-react'
import { Proposal, acceptProposal, rejectProposal, AcceptProposalResponse } from '@/lib/api'
import { MilestoneForm } from './MilestoneForm'

interface Props {
  proposal: Proposal
  onUpdate: (result?: AcceptProposalResponse) => void
}

const STATUS_ICON: Record<string, React.ReactNode> = {
  PENDING:  <Clock size={12} />,
  ACCEPTED: <CheckCircle size={12} />,
  REJECTED: <XCircle size={12} />,
}
const STATUS_COLOR: Record<string, string> = {
  PENDING:  'text-zinc-400',
  ACCEPTED: 'text-emerald-500',
  REJECTED: 'text-red-500',
}

export function ProposalCard({ proposal, onUpdate }: Props) {
  const [showMilestones, setShowMilestones] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleAccept = async (milestones: string[], escrowCents: number) => {
    setLoading(true)
    setError(null)
    try {
      const result = await acceptProposal(proposal.id, {
        transaction_id: crypto.randomUUID(),
        escrow_amount_cents: escrowCents,
        milestones,
      })
      // Store engagement locally so /engagements page can display without a list endpoint
      const stored = JSON.parse(localStorage.getItem('active_engagements') ?? '[]')
      stored.push({
        deploymentId: result.deployment_id,
        jobTitle: proposal.job_title,
        counterpartyEmail: proposal.freelancer_email,
      })
      localStorage.setItem('active_engagements', JSON.stringify(stored))
      setShowMilestones(false)
      onUpdate(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to accept proposal')
    } finally {
      setLoading(false)
    }
  }

  const handleReject = async () => {
    setLoading(true)
    setError(null)
    try {
      await rejectProposal(proposal.id, 'Not the right fit at this time')
      onUpdate()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reject')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded border border-zinc-800 bg-zinc-900 p-4 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-zinc-50">{proposal.freelancer_email}</p>
          <p className="text-xs text-zinc-400 mt-0.5">{proposal.job_title}</p>
        </div>
        <span
          className={`flex items-center gap-1 text-xs font-mono ${STATUS_COLOR[proposal.status] ?? 'text-zinc-400'}`}
        >
          {STATUS_ICON[proposal.status]}
          {proposal.status}
        </span>
      </div>

      {proposal.cover_letter && (
        <p className="text-xs text-zinc-400 leading-relaxed line-clamp-3">
          {proposal.cover_letter}
        </p>
      )}

      <div className="flex gap-4 text-xs text-zinc-500">
        {proposal.proposed_budget && <span>Budget: {proposal.proposed_budget}</span>}
        {proposal.proposed_timeline && <span>Timeline: {proposal.proposed_timeline}</span>}
      </div>

      {error && <p className="text-xs text-red-500" role="alert">{error}</p>}

      {proposal.status === 'PENDING' && !showMilestones && (
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => setShowMilestones(true)}
            className="flex-1 rounded bg-amber-400 py-2 text-xs font-semibold text-zinc-950 hover:bg-amber-300"
          >
            Accept &amp; Define Milestones
          </button>
          <button
            onClick={handleReject}
            disabled={loading}
            className="rounded border border-zinc-700 px-4 py-2 text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
          >
            Reject
          </button>
        </div>
      )}

      {showMilestones && (
        <MilestoneForm
          onConfirm={handleAccept}
          onCancel={() => setShowMilestones(false)}
          loading={loading}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 3: Create `ProposalsInboxClient.tsx`**

```tsx
// apps/web/app/proposals/inbox/ProposalsInboxClient.tsx
'use client'
import { useEffect, useState } from 'react'
import { Proposal, fetchListings, fetchProposalsForJob } from '@/lib/api'
import { ProposalCard } from './ProposalCard'
import { Session } from 'next-auth'

interface Props { session: Session }

export default function ProposalsInboxClient({ session }: Props) {
  const profileId = (session.user as any)?.profileId as string | undefined
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    if (!profileId) { setLoading(false); return }
    try {
      const listings = await fetchListings()
      // Show proposals for listings owned by this profile
      const mine = (listings as any[]).filter(l => l.developer_id === profileId)
      const nested = await Promise.all(mine.map(l => fetchProposalsForJob(l.id)))
      setProposals(nested.flat())
    } catch {
      // empty state on error
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [profileId])

  if (loading) return <div className="h-40 animate-pulse rounded bg-zinc-800" />
  if (proposals.length === 0)
    return <p className="text-sm text-zinc-400">No proposals received yet.</p>

  return (
    <div className="space-y-4">
      {proposals.map(p => (
        <ProposalCard key={p.id} proposal={p} onUpdate={() => load()} />
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Create `inbox/page.tsx`**

```tsx
// apps/web/app/proposals/inbox/page.tsx
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import ProposalsInboxClient from './ProposalsInboxClient'

export default async function ProposalsInboxPage() {
  const session = await auth()
  if (!session) redirect('/login')
  const role = (session.user as any)?.role as string | undefined
  // Talents don't receive proposals — they submit them
  if (role === 'talent') redirect('/proposals')

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-50">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="mb-6 text-lg font-semibold text-zinc-50">Proposals Inbox</h1>
        <ProposalsInboxClient session={session} />
      </div>
    </main>
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/proposals/inbox/
git commit -m "feat(talent): client proposals inbox — accept + reject + milestone definition"
```

---

## Task 7: Freelancer Engagements Page

**Files:**
- Create: `apps/web/app/engagements/page.tsx`
- Create: `apps/web/app/engagements/EngagementsClient.tsx`
- Create: `apps/web/app/engagements/MilestonePanel.tsx`

- [ ] **Step 1: Create `MilestonePanel.tsx`**

```tsx
// apps/web/app/engagements/MilestonePanel.tsx
'use client'
import { useState } from 'react'
import { CheckCircle, Clock, Upload } from 'lucide-react'
import { MilestoneStatus, submitMilestone, approveMilestone } from '@/lib/api'

interface Props {
  deploymentId: string
  milestones: MilestoneStatus[]
  role: 'talent' | 'client'
  profileId: string
  onUpdate: () => void
}

export function MilestonePanel({ deploymentId, milestones, role, profileId, onUpdate }: Props) {
  const [loading, setLoading] = useState<string | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (stepId: string) => {
    setLoading(stepId)
    setError(null)
    try {
      await submitMilestone(deploymentId, stepId, profileId, notes[stepId])
      onUpdate()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submit failed')
    } finally {
      setLoading(null)
    }
  }

  const handleApprove = async (stepId: string) => {
    setLoading(stepId)
    setError(null)
    try {
      await approveMilestone(deploymentId, stepId, profileId)
      onUpdate()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Approve failed')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-xs text-red-500" role="alert">{error}</p>}
      {milestones.length === 0 && (
        <p className="text-xs text-zinc-500">No milestones yet.</p>
      )}
      {milestones.map(m => (
        <div key={m.step_id} className="rounded border border-zinc-800 bg-zinc-900 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {m.passed ? (
                <CheckCircle size={14} className="shrink-0 text-emerald-500" />
              ) : m.submitted_at ? (
                <Clock size={14} className="shrink-0 text-amber-400" />
              ) : (
                <div className="h-3.5 w-3.5 shrink-0 rounded-full border border-zinc-600" />
              )}
              <span className="text-sm text-zinc-50">{m.step_label}</span>
            </div>
            <span className="text-xs font-mono text-zinc-500">
              {m.passed ? 'Approved' : m.submitted_at ? 'Under review' : 'Pending'}
            </span>
          </div>

          {m.notes && (
            <p className="ml-5 text-xs text-zinc-400">{m.notes}</p>
          )}

          {/* Talent: submit work */}
          {role === 'talent' && !m.submitted_at && !m.passed && (
            <div className="ml-5 space-y-2">
              <input
                value={notes[m.step_id] ?? ''}
                onChange={e => setNotes(n => ({ ...n, [m.step_id]: e.target.value }))}
                placeholder="Deliverable link or notes…"
                aria-label={`Notes for ${m.step_label}`}
                className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-50 placeholder-zinc-500 focus:border-amber-400 focus:outline-none"
              />
              <button
                onClick={() => handleSubmit(m.step_id)}
                disabled={loading === m.step_id}
                className="flex items-center gap-1 rounded bg-amber-400 px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
              >
                <Upload size={12} /> Submit Work
              </button>
            </div>
          )}

          {/* Client: approve submitted work */}
          {role === 'client' && m.submitted_at && !m.passed && (
            <div className="ml-5">
              <button
                onClick={() => handleApprove(m.step_id)}
                disabled={loading === m.step_id}
                className="flex items-center gap-1 rounded bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
              >
                <CheckCircle size={12} /> Approve Milestone
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Create `EngagementsClient.tsx`**

```tsx
// apps/web/app/engagements/EngagementsClient.tsx
'use client'
import { useEffect, useState } from 'react'
import { fetchMilestones, MilestoneStatus } from '@/lib/api'
import { MilestonePanel } from './MilestonePanel'
import { Session } from 'next-auth'

interface StoredEngagement {
  deploymentId: string
  jobTitle: string
  counterpartyEmail: string
}

interface Props { session: Session }

export default function EngagementsClient({ session }: Props) {
  const profileId = (session.user as any)?.profileId as string ?? ''
  const role = ((session.user as any)?.role ?? 'talent') as 'talent' | 'client'

  const [engagements, setEngagements] = useState<StoredEngagement[]>([])
  const [milestones, setMilestones] = useState<Record<string, MilestoneStatus[]>>({})
  const [loading, setLoading] = useState(true)

  const loadMilestones = async (deploymentId: string) => {
    try {
      const ms = await fetchMilestones(deploymentId)
      setMilestones(prev => ({ ...prev, [deploymentId]: ms }))
    } catch { /* silently skip */ }
  }

  useEffect(() => {
    const stored = JSON.parse(
      localStorage.getItem('active_engagements') ?? '[]',
    ) as StoredEngagement[]
    setEngagements(stored)
    Promise.all(stored.map(e => loadMilestones(e.deploymentId))).finally(() =>
      setLoading(false),
    )
  }, [])

  if (loading) return <div className="h-40 animate-pulse rounded bg-zinc-800" />
  if (engagements.length === 0)
    return <p className="text-sm text-zinc-400">No active engagements.</p>

  return (
    <div className="space-y-6">
      {engagements.map(eng => (
        <div key={eng.deploymentId} className="rounded border border-zinc-800 bg-zinc-900 p-4 space-y-3">
          <div>
            <p className="text-sm font-medium text-zinc-50">{eng.jobTitle}</p>
            <p className="text-xs text-zinc-400">{eng.counterpartyEmail}</p>
            <p className="mt-1 font-mono text-xs text-zinc-600">{eng.deploymentId}</p>
          </div>
          <MilestonePanel
            deploymentId={eng.deploymentId}
            milestones={milestones[eng.deploymentId] ?? []}
            role={role}
            profileId={profileId}
            onUpdate={() => loadMilestones(eng.deploymentId)}
          />
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Create `engagements/page.tsx`**

```tsx
// apps/web/app/engagements/page.tsx
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import EngagementsClient from './EngagementsClient'

export default async function EngagementsPage() {
  const session = await auth()
  if (!session) redirect('/login')

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-50">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="mb-6 text-lg font-semibold text-zinc-50">Active Engagements</h1>
        <EngagementsClient session={session} />
      </div>
    </main>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/engagements/
git commit -m "feat(talent): engagements page — milestone submit (talent) + approve (client)"
```

---

## Task 8: Sidebar Nav

**Files:**
- Modify: `apps/web/components/AppSidebar.tsx`

- [ ] **Step 1: Add nav items**

Open `apps/web/components/AppSidebar.tsx`. Find the nav array (likely `PRIMARY_NAV` or similar). Add:

```typescript
import { Inbox, Briefcase } from 'lucide-react'

// In nav array — after existing items:
{ href: '/proposals/inbox', label: 'Proposals Inbox', icon: Inbox   },  // clients + agents
{ href: '/engagements',     label: 'Engagements',     icon: Briefcase }, // all roles
```

Show "Proposals Inbox" only when `role !== 'talent'` (clients and agent-owners receive proposals).
Show "Engagements" for all authenticated users.

- [ ] **Step 2: TypeScript check**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/AppSidebar.tsx
git commit -m "feat(talent): sidebar — Proposals Inbox + Engagements nav items"
```

---

## Task 9: Full Build Verification & Push

- [ ] **Step 1: Full workspace cargo check**

```bash
cmd /c "cd D:\AiStaffApp && set SQLX_OFFLINE=true && cargo check 2>&1 | tail -30"
```

Expected: no errors across all crates.

- [ ] **Step 2: SQLx cache regeneration** (requires live Postgres)

If running `docker compose up -d postgres` is possible:
```bash
cargo sqlx prepare --workspace
git add .sqlx/
git commit -m "chore: regenerate sqlx offline cache after migration 0027"
```

If no live DB available in this session: skip — the non-macro queries added in Tasks 2 and 3 do not require cache updates. Only run this before the next full Docker build.

- [ ] **Step 3: Next.js build**

```bash
cd apps/web && npx next build 2>&1 | tail -20
```

Expected: build succeeds, no type errors.

- [ ] **Step 4: Push**

```bash
git push origin master
```

---

## Complete AiTalent Flow (Post-Implementation)

```
1. Client posts job
   POST /listings (category=AiTalent)

2. Freelancer submits proposal
   /proposals/draft → POST /api/proposals/submit → proposals table
   (job_listing_id + freelancer_id now linkable via migration 0027 columns)

3. Client reviews proposals inbox
   /proposals/inbox → GET /listings/:id/proposals

4. Client accepts a proposal
   POST /proposals/:id/accept
   → deployment record (type=TALENT, state=PENDING)
   → dod_checklist_steps rows for each milestone
   → auto-rejects all other proposals for that listing
   → emits DeploymentStarted

5. Freelancer submits work per milestone
   /engagements → POST /checklist/:id/step/:step/submit

6. Client approves each milestone
   /engagements → POST /checklist/:id/step/:step/approve
   → When ALL approved: emits ChecklistFinalized + DeploymentComplete

7. payout_service: 30-second veto window
   → VetoCard on /dashboard
   → POST /payouts/:id/veto OR window elapses

8. EscrowRelease emitted
   → 15% platform / 59.5% client-developer / 25.5% talent
   → Logged to escrow_payouts (append-only)
```
