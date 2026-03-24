# Runbook: environment_orchestrator (Internal Worker)

## Service Overview
Performs pre-flight environment checks when a `DeploymentStarted` event is received from Kafka.
Validates that all required environment conditions (secrets present, Wasm plugin reachable,
downstream service connectivity) are met before deployment_engine proceeds. Emits
`EnvironmentReady` or `EnvironmentFailed` back to Kafka. No HTTP port — Kafka-driven only.
Owns no database tables; all state is transient or written to the `deployments` table via events.

## Health Check
No HTTP endpoint. Verify via Kafka consumer lag and Docker container status.
```bash
docker compose ps environment-orchestrator
# Expected: "Up" with no restart loop

kafka-consumer-groups.sh --bootstrap-server localhost:9092 \
  --group environment-orchestrator-deployments-group --describe
# Expected: LAG = 0 or low (< 5)
```

## Key Environment Variables
- `KAFKA_BROKERS` — Kafka broker list
- `WASM_PLUGIN_DIR` — Path checked for plugin presence during pre-flight
- `DATABASE_URL` — Postgres connection (reads deployments; writes status transitions)
- `JWT_PUBLIC_KEY` — RS256 key for verifying internal service tokens
- `RUST_LOG` — Tracing filter (e.g. `info`)

## Common Issues

### EnvironmentReady Not Emitted After DeploymentStarted
```
Symptom: deployment_engine never proceeds; no EnvironmentReady on Kafka
Check:   docker compose logs -f environment-orchestrator | grep -E "DeploymentStarted|EnvironmentReady|EnvironmentFailed"
         kafka-consumer-groups.sh --group environment-orchestrator-deployments-group --describe
Fix:     If consumer lag = 0 and no log output, the container is not consuming.
         Restart service. If EnvironmentFailed is emitted, read the failure reason in the event payload.
```

### Pre-Flight Fails: Missing Wasm Plugin
```
Symptom: EnvironmentFailed with reason "wasm plugin not found: <module_id>"
Check:   ls $WASM_PLUGIN_DIR — confirm .wasm file for the deployment's module_id is present
Fix:     Upload signed Wasm module to WASM_PLUGIN_DIR and verify hash against registry manifest.
         Deployment will not proceed until EnvironmentReady is emitted.
```

### Pre-Flight Fails: Downstream Service Unreachable
```
Symptom: EnvironmentFailed with reason "service connectivity check failed: <service>"
Check:   docker compose ps — confirm target service container is Up
         Check inter-container DNS: docker compose exec environment-orchestrator \
           curl http://<service-name>:<port>/health
Fix:     Restart the unreachable service; confirm Docker network configuration.
         All service connectivity probes use a 5s timeout — transient network blips will fail fast.
```

### Consumer Group Offset Reset After Restart
```
Symptom: After restart, orchestrator re-processes old DeploymentStarted events, emitting duplicate checks
Check:   kafka-consumer-groups.sh --group environment-orchestrator-deployments-group --describe
         Confirm CURRENT-OFFSET matches LOG-END-OFFSET before restart
Fix:     Manual offset commit is used — offsets are committed only after successful DB write.
         Duplicate EnvironmentReady events are idempotent if downstream services check
         deployment status before acting. No corrective action needed for already-completed deployments.
```

### High Kafka Consumer Lag
```
Symptom: LAG > 100 on environment-orchestrator-deployments-group
Check:   docker compose logs -f environment-orchestrator | tail -50 — look for slow pre-flight checks
Fix:     Pre-flight checks have a 5s timeout per external probe. If checks are slow, confirm
         WASM_PLUGIN_DIR is on a fast local mount (not a remote NFS share).
         Scale by running a second container with the same consumer group if throughput is the issue.
```

## Restart Procedure
```bash
docker compose restart environment-orchestrator
docker compose logs -f environment-orchestrator
# Verify: "environment_orchestrator consumer started, group=environment-orchestrator-deployments-group"
```

## Database Tables
None owned. Reads `deployments` table for context; status transitions written by emitting events
consumed by `marketplace_service`.
