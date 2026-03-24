# Runbook: mcp_server (Port 4040)

## Service Overview
Exposes a JSON-RPC 2.0 interface over MCP (Model Context Protocol) for AI agents and internal
tooling to query live marketplace data programmatically. Binds to `127.0.0.1:4040` only —
never `0.0.0.0`. Every tool call is appended to `tool_call_audit` (append-only; no DELETE/UPDATE
grants on that table). Used by AI agents and the frontend dashboard for structured data access.

## Health Check
```bash
curl http://127.0.0.1:4040/health
# Expected: { "status": "ok" }
# Note: only reachable from localhost — not externally accessible
```

## Key Environment Variables
- `DATABASE_URL` — Postgres connection
- `JWT_PUBLIC_KEY` — RS256 key; all MCP requests carry an internal JWT
- `MCP_FS_ROOT` — Filesystem root for any file-access tools
- `RUST_LOG` — Tracing filter (e.g. `info`)

## Common Issues

### MCP Server Binding on 0.0.0.0 (Critical)
```
Symptom: Logs show "listening on 0.0.0.0:4040" instead of "127.0.0.1:4040"
Check:   Inspect bind address in startup config / environment
Fix:     Correct bind address to 127.0.0.1 immediately and redeploy — P0 security incident
         if externally reachable; follow incident-response.md
```

### Tool Call Not Written to Audit Table
```
Symptom: Tool executed but no row in tool_call_audit for that call
Check:   SELECT COUNT(*) FROM tool_call_audit WHERE called_at > NOW() - INTERVAL '5 minutes'
Fix:     Confirm DB write is not rolling back; check RUST_LOG for sqlx errors on insert.
         audit insert failure must be treated as a P1 — do not silently discard.
```

### JSON-RPC Returns -32601 (Method Not Found)
```
Symptom: Agent receives {"error": {"code": -32601, "message": "Method not found"}}
Check:   Confirm tool name matches registered handler (case-sensitive); check mcp_server startup
         logs for registered tool list
Fix:     Correct tool name in client call; redeploy mcp_server if handler is missing
```

### JWT Validation Rejecting Internal Calls
```
Symptom: All MCP requests return 401 "invalid token"
Check:   JWT_PUBLIC_KEY matches the private key used by the calling service to sign internal JWTs.
         Confirm token TTL has not expired (internal JWTs: 5-minute TTL).
Fix:     Rotate JWT_PUBLIC_KEY / JWT_PRIVATE_KEY pair across all services simultaneously;
         update secret registry
```

### tool_call_audit Table Growing Unbounded
```
Symptom: Disk usage alert; tool_call_audit has millions of rows
Check:   SELECT COUNT(*), MIN(called_at) FROM tool_call_audit
Fix:     Archive rows older than 90 days to cold storage per GDPR telemetry policy.
         Do NOT DELETE — table is append-only by grant design.
         Use INSERT INTO tool_call_audit_archive ... SELECT ... approach.
```

## Restart Procedure
```bash
docker compose restart mcp-server
docker compose logs -f mcp-server
# Verify: "mcp_server listening on 127.0.0.1:4040"
```

## Database Tables
- `tool_call_audit` — append-only; id, agent_id, tool_name, input_hash, output_hash, called_at
