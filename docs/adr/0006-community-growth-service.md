# ADR-0006: Community & Growth Service (Feature 08)

**Date:** 2026-03-10
**Status:** Accepted
**Deciders:** Platform Architecture, Product

---

## Context

The v2 business model adds a human layer around AI deployment: talent needs community
infrastructure (peer learning, mentorship, career growth, well-being monitoring, carbon
footprint tracking) to operate sustainably at scale. These concerns are orthogonal to
the core escrow/deployment pipeline and belong in a dedicated bounded context.

Without a community service, these features would either:
- Pollute `marketplace_service` with non-marketplace logic
- Be scattered across identity/analytics with no ownership boundary
- Require the frontend to aggregate from multiple services

---

## Decision

Introduce `crates/community_service` as a new independent bounded context (port **3011**),
governed by migrations **0014** (`community_growth`) and **0015** (`multi_channel_notifications`).

### Domain Modules

| Module | File | Responsibility |
|---|---|---|
| Community Hubs | `hub_service.rs` | Hubs, membership, events, forum threads/posts |
| Mentorship | `mentorship.rs` | Mentor profiles, pairing, sessions, cohorts |
| Career Growth | `career.rs` | Skill gaps, learning paths, milestones |
| Well-Being | `wellbeing.rs` | Check-ins, 7-day burnout signal computation |
| Carbon | `carbon.rs` | Carbon offset logging, cumulative footprint |

### Database Schema (migration 0014)

```
community_hubs       hub_members          hub_events          hub_rsvps
forum_threads        forum_posts
mentor_profiles      mentorship_pairs     mentorship_sessions
cohort_groups        cohort_members
career_milestones    skill_levels         learning_paths
wellbeing_checkins   burnout_signals
carbon_offsets
```

`wellbeing_checkins` stores `stress_score` and `mood_score` — classified as **health-adjacent
PII** under GDPR Article 9. Access is logged; right-to-erasure applies.

### Kafka Events (producer only — topic: `community-events`)

| Event | Trigger |
|---|---|
| `CarbonOffsetLogged` | `POST /carbon/:user_id/log` |
| `CareerMilestoneReached` | `POST /career/:user_id/milestones` |
| `LearningPathAssigned` | `POST /career/:user_id/paths` |
| `MentorshipPaired` | `POST /mentorship/request` (auto-match) |
| `CohortCreated` | `POST /cohorts` |
| `BurnoutAlertRaised` | Burnout recompute — risk ≥ 60 (high/critical) |

The service is a **pure Kafka producer** (no consumer). Burnout alerting via
`notification_service` subscribing to `BurnoutAlertRaised` is a future integration.

### Architectural Rationale

- **Bounded context isolation**: No cross-crate imports except `crates/common`.
  All domain types (`HostState`, `Db`, routes) are private to `community_service`.
- **No escrow dependency**: Community events do not gate financial flows.
  Bounded context communicates only via Kafka events.
- **GDPR compliance**: `wellbeing_checkins` treated as sensitive health data;
  pseudonymization path applies on right-to-erasure requests.

---

## Consequences

**Positive:**
- Clean boundary — product can evolve community features independently
- Burnout signals give platform ops early warning for talent retention risk
- Carbon tracking differentiates AiStaff in ESG-conscious enterprise sales
- 52 SQLx query cache entries committed — zero runtime DB introspection needed

**Negative:**
- New service to operate and monitor (port 3011, connection pool of 10)
- `wellbeing_checkins` is health-adjacent PII — requires GDPR Article 9 controls
- 0 integration tests — testcontainers suite must be added before public launch

**Neutral:**
- Kafka topic `community-events` is append-only; no consumers yet
- Port 3011 not in original CLAUDE.md service map — update required

---

## Alternatives Rejected

| Alternative | Reason Rejected |
|---|---|
| Extend `marketplace_service` | Violates single-responsibility; community is not a marketplace concern |
| GraphQL federation | Premature complexity; REST is sufficient for v2 scope |
| Separate repos per module | Monorepo discipline is a stated platform principle |
| Store health data in `unified_profiles` | `unified_profiles` is identity-scoped; health data has different retention/erasure requirements |
