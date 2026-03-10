# Runbook: community_service (Port 3011)

## Service Overview

Provides community infrastructure for the AiStaff talent layer:
community hubs, forum threads, mentorship pairing, cohort management,
career milestones, well-being check-ins, and carbon offset tracking.

Emits events to Kafka topic `community-events`. Pure producer — no consumer.
Backed by migrations 0014 (`community_growth`) and 0015 (`multi_channel_notifications`).

## Health Check

```bash
curl http://localhost:3011/health
# Expected: { "status": "ok" }
```

## Key Environment Variables

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | Yes | Postgres connection string |
| `KAFKA_BROKERS` | No | Default: `localhost:9092` |
| `RUST_LOG` | No | Default: `info` |

No JWT, OAuth, or ZKP keys required — community_service trusts upstream auth.

## Endpoint Reference

### Community Hubs
| Method | Path | Description |
|---|---|---|
| `GET` | `/hubs` | List all hubs |
| `POST` | `/hubs` | Create hub |
| `GET` | `/hubs/:hub_id` | Get hub detail |
| `POST` | `/hubs/:hub_id/join` | Join hub |
| `DELETE` | `/hubs/:hub_id/leave` | Leave hub |
| `GET/POST` | `/hubs/:hub_id/events` | List/create hub events |
| `POST` | `/hubs/:hub_id/events/:eid/rsvp` | RSVP to event |
| `GET/POST` | `/hubs/:hub_id/threads` | List/create threads |
| `GET` | `/hubs/:hub_id/threads/:tid` | Get thread |
| `GET/POST` | `/hubs/:hub_id/threads/:tid/posts` | List/create posts |

### Mentorship
| Method | Path | Description |
|---|---|---|
| `GET/POST` | `/mentors` | List/upsert mentor profiles |
| `GET` | `/mentors/:mentor_id` | Get mentor |
| `POST` | `/mentorship/request` | Request mentor pairing |
| `GET` | `/mentorship/pairs` | List pairs |
| `GET` | `/mentorship/pairs/:pid` | Get pair |
| `GET/POST` | `/mentorship/pairs/:pid/sessions` | List/schedule sessions |
| `POST` | `/mentorship/pairs/:pid/sessions/:sid/complete` | Complete session |
| `GET/POST` | `/cohorts` | List/create cohorts |
| `POST` | `/cohorts/:cid/join` | Join cohort |

### Career Growth
| Method | Path | Description |
|---|---|---|
| `GET` | `/career/:user_id` | Career profile |
| `GET/POST` | `/career/:user_id/milestones` | List/award milestones |
| `GET` | `/career/:user_id/gaps` | Skill gap analysis |
| `GET/POST` | `/career/:user_id/paths` | List/assign learning paths |
| `PUT` | `/career/:user_id/paths/:path_id/progress` | Update path progress (0–100) |

### Well-Being
| Method | Path | Description |
|---|---|---|
| `POST` | `/wellbeing/:user_id/checkin` | Submit stress/mood scores |
| `GET` | `/wellbeing/:user_id/checkins` | List recent check-ins |
| `GET` | `/wellbeing/:user_id/burnout` | Get burnout signal (risk level + score) |

### Carbon
| Method | Path | Description |
|---|---|---|
| `POST` | `/carbon/:user_id/log` | Log carbon offset (kg CO₂) |
| `GET` | `/carbon/:user_id/footprint` | Get cumulative footprint |

## Kafka Events Emitted (topic: `community-events`)

| Event | Trigger | Severity |
|---|---|---|
| `CarbonOffsetLogged` | Carbon log POST | Info |
| `CareerMilestoneReached` | Milestone award POST | Info |
| `LearningPathAssigned` | Learning path assign POST | Info |
| `MentorshipPaired` | Auto-pair on mentorship request | Info |
| `CohortCreated` | Cohort create POST | Info |
| `BurnoutAlertRaised` | Burnout recompute — risk ≥ 60 (high/critical) | **Alert** |

Kafka emit failures are logged as warnings and are non-fatal (service continues).

## Database Tables

```
community_hubs          hub_members              hub_events
hub_rsvps               forum_threads            forum_posts
mentor_profiles         mentorship_pairs         mentorship_sessions
cohort_groups           cohort_members           career_milestones
skill_levels            learning_paths           wellbeing_checkins
burnout_signals         carbon_offsets
```

> **GDPR Note:** `wellbeing_checkins` (stress/mood scores) is health-adjacent PII
> (Article 9). Access is logged. Right-to-erasure requests must pseudonymize this
> table — **do not hard-delete** financial or audit records.

## Common Issues

### Service Fails to Start — DATABASE_URL Missing
```
Symptom: Process exits immediately with "DATABASE_URL not set"
Fix:     Ensure DATABASE_URL is set in environment or .env file
Check:   docker compose logs community-service
```

### Burnout Recompute Returns 500
```
Symptom: GET /wellbeing/:user_id/burnout returns 500
Cause:   No check-ins in the past 7 days (AVG returns NULL)
Fix:     Expected — request a check-in first via POST /wellbeing/:user_id/checkin
         The COALESCE in the query defaults to stress=0, mood=5
```

### Kafka Events Silently Dropped
```
Symptom: No events visible in community-events topic
Check:   KAFKA_BROKERS env var points to correct broker
         docker compose logs community-service | grep "kafka"
Fix:     Restart kafka, then community-service
         Note: Kafka failures are non-fatal — service stays up
```

### Learning Path Progress Update Fails with 400
```
Symptom: PUT /career/:user_id/paths/:path_id/progress returns 400
Cause:   progress_pct not in range 0-100, or invalid path_id
Fix:     Clamp value to 0-100 before sending
```

### Mentorship Auto-Pair Returns No Match
```
Symptom: POST /mentorship/request returns 200 but pair not created
Cause:   No mentor with overlapping skill_tags found
Check:   Ensure mentor profiles exist: GET /mentors
Fix:     Upsert mentor profile via POST /mentors with matching skills
```

## Restart Procedure

```bash
docker compose restart community-service
docker compose logs -f community-service
# Expected: "community_service listening on 0.0.0.0:3011"
```

## Scaling Notes

- Connection pool: max 10 Postgres connections (configured in `main.rs`)
- Kafka: one producer per request (fire-and-forget, non-blocking)
- No in-memory state — safe to run multiple replicas

## Incident Classification

| Condition | Severity |
|---|---|
| `BurnoutAlertRaised` for multiple users in 1 hour | P2 — notify ops |
| Service down (health check failing) | P2 |
| Database connection exhausted | P1 — check Postgres pool |
| wellbeing_checkins data accessed without auth | P0 — GDPR breach |
