# API Specification (OpenAPI 3.1 Reference)

> All endpoints require `Authorization: Bearer <jwt>` unless marked public.
> All request/response bodies are `application/json`.
> Money values are `integer` (cents). Timestamps are ISO 8601 UTC.

---

## identity_service — :3001

### POST /auth/stitch
Initiate OAuth identity stitching (GitHub or LinkedIn).

**Request:**
```json
{ "provider": "github | linkedin", "code": "string", "redirect_uri": "string" }
```
**Response 200:**
```json
{ "profile_id": "uuid", "identity_tier": 0 | 1, "trust_score": 0.0–1.0 }
```

### POST /auth/biometric
Submit ZKP biometric proof for Tier 2 upgrade.

**Request:**
```json
{ "proof": "base64", "public_inputs": ["string"], "nonce": "base64" }
```
**Response 200:**
```json
{ "identity_tier": 2, "trust_score": 1.0, "commitment": "blake3hex" }
```
**Response 409:** Nonce already used.

### GET /profiles/:id
**Response 200:**
```json
{
  "id": "uuid", "identity_tier": 0|1|2, "trust_score": 0.0–1.0,
  "github_score": 0.0–0.3, "linkedin_score": 0.0–0.3, "biometric_score": 0.0–0.4
}
```

---

## marketplace_service — :3002

### POST /deployments
Create a deployment and emit `DeploymentStarted` to Kafka.

**Request:**
```json
{
  "agent_listing_id": "uuid",
  "freelancer_id": "uuid",
  "total_cents": 100000,
  "transaction_id": "uuid-v7"
}
```
**Response 201:**
```json
{ "deployment_id": "uuid", "status": "PENDING" }
```
**Response 409:** Duplicate `transaction_id`.

### GET /deployments/:id
**Response 200:**
```json
{
  "id": "uuid", "status": "PENDING|ENVIRONMENT_CHECKING|BIOMETRIC_PENDING|VETO_WINDOW|EXECUTING|COMPLETED|VETOED|FAILED",
  "agent_listing_id": "uuid", "freelancer_id": "uuid",
  "total_cents": 100000, "created_at": "iso8601"
}
```

---

## payout_service — :3010

### POST /payouts/:id/veto
Veto a payout during the 30-second veto window.

**Response 200:** `{ "status": "VETOED" }`
**Response 409:** Veto window already elapsed.
**Response 404:** Payout not found.

### POST /payouts/:id/approve
Manually approve (used by automated pipeline after veto window elapses).

**Response 200:**
```json
{ "status": "RELEASED", "dev_cents": 70000, "talent_cents": 30000 }
```

---

## checklist_service — :3003

### GET /checklist/:deployment_id
Returns all 6 DoD steps and their completion status.

**Response 200:**
```json
{
  "deployment_id": "uuid",
  "steps": [
    { "step_id": "uuid", "name": "string", "required": true, "completed": false }
  ],
  "all_required_complete": false
}
```

### POST /checklist/:deployment_id/steps/:step_id/complete
Mark a DoD step complete. Emits `ChecklistFinalized` if all 6 required steps done.

**Response 200:** `{ "step_id": "uuid", "completed": true, "checklist_finalized": false|true }`

---

## license_service — :3004

### POST /licenses
Issue a license. Idempotent via `transaction_id`.

**Request:**
```json
{
  "licensee_id": "uuid", "agent_id": "uuid",
  "jurisdiction": "US", "transaction_id": "uuid-v7"
}
```
**Response 201:** `{ "license_id": "uuid", "key": "string", "expires_at": "iso8601" }`
**Response 409:** Duplicate `transaction_id`.

### GET /licenses/:id
**Response 200:** `{ "id": "uuid", "key": "string", "jurisdiction": "US", "status": "ACTIVE|REVOKED" }`

---

## matching_service — :3005

### POST /match-requests
**Request:** `{ "talent_id": "uuid", "agent_id": "uuid" }`
**Response 202:** `{ "match_request_id": "uuid" }`

### GET /match-results/:match_request_id
**Response 200:**
```json
{ "match_score": 0.0–1.0, "matched_skills": ["string"], "missing_skills": ["string"] }
```

---

## compliance_service — :3006

### GET /warranty-claims?deployment_id=:uuid
**Response 200:** `{ "claims": [{ "id": "uuid", "drift_proof": "string", "resolution": "null|REMEDIATED|REFUNDED|REJECTED" }] }`

### POST /warranty-claims/:id/resolve
**Request:** `{ "resolution": "REMEDIATED|REFUNDED|REJECTED" }`
**Response 200:** `{ "id": "uuid", "resolution": "REMEDIATED" }`

### POST /contracts
**Request:** `{ "parties": ["uuid"], "doc_base64": "string", "contract_type": "NDA|SOW" }`
**Response 201:** `{ "contract_id": "uuid", "doc_hash": "sha256hex" }`

---

## telemetry_service — :3007

### POST /heartbeats
**Request:** `{ "deployment_id": "uuid", "artifact_hash": "sha256hex", "timestamp": "iso8601" }`
**Response 204**

### GET /drift-events?deployment_id=:uuid
**Response 200:** `{ "events": [{ "id": "uuid", "expected_hash": "string", "actual_hash": "string", "detected_at": "iso8601" }] }`

---

## analytics_service — :3008

### GET /roi?talent_id=:uuid
**Response 200:** `{ "talent_id": "uuid", "total_deployments": 12, "success_rate": 0.91, "avg_payout_cents": 85000 }`

### GET /leaderboard
**Response 200:** `{ "entries": [{ "rank": 1, "talent_id": "uuid", "trust_score": 0.97, "success_rate": 0.98 }] }`

---

## reputation_service — :3009

### GET /reputation/:talent_id
**Response 200:** `{ "talent_id": "uuid", "vc_issued": true, "vc_issued_at": "iso8601" }`

### POST /reputation/:talent_id/export-vc
Returns a W3C Verifiable Credential (JSON-LD).

**Response 200:**
```json
{
  "@context": ["https://www.w3.org/2018/credentials/v1"],
  "type": ["VerifiableCredential"],
  "issuer": "did:aistaff:platform",
  "credentialSubject": { "id": "did:aistaff:talent:<uuid>", "trustScore": 0.97 }
}
```

---

## mcp_server — :4040 (localhost only)

### POST /rpc (JSON-RPC 2.0)
```json
{ "jsonrpc": "2.0", "id": 1, "method": "tool/call", "params": { "tool": "db.query", "input": {} } }
```
All tool calls logged to `tool_call_audit`. Capability manifest enforced per agent.

---

## Error Envelope

All errors follow:
```json
{ "error": { "code": "CONFLICT|NOT_FOUND|UNAUTHORIZED|BAD_REQUEST|INTERNAL", "message": "string" } }
```

HTTP status codes: 200 · 201 · 202 · 204 · 400 · 401 · 403 · 404 · 409 · 500
