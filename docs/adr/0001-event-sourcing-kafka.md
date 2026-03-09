# ADR 0001 — Event Sourcing via Kafka with EventEnvelope

**Date:** 2026-03-09
**Status:** Accepted

---

## Context

The platform spans three marketplaces (AiTalent, AI Agent, AIRobot) and 15 microservices.
State mutations (deployment lifecycle, escrow release, identity upgrades) must be:
- Auditable (append-only record of what happened and when)
- Observable across service boundaries without tight coupling
- Replayable for disaster recovery and new consumer onboarding

---

## Decision

All state mutations emit a Kafka event wrapped in `EventEnvelope<T>`:

```rust
pub struct EventEnvelope<T> {
    pub event_id:      Uuid,        // UUID v7 — time-ordered
    pub emitted_at:    DateTime<Utc>,
    pub source_service: String,
    pub payload:       T,
}
```

- Consumers read from Kafka and write to their own DB projections.
- Manual offset commit after successful DB write (at-least-once delivery).
- No direct DB-to-DB calls between services.

---

## Consequences

**Positive:**
- Complete audit trail via event log.
- Services are decoupled — can be deployed and scaled independently.
- New consumers can be added without modifying producers.
- Event replay is possible for recovery.

**Negative:**
- Eventual consistency — consumers may lag behind producers.
- Kafka becomes a critical dependency (addressed by Confluent HA config in prod).
- At-least-once delivery requires idempotent consumers.

---

## Alternatives Rejected

| Alternative | Reason Rejected |
|---|---|
| Direct HTTP calls between services | Tight coupling, synchronous failure propagation |
| Shared database | Violates bounded context isolation |
| gRPC streaming | More complex, no built-in persistence/replay |
| RabbitMQ | No log retention; no replay capability |
