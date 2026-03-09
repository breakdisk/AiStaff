# ADR 0004 — Veto-First Escrow: 30-Second Human Veto Window

**Date:** 2026-03-09
**Status:** Accepted

---

## Context

Autonomous AI agents can trigger escrow release via `DeploymentComplete` events.
Without a human checkpoint, funds could be released for failed or malicious deployments
before a human can intervene.

---

## Decision

All escrow releases pass through a mandatory 30-second veto window:

1. `DeploymentComplete` event consumed by `payout_service`.
2. Deployment status → `VETO_WINDOW`. Timer starts (server clock).
3. Human operator receives VetoCard notification (bottom sheet on mobile UI).
4. During 30 seconds: `POST /payouts/:id/veto` is available.
5. After 30 seconds with no veto → automatic `POST /payouts/:id/approve`.
6. Approve triggers `split_70_30(total_cents)` → EscrowRelease event.

**Additional gates before release:**
- ChecklistFinalized (all 6 required DoD steps complete)
- IdentityVerified (both parties at Tier ≥ 1)

---

## Consequences

**Positive:**
- Human-in-the-loop at the critical financial decision point.
- Complies with "Human-on-the-Loop" design philosophy.
- 30 seconds is short enough to not block operations but long enough for human review.

**Negative:**
- Adds 30-second minimum latency to all payouts.
- Requires reliable timer implementation (server clock, not client clock).
- Missed veto window is final — no post-release reversal.

---

## Alternatives Rejected

| Alternative | Reason Rejected |
|---|---|
| Immediate release on DeploymentComplete | No human oversight; P0 risk |
| 5-minute veto window | Too disruptive to developer cash-flow |
| Opt-in veto | Operators would disable it; defeats the purpose |
| Biometric approval (instead of veto) | Biometric is an additional gate, not a replacement |
