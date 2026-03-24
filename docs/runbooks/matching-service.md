# Runbook: matching_service (Port 3005)

## Service Overview
Computes skill-match scores between talent profiles and agent listings using Jaccard similarity
over skill tags and embedding-based cosine similarity. Emits `MatchResultReady` events to Kafka.
Consumes `AgentListingPublished` and `TalentProfileUpdated` events to trigger match requests.

## Health Check
```bash
curl http://localhost:3005/health
# Expected: { "status": "ok" }
```

## Key Environment Variables
- `DATABASE_URL` — Postgres connection
- `KAFKA_BROKERS` — Kafka broker list
- `JWT_PUBLIC_KEY` — RS256 public key for inbound JWT validation
- `RUST_LOG` — Tracing filter (e.g. `info,sqlx=warn`)
- `EMBEDDING_MODEL_PATH` — Absolute path to local embedding model (GGUF/ONNX)
- `QDRANT_URL` — Local Qdrant instance for embedding vector storage (e.g. `http://localhost:6333`)

## Common Issues

### Match Scores Always 0.0
```
Symptom: match_results rows have jaccard_score: 0.0 and embedding_score: 0.0
Check:   SELECT COUNT(*) FROM talent_skills WHERE talent_id = '<id>';
         SELECT COUNT(*) FROM agent_required_skills WHERE agent_id = '<id>';
Fix:     Talent or agent has no associated skill tags. Re-POST skill associations
         via marketplace_service. Verify skill_tags table is populated.
```

### Match Requests Stuck in PENDING
```
Symptom: match_requests rows remain status='PENDING' indefinitely
Check:   docker compose logs -f matching-service | grep "consumer"
         SELECT * FROM match_requests WHERE status = 'PENDING' ORDER BY created_at LIMIT 10;
Fix:     Kafka consumer lag on matching-service-match-requests-group. Restart service.
         If persists, check KAFKA_BROKERS connectivity from container.
```

### Embedding Model Load Failure
```
Symptom: Service exits at startup with "failed to load embedding model"
Check:   EMBEDDING_MODEL_PATH env var points to a readable file inside the container
Fix:     Mount model file into container via docker-compose volume. Confirm path matches env var.
         Verify model file checksum against registry manifest.
```

### Qdrant Connection Refused
```
Symptom: Logs show "qdrant: connection refused" on match computation
Check:   curl http://localhost:6333/healthz from within the container network
Fix:     Ensure qdrant service is running: docker compose up -d qdrant
         Verify QDRANT_URL is reachable from the matching-service container.
```

## Restart Procedure
```bash
docker compose restart matching-service
docker compose logs -f matching-service
# Verify: "matching_service listening on 0.0.0.0:3005"
```

## Database Tables
- `skill_tags` — canonical skill vocabulary; `id`, `name`, `category`
- `talent_skills` — many-to-many: `talent_id`, `skill_tag_id`, `proficiency_level`
- `agent_required_skills` — many-to-many: `agent_id`, `skill_tag_id`, `required_level`
- `match_requests` — `id` (UUID v7), `talent_id`, `agent_id`, `status`, `requested_at`
- `match_results` — `id`, `match_request_id`, `jaccard_score`, `embedding_score`, `composite_score`, `computed_at`
