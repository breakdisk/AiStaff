# ADR 0008 — Platform Fee Ledger

**Date:** 2026-03-24
**Status:** Accepted
**Affects:** `payout_service`, `marketplace_service`, `apps/web`

---

## Context

Since launch, the platform collected 0% commission. The escrow split ran a flat 70/30: the
deploying developer received 70% of the total and the talent received 30%. No revenue ledger
existed anywhere in the system.

Two problems followed:

1. **No platform revenue.** Every deployment settled entirely to the two counterparties.
   There was no mechanism to retain a platform cut, record it, or reconcile it against
   operational costs.

2. **No audit table for platform income.** `escrow_payouts` records only developer and talent
   amounts. Adding a platform column to that table would mutate the existing append-only audit
   schema — a violation of the irreversibility constraint on committed migrations.

---

## Decision

### 1. New three-way integer split

The platform takes 15% of `total_cents` first. The remainder is then split 70/30 between
developer and talent. All arithmetic uses integer truncation (never round up) so that
`platform_cents + dev_cents + talent_cents ≤ total_cents` is always true:

```
platform_cents = total_cents * 15 / 100          // integer division
remaining      = total_cents - platform_cents
dev_cents      = remaining * 70 / 100            // integer division
talent_cents   = remaining - dev_cents
```

### 2. New `platform_fees` table (append-only)

```sql
platform_fees (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_id  UUID NOT NULL REFERENCES deployments(id),
  fee_cents      BIGINT NOT NULL CHECK (fee_cents > 0),
  fee_pct        SMALLINT NOT NULL DEFAULT 15,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
```

No `UPDATE` or `DELETE` grants are issued on this table. It is append-only, consistent with
`escrow_payouts` and `tool_call_audit`.

### 3. `split_with_commission` replaces `split_70_30`

New function signature in `payout_service`:

```rust
pub fn split_with_commission(total_cents: u64) -> (u64, u64, u64)
// returns (platform_cents, dev_cents, talent_cents)
```

The existing `split_70_30(u64) -> (u64, u64)` function is retained as a deprecated alias that
calls `split_with_commission` and drops the platform component. It will be removed in the next
major payout_service refactor once all callers are migrated.

### 4. `EscrowRelease` event gains `platform_cents` field

The Kafka `EscrowRelease` event envelope gains a new required field:

```rust
pub struct EscrowRelease {
    pub deployment_id:  Uuid,
    pub transaction_id: Uuid,   // UUID v7
    pub platform_cents: u64,    // new field
    pub dev_cents:      u64,
    pub talent_cents:   u64,
    pub released_at:    DateTime<Utc>,
}
```

Consumers that have not yet migrated will fail to deserialize — this is intentional. All
consumers must be updated atomically with the payout_service deployment.

### 5. Transactional insert for admin force-release

The admin force-release handler (`POST /admin/deployments/:id/force-release`) must insert into
both `escrow_payouts` and `platform_fees` inside a single DB transaction. A partial insert that
records developer/talent payouts without a corresponding platform fee row is a P1 audit violation.

---

## Consequences

**Positive**
- Platform has a revenue stream with a full audit trail from day one.
- Integer truncation ensures the three amounts never exceed `total_cents`; any truncation
  remainder stays in escrow (at most 2 cents) and can be swept in a future micro-remainder
  handler if required.
- `platform_fees` is a clean, separate append-only table — the existing `escrow_payouts`
  schema is untouched.
- `fee_pct` column on `platform_fees` allows future rate changes without a schema migration;
  each row records the rate that was in effect at the time of settlement.

**Negative / Trade-offs**
- Deploying the new payout_service requires all `EscrowRelease` Kafka consumers to be updated
  simultaneously. A rolling deploy with mixed consumers will cause deserialization failures.
  Mitigation: deploy consumers first with a backward-compatible `Option<u64>` for
  `platform_cents`, then deploy payout_service, then tighten to required.
- `split_70_30` retained as deprecated alias increases cognitive overhead until removed.

---

## Alternatives Rejected

| Alternative | Reason rejected |
|---|---|
| `DECIMAL` or `FLOAT` for fee storage | Floating-point arithmetic introduces rounding errors on financial values. All money columns are `BIGINT` (cents) per the project invariant. |
| `fee_pct` column added directly to `escrow_payouts` | Complicates the existing append-only audit schema. Two concerns (counterparty split and platform revenue) belong in separate tables. |
| Variable fee per deployment (marketplace_service sets it) | Adds negotiation surface and code complexity. Flat 15% is sufficient for MVP; variable pricing deferred. |
| Separate `platform_wallet` balance table | Unnecessary indirection for MVP. `platform_fees` rows are the ledger; balance is `SUM(fee_cents)` on query. |
