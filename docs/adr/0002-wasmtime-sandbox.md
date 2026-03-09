# ADR 0002 — Wasmtime for Third-Party Plugin Sandboxing

**Date:** 2026-03-09
**Status:** Accepted

---

## Context

The AI Agent marketplace allows third-party agents to execute arbitrary logic.
This creates a significant security surface — a malicious or buggy agent could
access host filesystem, leak credentials, or exhaust system resources.

---

## Decision

All third-party AI tools and agent plugins execute inside Wasmtime 30 sandboxes:

- Each module runs in its own `Store<HostState>` (isolated linear memory).
- `ResourceLimiter` caps memory (64 MB) and table size.
- Credentials are injected via `linker.func_wrap_async` host functions only.
- Plugins must be SHA-256 signed against a registry manifest before load.
- Every tool call is logged to `tool_call_audit` (append-only).

---

## Consequences

**Positive:**
- Total memory isolation between plugins.
- No host filesystem or network access unless explicitly granted via capability manifest.
- Credential injection is explicit and auditable.

**Negative:**
- Wasm compilation adds latency on first load (mitigated by module caching).
- Plugin authors must compile to `wasm32-unknown-unknown` or `wasm32-wasi`.
- Wasmtime API changes between major versions (v30 API used throughout).

---

## Alternatives Rejected

| Alternative | Reason Rejected |
|---|---|
| Docker containers per plugin | Too heavy for per-request execution; slow cold start |
| V8 Isolates | JS-only; not suitable for Rust/compiled plugins |
| Process isolation (fork) | No memory cap; credential leakage risk via env vars |
| No sandboxing | Unacceptable security risk for marketplace model |
