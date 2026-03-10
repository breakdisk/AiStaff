# ADR-0005: Upgrade wasmtime 30 → 42

**Date:** 2026-03-10
**Status:** Accepted
**Deciders:** Platform Security, Deployment Engine team

---

## Context

`cargo audit` flagged 5 security advisories against `wasmtime = "30"`:

| Advisory | Severity | Title |
|---|---|---|
| RUSTSEC-2025-0046 | MEDIUM | Memory safety issue in wasmtime sandboxed execution |
| RUSTSEC-2025-0118 | MEDIUM | Wasmtime miscompilation under specific conditions |
| RUSTSEC-2026-0006 | LOW | Potential information disclosure via timing side-channel |
| RUSTSEC-2026-0020 | LOW | Cranelift codegen edge case |
| RUSTSEC-2026-0021 | LOW | Host function boundary validation |

All 5 are resolved in wasmtime ≥ 40. Latest stable at time of decision: **42.0.1** (2026-02-25).

wasmtime is used exclusively in `crates/deployment_engine/src/sandbox.rs` to provide
the Wasm execution sandbox for third-party AI agent plugins. A vulnerability here could
allow an agent to escape its sandbox, leak credentials, or exhaust host resources.

---

## Decision

Upgrade `wasmtime = "30"` → `wasmtime = "42"` in `Cargo.toml`.

Only `crates/deployment_engine` depends on wasmtime. No other crates are affected.

### API Compatibility Analysis

All wasmtime APIs used in `sandbox.rs` have stable signatures through v42:

| API | Changed? | Notes |
|---|---|---|
| `Config::async_support` / `consume_fuel` | No | Identical |
| `Engine::new`, `Module::new` | No | Identical |
| `Store::new`, `set_fuel`, `limiter` | No | Identical |
| `Linker::func_wrap_async` | No | Identical |
| `Memory::data`, `data_mut` | No | Identical |
| `Linker::instantiate_async` | No | Identical |
| `ResourceLimiter` trait | No | `usize` params unchanged |
| `Store<T: 'static>` (v34 change) | Yes | **Not a blocker** — all `HostState` fields are `'static` |

`HostState` satisfies `T: 'static` without modification:
- `Arc<HashMap<String, String>>` — `'static` ✓
- `SandboxResourceLimiter` (empty struct) — `'static` ✓
- `Option<Arc<McpProxy>>` — `'static` ✓
- `sqlx::PgPool` (Arc-backed) — `'static` ✓
- `Uuid`, `Arc<AtomicU64>` — `'static` ✓

**No source code changes required** — version bump only.

---

## Consequences

**Positive:**
- Eliminates all 5 RUSTSEC advisories; `cargo audit` returns clean
- 12 major releases of security patches, bug fixes, and Cranelift improvements
- Compiler optimisations in v35-v42 may improve agent execution throughput

**Negative:**
- `Cargo.lock` updated — Docker build cache invalidated for `deployment_engine`
- Minor risk of undocumented API behaviour changes (mitigated: no API changes detected)

**Neutral:**
- MSRV increases from ~1.82 (v30) to ~1.88 (v42); current toolchain is 1.94 — no impact

---

## Alternatives Rejected

| Alternative | Reason Rejected |
|---|---|
| Stay on wasmtime 30 | Leaves 5 known security advisories open; violates CLAUDE.md audit gate (must block on HIGH/CRITICAL; MEDIUM advisories accumulate risk) |
| Upgrade to wasmtime 40 only | 42.0.1 is latest stable; no reason to stop short — gets all patches |
| Pin to a specific patch version (e.g. "=42.0.1") | Overly restrictive; semver range `"42"` allows patch-level security fixes automatically |
