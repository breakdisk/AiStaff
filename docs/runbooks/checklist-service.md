# Runbook: checklist_service (Port 3003)

## Service Overview
Manages Definition-of-Done (DoD) step gates for deployments. Each gate must be marked complete
before the deployment can proceed to escrow release. Emits `ChecklistFinalized` to Kafka when
all steps are complete; this event gates escrow release in `payout_service`.
Listens for `DeploymentStarted` to create the initial checklist for a deployment.

## Health Check
```bash
curl http://localhost:3003/health
# Expected: { "status": "ok" }
```

## Key Environment Variables
- `DATABASE_URL` — Postgres connection
- `KAFKA_BROKERS` — Kafka broker list
- `JWT_PUBLIC_KEY` — RS256 key for verifying inbound JWTs
- `RUST_LOG` — Tracing filter (e.g. `info,sqlx=warn`)

## Common Issues

### Checklist Not Created After Deployment
```
Symptom: dod_checklist_steps has no rows for a deployment_id that exists in deployments
Check:   docker compose logs -f checklist-service | grep "DeploymentStarted"
         kafka-consumer-groups.sh --group checklist-service-deployments-group --describe
Fix:     If consumer lag is high, checklist-service is behind on the deployments topic.
         Restart the service; it will resume from last committed offset.
         Confirm KAFKA_BROKERS is reachable.
```

### ChecklistFinalized Not Emitted After All Steps Complete
```
Symptom: All dod_checklist_steps for a deployment_id have completed = true but escrow is not released
Check:   SELECT COUNT(*) FROM dod_checklist_steps
           WHERE deployment_id = '<id>' AND completed = false
         docker compose logs -f checklist-service | grep "ChecklistFinalized"
Fix:     If count = 0 but event was not emitted, the finalization trigger has a bug.
         Manually re-check via PATCH /deployments/<id>/checklist/recheck (if available) or
         restart service to replay summary computation. Escalate if persists.
```

### Step Marked Complete by Wrong Actor
```
Symptom: A checklist step is marked complete by a user_id that is not the authorized party
Check:   SELECT completed_by, completed_at FROM dod_checklist_steps WHERE id = '<step_id>'
Fix:     Authorization check must verify JWT sub matches the step's authorized_actor_id.
         If incorrect data is present, treat as P1 audit gap — log in tool_call_audit and
         review the PATCH /steps/:id handler for missing identity assertion.
```

### Checklist Summary Stale
```
Symptom: dod_checklist_summaries shows completed_steps count not matching actual step rows
Check:   SELECT * FROM dod_checklist_summaries WHERE deployment_id = '<id>'
         Compare against: SELECT COUNT(*) FROM dod_checklist_steps WHERE deployment_id = '<id>'
           AND completed = true
Fix:     Summary is computed on write — if out of sync, a concurrent update race likely occurred.
         Recompute: UPDATE dod_checklist_summaries SET completed_steps = (subquery) WHERE ...
```

## Restart Procedure
```bash
docker compose restart checklist-service
docker compose logs -f checklist-service
# Verify: "checklist_service listening on 0.0.0.0:3003"
#         "checklist_service consumer started, group=checklist-service-deployments-group"
```

## Database Tables
- `dod_checklist_steps` — per-step gate; deployment_id FK, completed bool, completed_by, completed_at
- `dod_checklist_summaries` — aggregate per deployment; total_steps, completed_steps, finalized_at
