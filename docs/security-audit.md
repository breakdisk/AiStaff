# Security Audit Specification

## ZKP Biometric Specification

### Circuit: Groth16 over BN254

**Library versions:**
```toml
ark-groth16   = { version = "0.4", default-features = false, features = ["r1cs"] }
ark-bn254     = { version = "0.4", default-features = false, features = ["curve"] }
ark-serialize = "0.4"
blake3        = "1.5"
```

**Commitment scheme:**
```
stored_commitment = Blake3(nonce || groth16_proof_bytes)
```

- `nonce` is a 32-byte random value, single-use. Invalidated immediately post-submission.
- `groth16_proof_bytes` is the serialized Groth16 proof (ark-serialize).
- Only `stored_commitment` persists in `unified_profiles.biometric_commitment`.
- Raw biometric template is **never** stored, logged, or transmitted.

**Verification flow:**
1. Client submits: `{ proof: bytes, public_inputs: [...], nonce: bytes }`
2. `identity_service` verifies: `ark_groth16::verify_proof(vk, proof, public_inputs)`
3. On success: compute `Blake3(nonce || proof)` → store commitment
4. Invalidate nonce in DB
5. Emit `IdentityVerified { tier: BiometricVerified }` Kafka event

**Error handling:**
- `SynthesisError` and `SerializationError`: wrapped with `.map_err(|e| anyhow!("zkp: {e}"))`.
  Never bubble raw arkworks errors to API responses.

---

## Wasm Sandbox Specification

**Runtime:** Wasmtime 30 (`features = ["async", "cranelift"]`)

**Isolation guarantees:**
- Each Wasm module runs in its own `Store<HostState>` — no shared linear memory.
- `ResourceLimiter` enforces memory cap (default: 64 MB) and table size.
  Params are `usize` (not `u32` — changed in wasmtime 30 API).
- `Store::limiter` reference: `|state| &mut state.limiter`.

**Credential injection:**
- Credentials passed to Wasm via `linker.func_wrap_async` host functions only.
- Never via environment variables or command-line arguments.
- Host functions are whitelisted per `capability_manifest` in `mcp_server`.

**Plugin signing:**
- All `.wasm` plugin files must be SHA-256 signed against a registry manifest.
- `deployment_engine` verifies hash before module instantiation.
- Unsigned plugins are rejected with `Err(PluginVerificationFailed)`.

**MCP audit:**
- Every tool call logged to `tool_call_audit` (append-only, no UPDATE/DELETE grants).
- Schema: `(id UUID, agent_id UUID, tool_name TEXT, input_hash TEXT, output_hash TEXT, called_at TIMESTAMPTZ)`

---

## Threat Model

### Trust Boundaries

| Boundary | Trust Level | Mitigation |
|---|---|---|
| External HTTP clients | Untrusted | JWT RS256 + rate limiting + input validation |
| Service-to-service | Low trust | Short-lived internal JWTs (5-min TTL) |
| Wasm plugins | Untrusted | Wasmtime sandbox + hash verification + capability allowlist |
| MCP server | Local only | Bound to 127.0.0.1:4040, all calls audited |
| Kafka messages | Internal trusted | EventEnvelope schema validation on consume |
| DB | Trusted | Parameterized queries only, connection pool scoped per service |

### STRIDE Analysis

| Threat | Mitigation |
|---|---|
| **S**poofing | RS256 JWT on all endpoints; ZKP for biometric identity |
| **T**ampering | Append-only audit tables; SHA-256 doc hashing; Wasm plugin signing |
| **R**epudiation | `tool_call_audit`, `escrow_payouts` immutable logs; event_id on all events |
| **I**nformation Disclosure | Blake3 commitment only (no raw biometrics); TLS 1.3+; no PII in logs |
| **D**enial of Service | Rate limiting at gateway; Wasm ResourceLimiter; Kafka consumer lag alerts |
| **E**levation of Privilege | Zero-trust service JWTs; Wasm capability manifest; MCP localhost-only |

---

## Financial Security Controls

| Control | Implementation |
|---|---|
| Double-spend prevention | `transaction_id UUID v7 UNIQUE` in `escrow_payouts` |
| Veto window | 30-second server-side timer in `payout_service` (server clock) |
| Escrow gate | ChecklistFinalized + IdentityVerified (Tier ≥ 1) + VetoWindowElapsed |
| Money representation | `BIGINT` cents only — no FLOAT, no DECIMAL |
| Rounding | Always truncate — never round up |
| Audit trail | `EscrowRelease` event in append-only `escrow_payouts` |

---

## Dependency Security Policy

```
cargo audit    # Run before every release. Block on HIGH/CRITICAL.
cargo deny     # Configured in deny.toml — blocks unwanted licenses + known CVEs.
```

- Rotate DB credentials every 30 days.
- Rotate JWT signing keys quarterly.
- All secrets in environment variables only. `.env` never committed.
- All secret names (not values) registered in `docs/secret-registry.md`.

---

## Penetration Testing

Results stored in `docs/pentest/`. Required before any public launch.
Schedule: annually + after any major auth or payment flow change.
