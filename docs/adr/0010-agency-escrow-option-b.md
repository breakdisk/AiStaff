# ADR 0010 — Agency Escrow — Option B: Platform-Distributed Worker Splits

**Date:** 2026-03-29
**Status:** Accepted
**Affects:** `crates/common`, `crates/payout_service`, `crates/marketplace_service`

---

## Context

AiStaff supports Agencies that manage teams of AI Developers and Talent. When a client pays for
an agency deployment, the agency takes a configurable management fee from escrow before workers
are paid.

Two disbursement models were considered:

- **Option A — Lump sum to agency**: The platform releases the full worker-plus-fee amount to
  the agency as a single payout. The agency is responsible for calculating and distributing the
  individual worker shares.

- **Option B — Platform-distributed splits**: The platform calculates all splits atomically and
  distributes directly to each worker. The agency receives only its management fee slice; it
  never holds worker funds in transit.

---

## Decision

**Option B — Platform-Distributed Worker Splits.**

The platform calculates and atomically inserts all payout rows (platform fee, agency management
fee, developer share, talent share) within a single DB transaction. No lump sum is released to
the agency.

### Split formula (agency path)

```
platform_cents = total_cents * 12 / 100          // integer division; 12% for agency deployments
remaining      = total_cents - platform_cents
agency_cents   = remaining * agency_pct / 100    // agency_pct from deployments.agency_pct
post_agency    = remaining - agency_cents
dev_cents      = post_agency * 70 / 100          // integer division
talent_cents   = post_agency - dev_cents         // lossless: remainder always goes to talent
```

All arithmetic uses integer truncation (never round up) — CLAUDE.md financial invariant.
Any sub-cent remainder from truncation stays in the platform fee row; it is at most 3 cents
per deployment.

### Commission rates

| Deployment type | Platform fee | Agency fee | Dev share | Talent share |
|---|---|---|---|---|
| Freelancer (no agency) | 15% of total | — | 70% of remainder | 30% of remainder |
| Agency deployment | 12% of total | `agency_pct`% of remainder | 70% of post-agency remainder | balance of post-agency remainder |

The platform fee is reduced to 12% for agency deployments to account for the agency absorbing
client acquisition and team management overhead.

### Crates affected

**`crates/common`** — `EscrowRelease` event gains two new fields with `#[serde(default)]` for
backward compatibility with existing consumers:

```rust
pub struct EscrowRelease {
    pub deployment_id:  Uuid,
    pub transaction_id: Uuid,          // UUID v7
    pub platform_cents: u64,
    pub dev_cents:      u64,
    pub talent_cents:   u64,
    pub agency_id:      Option<Uuid>,  // new — None for freelancer deployments
    pub agency_cents:   u64,           // new — 0 for freelancer deployments; #[serde(default)]
    pub released_at:    DateTime<Utc>,
}
```

**`crates/payout_service`** — new `split_agency()` function alongside the existing
`split_with_commission()`. Both veto-approve paths branch on agency presence:

```rust
pub fn split_agency(total_cents: u64, agency_pct: u8) -> (u64, u64, u64, u64)
// returns (platform_cents, agency_cents, dev_cents, talent_cents)
```

**`crates/marketplace_service`** — the `escrow_consumer` Kafka handler inserts 3 rows
(platform, dev, talent) for freelancer deployments or 4 rows (platform, agency, dev, talent)
for agency deployments, all within a single `sqlx::Transaction`. `fee_pct` is stored as 12
or 15 depending on agency presence.

### DB changes

**Migration 0060:**

```sql
ALTER TABLE deployments
    ADD COLUMN agency_id  UUID REFERENCES organisations(id),
    ADD COLUMN agency_pct SMALLINT NOT NULL DEFAULT 0
                          CHECK (agency_pct >= 0 AND agency_pct <= 100);
```

`escrow_payouts.reason` gains the new enum value `'agency_mgmt_fee'` alongside the existing
`'developer_pct'` and `'talent_pct'` values.

`platform_fees.fee_pct` now stores 12 or 15; previously it was always 15 for MVP deployments.
This makes the column meaningful for analytics segmentation without a schema change.

---

## Consequences

**Positive**
- Worker payment protection is a competitive differentiator versus traditional agency models;
  workers have a platform-level guarantee that funds are disbursed at settlement, not subject
  to agency cash-flow or intent.
- Full audit trail — every payout row is immutable in `escrow_payouts` with a `reason` label;
  the agency management fee row is indistinguishable in structure from developer and talent rows.
- Atomic DB transaction guarantees either all parties are paid or none are; partial settlement
  states are impossible.
- `fee_pct` on `platform_fees` now carries analytical signal: 12 vs 15 segments agency revenue
  from freelancer revenue without an additional column.

**Negative / Trade-offs**
- The platform must know each worker's `recipient_id` at settlement time. Lazy recipient
  assignment (common in lump-sum models) is not possible; agency deployments require all worker
  IDs to be resolved before `ChecklistFinalized` triggers escrow release.
- Four-row atomic insert is slightly more complex than the existing three-row path; both paths
  must be covered by integration tests.

**Neutral**
- `agency_cents: u64` with `#[serde(default)]` on `EscrowRelease` allows a rolling deploy:
  update common consumers first (they default to 0), then deploy payout_service with the new
  split logic.

---

## Alternatives Rejected

| Alternative | Reason Rejected |
|---|---|
| Option A — lump sum to agency | Creates a trust dependency on the agency; workers have no platform guarantee against non-payment or delayed payment. Audit trail ends at the agency boundary. |
| Stripe Connect split payments at charge time | Adds a third-party dependency before the agency feature is validated at scale. Deferred to post-MVP if agency volume justifies the integration cost. |
| On-chain smart contract split | Out of scope for current tech stack (Rust/Postgres/Kafka). Introduces a blockchain dependency with no additional correctness guarantee beyond what atomic DB transactions already provide. |
