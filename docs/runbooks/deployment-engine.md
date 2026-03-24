# Runbook: deployment_engine (Internal Worker)

## Service Overview
Executes AI agent plugins inside a Wasmtime sandbox. Listens for `DeploymentStarted` events
from Kafka, loads the target Wasm module, injects credentials via host functions, and fires
a `SuccessTrigger` event on clean exit. All Wasm plugins are hash-verified against the
registry manifest before loading. No HTTP port — Kafka-driven only.

## Health Check
No HTTP endpoint. Verify via Kafka consumer lag and Docker container status.
```bash
docker compose ps deployment-engine
# Expected: "Up" with no restart loop

# Check consumer lag on the deployments topic:
kafka-consumer-groups.sh --bootstrap-server localhost:9092 \
  --group deployment-engine-deployments-group --describe
# Expected: LAG = 0 or low (< 5)
```

## Key Environment Variables
- `DATABASE_URL` — Postgres connection (reads deployments table)
- `KAFKA_BROKERS` — Kafka broker list
- `WASM_PLUGIN_DIR` — Absolute path to signed Wasm plugin directory
- `JWT_PUBLIC_KEY` — RS256 key for verifying internal service JWTs
- `RUST_LOG` — Tracing filter (e.g. `info,wasmtime=warn`)

## Common Issues

### Wasm Module Load Failure
```
Symptom: Logs show "wasm: hash verification failed" or "plugin not found"
Check:   ls $WASM_PLUGIN_DIR — confirm .wasm file present and registry manifest hash matches
Fix:     Re-deploy signed Wasm module; regenerate manifest hash; never load unsigned plugins
```

### Deployment Stuck in VETO_WINDOW
```
Symptom: deployment_engine receives event but takes no action; deployment never progresses
Check:   SELECT status FROM deployments WHERE id = '<id>' — if VETO_WINDOW, engine waits correctly
Fix:     Not a bug — engine only proceeds after veto window elapses (payout_service responsibility).
         If stuck beyond 30s, check payout_service logs for veto timer expiry event.
```

### SuccessTrigger Not Emitted After Clean Run
```
Symptom: Wasm module exits 0 but no SuccessTrigger event appears in Kafka
Check:   docker compose logs -f deployment-engine | grep "SuccessTrigger"
Fix:     Check KAFKA_BROKERS connectivity; verify producer flush is not timing out (default 5s limit)
```

### ResourceLimiter / Memory Fault
```
Symptom: Logs show "wasm: memory limit exceeded" or process OOMs
Check:   Wasm module memory configuration; ResourceLimiter::table_growing usize bounds
Fix:     Reduce module memory ceiling in plugin manifest; confirm ResourceLimiter references
         |state| &mut state.limiter (not a detached limiter instance)
```

### Kafka Consumer Not Starting
```
Symptom: deployment-engine container starts but emits no log lines about consuming events
Check:   KAFKA_BROKERS env var; confirm topic "deployments" exists
         kafka-topics.sh --bootstrap-server localhost:9092 --list
Fix:     Recreate topic if missing; restart container after broker is confirmed reachable
```

## Restart Procedure
```bash
docker compose restart deployment-engine
docker compose logs -f deployment-engine
# Verify: "deployment_engine consumer started, group=deployment-engine-deployments-group"
```

## Database Tables
- `deployments` — read-only; engine reads status and wasm_module_hash before execution
