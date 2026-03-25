# CLAUDE.md — AI Native Marketplace Platform
> Applies to: AiTalent Freelancer Marketplace · AI Agent Marketplace · AIRobot Rental Marketplace
> Stack: Rust 1.94 · Next.js 15 · React 19 · Tailwind 4 · SQLx · Axum · Wasmtime · rdkafka

---

## 0. PRIME DIRECTIVES (ALL ROLES — NON-NEGOTIABLE)

These rules override every other instruction. No exceptions.

- **No AI Slop**: No generic boilerplate, no filler comments, no `unwrap()` in production paths.
- **No Raw Templates**: Never store biometric data. Only `Blake3(nonce || proof)` commitments.
- **Idempotency is Law**: Every financial transaction carries a `transaction_id UUID v7`. Double-spend = bug, not edge case.
- **Veto Window**: Every deployment release MUST pass a 30-second human-in-the-loop veto buffer before execution.
- **Thin UI Layer**: Zero business logic in the frontend. All logic lives in `src-rust/`.
- **Offline-First AI**: No cloud-hosted vector DBs. Use `sqlite-vss` or local Qdrant only.
- **Wasm Sandbox**: All third-party AI tools and agent plugins run inside Wasmtime. No exceptions.
- **ZKP Identity**: All biometric verification uses Zero-Knowledge Proofs (ZKP). Never transmit raw templates.
- **Plan Mode First**: Always invoke Plan Mode (`Shift+Tab`) before executing structural changes.
- **Test Immediately**: Run the relevant test suite after every logic change before moving on.

---

## 1. ROLE: SENIOR PRINCIPAL ARCHITECT

### Mission
Design a composable, event-driven monorepo where each marketplace (AiTalent, AI Agent, AIRobot)
operates as an independent bounded context while sharing a unified identity, compliance, and escrow backbone.

### Architecture Principles
- **Bounded Contexts**: Each marketplace (`aiTalent/`, `aiAgent/`, `aiRobot/`) is an isolated domain.
  Cross-cutting concerns (auth, billing, audit) live in `crates/shared/`.
- **Event Sourcing**: State mutations MUST emit Kafka events wrapped in `EventEnvelope<T>`.
  Never mutate shared state directly across crates.
- **CQRS**: Separate read models (GET projections) from write models (command handlers). No fat endpoints.
- **Hexagonal Architecture**: All external I/O (Kafka, DB, SMTP, Wasm) behind trait interfaces.
  Business logic is pure Rust, no I/O.
- **Idempotency at Every Layer**: Commands carry `command_id`. Events carry `event_id`. Both are `UUID v7`
  (time-ordered, monotonic).
- **Zero-Trust Networking**: Services communicate via internal JWT (short-lived, 5min TTL).
  No service has ambient authority.
- **Feature Flags via DB**: Runtime toggles stored in `feature_flags` table.
  No compile-time feature gating for business logic.

### Crate Layout
```
crates/
  shared/                    # Types, errors, EventEnvelope, Kafka client, ZKP primitives
  identity_service/          # OAuth, ZK biometric, trust_score, tier management        :3001
  marketplace_service/       # Agent + talent listings, POST /deployments               :3002
  deployment_engine/         # Wasmtime sandbox + SuccessTrigger
  payout_service/            # Veto-First 30s window, 70/30 split, settlement           :3010
  mcp_server/                # MCP JSON-RPC, localhost-only, tool_call_audit            :4040
  license_service/           # License issuance, jurisdiction lock, idempotency         :3004
  checklist_service/         # DoD step gates, gates escrow via ChecklistFinalized      :3003
  environment_orchestrator/  # Pre-flight env checks on DeploymentStarted
  matching_service/          # Jaccard + embedding skill match, talent<>agent           :3005
  notification_service/      # Kafka fanout → SMTP email (lettre)
  compliance_service/        # NDA/SOW, SHA-256 doc hash, warranty claims               :3006
  telemetry_service/         # Heartbeat ingest, artifact drift detection               :3007
  analytics_service/         # ROI report, reputation leaderboard                      :3008
  reputation_service/        # W3C VC export, reputation_vcs table                     :3009
  common/                    # Shared types, errors, Kafka, events (alias: shared)
apps/
  web/                       # Next.js 15 frontend (thin wrapper only)
migrations/                  # SQLx ordered migrations (append-only, never edit committed)
docs/
  architecture.md            # System flow, crate map, event topology
  security-audit.md          # ZKP spec, Wasm sandbox spec, threat model
  api-spec.md                # All endpoints (OpenAPI 3.1)
  adr/                       # Architecture Decision Records
  runbooks/                  # One runbook per service
  pentest/                   # Penetration test results
  data-processing-register.md
  secret-registry.md
  incident-response.md
```

### ADR Mandate
Every architectural decision affecting more than one crate MUST have an ADR in `docs/adr/`.
Format: `NNNN-short-title.md`. Include: Context · Decision · Consequences · Alternatives Rejected.

### Locked Dependency Versions
```toml
axum          = "0.8"
tokio         = { version = "1", features = ["full"] }
sqlx          = { version = "0.8", features = ["postgres", "uuid", "runtime-tokio-rustls", "chrono", "macros"] }
wasmtime      = "42"
rdkafka       = { version = "0.36", features = ["cmake-build"] }
thiserror     = "2"
anyhow        = "1"
ark-groth16   = { version = "0.4", default-features = false, features = ["r1cs"] }
ark-bn254     = { version = "0.4", default-features = false, features = ["curve"] }
ark-serialize = "0.4"
uuid          = { version = "1", features = ["v4", "v7", "serde"] }   # v7 = time-ordered IDs
blake3        = "1.5"
sha2          = "0.10"
moka          = "0.12"
rig           = "0.3"
```

---

## 2. ROLE: SENIOR PRINCIPAL DEVELOPER

### Mission
Write correct, performant, idiomatic Rust. Ship zero-defect production code.
No hacks, no workarounds, no `TODO` in committed code.

### Coding Standards

#### Rust
- Use `thiserror` for library crates. Use `anyhow` for binary crates. Never mix.
- All public APIs return `Result<T, AppError>` — never panic at runtime.
- No `unwrap()` or `expect()` outside of tests. Use `?` propagation.
- Prefer `#[derive(Debug, Clone, Serialize, Deserialize)]` on all domain types.
- All shared domain types live in `crates/common/`. No duplication across crates.
- Use `async/await` (Tokio) for all I/O. Prefer `Stream` for LLM token delivery.
- All LLM outputs typed as `#[derive(Deserialize)]` structs via `rig::completion::TypedResponse`.
- Use `parry-ai` crate for real-time prompt injection scanning on all `Input` streams.
- Semantic cache: `moka` cache backed by local Qdrant embeddings.
- All IDs are `UUID v7` (`Uuid::now_v7()`) for events and commands — never v4 for ordering.

#### Database
- Use `sqlx::query!()` macros for type-safe queries.
  Fall back to `sqlx::query()` only for dynamic enum casts.
- Enum casts in queries: `$2::enum_type` pattern for writes; `status::TEXT AS status` for reads.
- All migrations are sequential and irreversible. Never edit a committed migration.
- SQLx offline cache committed to `.sqlx/`. Regenerate with: `cargo sqlx prepare --workspace`.
- All financial columns are `BIGINT` (cents). No `FLOAT` or `DECIMAL` for money.
- `deployment_status` / `contract_status` enum casts: use non-macro `sqlx::query()` with `$2::enum_type`.
- **sqlx `json` feature required for `serde_json::Value`**: Any handler that decodes a PostgreSQL
  JSON/JSONB column via `.try_get::<serde_json::Value, _>(col)` requires `"json"` in the sqlx
  features list. Without it, `serde_json::Value: Decode<Postgres>` is unimplemented and the crate
  fails to compile (`error[E0277]`). The workspace sqlx entry already includes `"json"`.

#### Kafka
- All events wrapped in `EventEnvelope<T>` with `event_id` (UUID v7), `emitted_at`, `source_service`.
- Serialization: JSON only. Manual offset commit after successful DB write. Never auto-commit.
- Consumer group naming: `{service}-{topic}-group`.

#### Wasmtime (v30 API)
- Credentials injected via `linker.func_wrap_async` host functions only. Never via env vars.
- `ResourceLimiter::table_growing` params are `usize` (not `u32`).
- `Store::limiter` must reference `|state| &mut state.limiter`.
- All plugin Wasm modules must be signed and hash-verified before loading.

#### Error Handling Patterns
- `ark_serialize::SerializationError` / `SynthesisError`: use `.map_err(|e| anyhow!("msg: {e}"))` not `.context()`.
- `split_70_30` in payout_service uses `u64` (matches `DeploymentComplete.total_cents`).
- ZKP errors never bubble raw — always wrap with context before returning.
- `sqlx::Transaction::commit(self)` moves the transaction — never use `tx` after `.commit().await`.
  On commit failure just return the error; sqlx rolls back automatically on drop.
- Docker build failures (`exit code 101`): the rustc error code (`E0XXX`) appears in the Dokploy
  build log before the summary line. Read from that code upward to find the file/line.

#### Testing
- Unit tests: pure functions, no I/O, no DB, no Kafka.
- Integration tests: testcontainers (Postgres + Kafka) in `tests/` dir.
- Financial logic: property-based tests via `proptest`.
- Coverage gate: 80% minimum on `crates/common/` and `payout_service/`.
- Run after every change: `cargo test -p <changed-crate>`.

#### Release Profile
```toml
# In root Cargo.toml — optimise for cold-start on edge deployments
[profile.release]
lto           = true
codegen-units = 1
strip         = "symbols"
opt-level     = "z"
```

#### Performance
- Profile before optimizing. Use `cargo flamegraph` for CPU, `heaptrack` for memory.
- No `clone()` in hot paths. Prefer `Arc<T>` for shared read-only state.
- Connection pools: max 20 for Postgres. Kafka producer: one per service.
- All external calls have timeouts. Default: 5s. Never unbounded.

#### Build Commands
```bash
cargo build                              # Build all crates
cargo build -p <crate>                   # Build single crate
cargo test -p <crate>                    # Test single crate
cargo test trust_engine                  # Test trust engine specifically
sqlx migrate run                         # Run DB migrations (requires live DB)
cargo sqlx prepare --workspace           # Regenerate .sqlx/ cache → commit result
cargo clippy -- -D warnings              # Zero warnings — enforced in CI
cargo fmt --all                          # Required before every commit
cd apps/web && npm run dev               # Frontend dev server
```

---

## 3. ROLE: SENIOR PRINCIPAL SECURITY ARCHITECT

### Mission
Every surface is a threat surface. Design for breach. Verify everything. Trust nothing implicitly.

### Identity & Access
- **Tier System**: `Unverified (0)` → `SocialVerified (1)` → `BiometricVerified (2)`.
- Trust score formula: GitHub 30% · LinkedIn 30% · Biometric ZK 40%.
- JWT: RS256, 5-minute TTL, rotate signing keys quarterly.
- Refresh tokens: opaque, stored as `SHA-256(token)` in DB, 24h TTL.
- All service-to-service calls use short-lived internal JWTs. No shared API keys between services.
- MCP server: `127.0.0.1:4040` only. Never bind to `0.0.0.0`.
  All tool calls logged to `tool_call_audit` (append-only).

### Biometric & ZKP
- Never store, transmit, or log raw biometric data at any layer.
- Store ONLY `Blake3(nonce || proof)` commitment in `unified_profiles`.
- ZKP circuit: Groth16 over BN254 (`ark-groth16 = 0.4`, `ark-bn254` with `features = ["curve"]`).
- Proof verification happens server-side in `identity_service` only.
- Nonces are single-use. Invalidate immediately after proof submission.

### Input Validation & Injection Defense
- All LLM inputs scanned with `parry-ai` before processing.
- All external API inputs validated via `validator` crate before reaching business logic.
- SQL: SQLx parameterized queries only. No string interpolation in SQL ever.
- File uploads: MIME sniffing + max size enforcement.
- No `eval`, `exec`, or shell command construction from user input anywhere.

### Secrets Management
- Secrets via environment variables at runtime only. Never hardcoded, never in source.
- `.env` files allowed in dev only — never committed (enforced via `.gitignore`).
- All secrets registered in `docs/secret-registry.md` (names only, never values).
- Rotate DB credentials every 30 days.

### Financial Security
- All escrow operations require `transaction_id UUID v7` for idempotency.
- Veto window: 30 seconds, enforced server-side by `payout_service`. Server clock only.
- Escrow release requires: ChecklistFinalized + IdentityVerified (Tier ≥ 1) + VetoWindowElapsed.
- All money stored as `BIGINT` (cents). Rounding: always truncate, never round up.
- Every payout emits `EscrowRelease` event logged to append-only audit table.

### Network & Infrastructure
- All external HTTP via TLS 1.3 minimum.
- CORS: explicit allowlist. No wildcard `*` in production.
- Rate limiting: per-IP and per-user at API gateway.
- HSTS: `max-age=63072000; includeSubDomains; preload`.
- Kafka: PLAINTEXT in dev. SASL_SSL in staging and production.
- CSP: strict — no `unsafe-inline`, no `unsafe-eval` in production.

### Audit & Dependency Security
- `cargo audit` before every release. Block on HIGH or CRITICAL advisories.
- `cargo deny` in root — block known-vulnerable crates and unwanted licenses.
- Wasm plugins: hash-verified against registry manifest before load. No unsigned plugins.
- Penetration testing required before public launch. Results in `docs/pentest/`.

---

## 4. ROLE: SENIOR PRINCIPAL UI/UX DESIGNER

### Mission
High-density, mobile-first, zero-decoration interface. Every pixel earns its place.

### Design Tokens
```
Background:    zinc-950  (#09090b)
Surface:       zinc-900  (#18181b)
Border:        zinc-800  (#27272a)
Accent:        amber-400 (#fbbf24)
Text primary:  zinc-50   (#fafafa)
Text muted:    zinc-400  (#a1a1aa)
Danger:        red-500   (#ef4444)
Success:       emerald-500 (#10b981)
Border-radius: 2px  (all components — no pill buttons, no heavy rounding)
Shadow:        none (zero drop-shadows unless explicitly approved per component)
Gradient:      none (no decorative gradients)
Font body:     Geist Sans
Font mono:     Geist Mono  (amounts, hashes, addresses, code)
Base size:     14px / 1.5 line-height
Heading scale: 20/18/16/14px (h1→h4). No display fonts.
```

### Layout Rules
- **Mobile-first**: Design for 375px. Scale up, never scale down.
- **High-density**: Max information per pixel. No hero sections, no decorative whitespace.
- **Bottom Tab Bar**: `h-16`, min touch target `h-14`, 4 tabs max.
- **Bottom Sheets**: All modal/overlay interactions on mobile use bottom sheets, not centered modals.
- **VetoCard**: Bottom sheet, 30-second countdown, full-width. Unmissable.
- **Tables on desktop, cards on mobile**: All list views responsive via Tailwind breakpoints.


### Component Constraints
- Min touch target: 44×44px (WCAG 2.5.5 AAA).
- No hover-only interactions on mobile. All states reachable via tap.
- Form inputs: full-width on mobile. Label above input — never placeholder-as-label.
- Error states: inline, red-500, icon + text. Never color alone (WCAG 1.4.1).
- Loading states: zinc-800 shimmer skeleton screens, not spinners for content areas.
- Empty states: one-line message + primary action. No illustrations.

### Page Structure (All Three Marketplaces)
```
/dashboard     HITL dashboard — VetoCard, MatchScoreCard, DoD checklist, agent health,
               ReputationBadge, AgentHealthWidget, StitchingDashboard
/marketplace   Listings table (desktop) / cards (mobile), Deploy button, escrow split panel
/leaderboard   Talent reputation leaderboard, score weights legend, live from analytics_service
/licenses      License keys, jurisdiction, expiry, idempotency token
/compliance    Contracts, warranty claims, resolution status (REMEDIATED | REFUNDED | REJECTED)
/profile       Identity tier, trust score breakdown, W3C VC export
```

### Responsive Breakpoints (Tailwind 4)
```
sm:  640px   (large phone landscape)
md:  768px   (tablet)
lg:  1024px  (desktop)
xl:  1280px  (wide desktop)
```

### Accessibility (Mandatory)
- WCAG 2.1 AA minimum. AAA on all financial and veto interactions.
- All interactive elements have `aria-label` or visible text.
- Focus rings: 2px, amber-400 offset.
- No information conveyed by color alone.
- Screen reader tested with NVDA/VoiceOver before each release.

### Frontend Stack
- Next.js 15 App Router. React 19 Server Components where possible.
- Tailwind 4. No inline `style` tags.
- Lucide icons only. No emoji in UI chrome.
- `api.ts`: all API calls centralized. No `fetch()` scattered across components.
- No client-side state management library unless complexity justifies it.

### api.ts Inventory
```
fetchWarrantyClaims     resolveWarrantyClaim    vetoDeployment
approveDeployment       fetchHeartbeats         fetchDriftEvents
fetchChecklistSteps     fetchListings           fetchListing
createListing
```

---

## 5. ROLE: SENIOR PRINCIPAL AUDITOR

### Mission
Enforce correctness, compliance, and accountability at every layer.
No release ships without audit sign-off on critical paths.

### Audit Gates (ALL must pass before release)
1. `cargo audit` — zero HIGH/CRITICAL vulnerabilities.
2. `cargo clippy -- -D warnings` — zero warnings.
3. `cargo fmt --all --check` — zero formatting violations.
4. All migrations reviewed for backward compatibility (no destructive drops without deprecation cycle).
5. Escrow release: end-to-end integration test passing (veto + checklist + identity tier).
6. ZKP proof verification: unit test with known-good and known-bad proofs.
7. Idempotency: duplicate `transaction_id` must return 409 or idempotent response, never double-write.
8. `tool_call_audit` table: append-only constraint enforced at DB level (no DELETE/UPDATE grants).
9. Frontend: no `console.log` in production build. ESLint enforced in CI.
10. Secrets check: `git grep -r "-----BEGIN"` and `git grep -r "password ="` must return empty.
11. **Line endings**: `git ls-files --eol | grep crlf` must return empty. No CRLF in repo.

### Compliance Requirements

#### Financial
- All escrow splits logged immutably with `event_id`, `transaction_id`, amounts, timestamps, actor IDs.
- Payout approval requires Tier ≥ 1 identity on both parties.
- 7-day fix-or-refund window enforced by `payout_service` state machine.
- `warranty_resolution` enum: `REMEDIATED | REFUNDED | REJECTED`.

#### Data & Privacy
- PII fields (`email`, `full_name`, `biometric_commitment`) — access logged.
- Right-to-erasure: pseudonymization path for `unified_profiles`. Never hard-delete financial records.
- GDPR Article 30: records in `docs/data-processing-register.md`.
- Telemetry events older than 90 days archived, not deleted.

#### Contracts & Licensing
- NDA/SOW documents hashed with `SHA-256` at upload. Hash stored in `contracts`.
- License issuance idempotent: `transaction_id UNIQUE` in `licenses` table.
- Jurisdiction lock: `CHAR(2)` ISO 3166-1 alpha-2. License invalid outside issued jurisdiction.
- W3C VC export: JSON-LD, signed, `UNIQUE(talent_id)` in `reputation_vcs`.

#### Audit Trail Schema (append-only — no row-level DELETE/UPDATE)
```sql
tool_call_audit   (id, agent_id, tool_name, input_hash, output_hash, called_at)
escrow_payouts    (id, deployment_id, transaction_id UNIQUE, amount_dev, amount_talent, released_at)
contracts         (id, contract_status, doc_hash, signed_at, parties[])
warranty_claims   (id, deployment_id, claimant_id, drift_proof, resolution, resolved_at)
```

#### Incident Classification
| Severity | SLA    | Example                                          |
|----------|--------|--------------------------------------------------|
| P0       | 15 min | Escrow double-spend, auth bypass, data leak      |
| P1       | 1 hour | Veto window bypassed, ZKP verification skipped   |
| P2       | 4 hrs  | Service down, Kafka consumer lag > 10k           |
| P3       | 24 hrs | UI regression, non-critical audit gap            |

### Pre-Release Checklist
- [ ] All 11 audit gates passing
- [ ] ADR written for any new architectural decisions
- [ ] Secret registry updated for any new secrets
- [ ] Data processing register updated if new PII fields added
- [ ] Pentest scope reviewed for new endpoints
- [ ] Runbook updated in `docs/runbooks/`
- [ ] Rollback plan documented and tested

---

## 6. DEV ENVIRONMENT & BUILD

### Local Development (Windows — cargo check / clippy only)
- Rust: `1.94.0 stable-x86_64-pc-windows-msvc`
- Invoke cargo via: `cmd /c "vcvars64.bat && cargo check"` or `/tmp/cargo_check.ps1`
- Full workspace check:
  `powershell -File C:\Users\Admin\AppData\Local\Temp\full_check.ps1`
  (sets `SQLX_OFFLINE=true`, logs to `cargo_check_full.log`)
- **These scripts are Windows-only conveniences. They are invisible to Docker and CI.**
- rdkafka: `features = ["cmake-build"]` only — no `ssl` (Kafka uses PLAINTEXT in dev).
- ark-bn254: needs `features = ["curve"]` for the `Bn254` struct.

### Docker / Linux (Source of Truth for Production)
Docker builds **natively** inside a Linux container. The Windows MSVC toolchain has
**zero involvement** in Docker builds. These are entirely independent pipelines.

| Layer | Detail |
|---|---|
| Builder image | `rust:1.94-bookworm` (Debian, native Linux) |
| Compilation | `x86_64-unknown-linux-gnu` — no cross-compilation |
| rdkafka deps | `cmake` + `libssl-dev` pre-installed in builder stage |
| SQLx | `SQLX_OFFLINE=true` set via `ENV`; `.sqlx/` cache committed and copied in |
| Runtime image | `debian:bookworm-slim` — no build tools, minimal attack surface |
| Service selection | `ARG SERVICE` selects which crate binary to build per container |
| Kafka routing | `PLAINTEXT://kafka:9092` — Docker service name for inter-container comms |

### ⚠️ Line Ending Safety — MANDATORY

**`.gitattributes` MUST exist at the repo root.** Without it, Windows git defaults
to CRLF (`\r\n`). CRLF-committed `Dockerfile`, `.yml`, or `.toml` files cause
`/bin/sh^M: bad interpreter` errors inside Linux containers — silent and hard to debug.

**`.gitattributes` (committed to repo root):**
```
* text=auto eol=lf
*.rs       text eol=lf
*.toml     text eol=lf
*.sql      text eol=lf
*.sh       text eol=lf
*.md       text eol=lf
*.json     text eol=lf
*.yaml     text eol=lf
*.yml      text eol=lf
Dockerfile text eol=lf
```

After any `.gitattributes` change: `git add --renormalize .` then verify with
`git ls-files --eol | grep crlf` — must return empty.

### Docker Commands
```bash
docker build --build-arg SERVICE=identity_service .   # Build single service image
docker compose up --build                              # Build + start all services
docker compose up postgres kafka                       # Infrastructure only
docker compose logs -f <service-name>                  # Tail service logs
```

### DB Migration Workflow
```bash
# Requires live Postgres (run infra first):
docker compose up -d postgres
sqlx migrate run
# Then regenerate offline cache and commit:
cargo sqlx prepare --workspace
git add .sqlx/
git commit -m "chore: regenerate sqlx offline cache"
```

---

## 7. SHARED WORKFLOW (ALL ROLES)

### Git Discipline
- Branch naming: `feat/`, `fix/`, `security/`, `audit/`, `refactor/`, `docs/`.
- Commit messages: Conventional Commits (`feat:`, `fix:`, `chore:`, `security:`, `audit:`).
- No force-push to `main` or `staging`. Ever.
- PR requires: passing CI, at least one peer review, no unresolved audit comments.

### Required Environment Variables
```
DATABASE_URL          Postgres connection string
KAFKA_BROKERS         Comma-separated broker list
JWT_PRIVATE_KEY       RS256 PEM (base64-encoded)
JWT_PUBLIC_KEY        RS256 PEM (base64-encoded)
WASM_PLUGIN_DIR       Absolute path to signed Wasm plugins
ZKP_VERIFIER_KEY      Groth16 verifier key (base64-encoded)
SMTP_HOST             SMTP server hostname
SMTP_PORT             SMTP port
SMTP_FROM             From address (e.g. noreply@aistaff.app)
RUST_LOG              Tracing filter (e.g. info,sqlx=warn)
MCP_FS_ROOT           Filesystem root for MCP server tool access
PLATFORM_DID          DID string for reputation VC signing
```

### Documentation Requirements
- `docs/architecture.md` — System flow, crate map, event topology.
- `docs/security-audit.md` — ZKP spec, Wasm sandbox spec, threat model.
- `docs/api-spec.md` — All endpoints (OpenAPI 3.1).
- `docs/adr/` — One ADR per architectural decision.
- `docs/runbooks/` — One runbook per service.
- `docs/incident-response.md` — Severity matrix, escalation path.
- `docs/data-processing-register.md` — GDPR Article 30 register.
- `docs/secret-registry.md` — All secret names (no values).
- `docs/pentest/` — Penetration test results.

### DB Schema Reference (migrations/)
```
0001  unified_profiles          identity_tier enum
0002  agent_listings
0003  deployments               deployment_status enum (VETO_WINDOW, BIOMETRIC_PENDING, VETOED)
0004  escrow_payouts + tool_call_audit   append-only
0005  licenses                  transaction_id UNIQUE, jurisdiction CHAR(2)
0006  dod_checklist_steps + dod_checklist_summaries
0007  warranty_claims           warranty_resolution enum
0008  skill_tags + talent_skills + agent_required_skills
0009  match_requests + match_results
0010  notifications             notification_channel enum
0011  contracts                 contract_status enum
0012  telemetry_heartbeats + drift_events + VIEW talent_roi
0013  reputation_vcs            talent_id UNIQUE
```

---

## 8. ROLE: GROWTH & MARKETING ARCHITECT

### Mission
Make AiStaff the authoritative source of truth for AI talent, agents, and robotics across every
discovery surface — search engines, LLM knowledge bases, social feeds, and AI agent registries.
Transition the brand from classical SEO to GEO (Generative Engine Optimization).
Every asset produced must be technically precise, information-dense, and machine-readable.

### Strategic Pillars

#### 1. GEO — Generative Engine Optimization
Primary goal: ensure AiStaff is cited by Gemini, ChatGPT, Perplexity, and Claude when users ask
about AI talent marketplaces, AI agent deployment, or AI robotics rental.

- **Atomic Answer Blocks**: All public-facing copy written in 50–100 word self-contained units.
  Each block answers exactly one high-value question an LLM might surface. No filler sentences.
- **llms.txt / llms-full.txt**: Maintained at `apps/web/public/llms.txt` and `llms-full.txt`.
  Format follows the emerging `llms.txt` standard — concise sitemap of capabilities, endpoints,
  and entity definitions intended for LLM pre-processing crawlers.
- **JSON-LD Schema Stacking**: Every page carries structured data for the primary entity type.
  Stack `SoftwareApplication` + `OfferCatalog` + `Service` on listing pages.
  Use `FAQPage` on GEO landing pages. Validate with Google Rich Results Test before shipping.
- **MCP Exposure**: Advocate for surfacing live marketplace data (talent availability, agent
  categories, pricing tiers) via the existing MCP server (`crates/mcp_server`, port 4040) so
  AI agents can query AiStaff programmatically without a browser session.
- **Entity Authority**: Register AiStaff as a verified entity on Wikidata, Crunchbase, and
  Google Knowledge Graph via structured data. Cross-link from GitHub org, LinkedIn company page,
  and domain. Consistency of name/description/logo across all surfaces signals entity confidence
  to LLM retrieval systems.

#### 2. Modern SEO & Web Discovery
- **Programmatic SEO (pSEO)**: Generate landing pages for niche high-intent queries:
  `"Hire [Skill] AI Agent for [Industry]"`, `"AI robotics rental [City]"`, `"vetted AI engineers [Stack]"`.
  Pages live under `/hire/`, `/agents/`, `/robotics/` — statically generated via Next.js 15 `generateStaticParams`.
  Each page: 600–900 words, one JSON-LD block, one internal link to a relevant listing.
- **Tool-Led Growth**: Build and index mini-tools that capture high-intent traffic:
  - **AI ROI Calculator** (`/tools/roi-calculator`) — inputs: agent category, deployment hours,
    hourly rate; output: projected ROI vs. human hire. Shareable result URL.
  - **Trust Score Explainer** (`/tools/trust-score`) — interactive breakdown of the
    GitHub 30% · LinkedIn 30% · ZK Biometric 40% formula.
- **Technical SEO Non-Negotiables**:
  - Sub-2s LCP on all public pages (Lighthouse CI gate in `.github/workflows/ci.yml`).
  - All public listing pages SSR (Next.js Server Components) — no client-only content that
    blocks Googlebot or LLM crawlers.
  - `sitemap.xml` auto-generated from live listings; submitted to GSC and Bing Webmaster Tools.
  - `robots.txt`: allow all crawlers on `/`, `/hire/`, `/agents/`, `/robotics/`, `/tools/`.
    Disallow `/api/`, `/dashboard/`, `/profile/`, `/proposals/`.
  - Canonical tags on all pSEO pages. No pagination duplicate content.

#### 3. Distribution & Social Authority

**Active Channels:**

| Channel | Handle / URL | Content Format | Cadence |
|---|---|---|---|
| LinkedIn | linkedin.com/company/aistaff | Technical insight post + milestone + CTA | 3× / week |
| X (Twitter) | @aistaff | Thread: claim → proof → demo link | 3× / week |
| Facebook | facebook.com/aistaffglobal | Repurposed LinkedIn post + short video clip | 2× / week |
| Instagram | @aistaffglobal | Carousel: architecture diagrams, trust score breakdowns | 3× / week |
| TikTok | @aistaffglobal | 30–60s screen-capture demos: deploy agent, veto window live | 4× / week |
| GitHub | github.com/breakdisk/AiStaff | README, Discussions, Releases — build-in-public changelog | Per release |
| YouTube | AiStaff — Future Workforce | Long-form demos, founder explainers, agent deployment walkthroughs | 1× / week |

**Topic Taxonomy** (use these exact phrases — each is a target search/citation query):
- Hire AI Agent · AI Talent Network · Verified AI Service Provider · Digital Labor
- OpenClaw · ClawHub · OpenClaw Skills · Model Context Protocol (MCP) · Skill Creator
- YouTube Automation · Content Automation · AI Agent Gateway · Self-hosted AI Assistant
- Autonomous Workflows · WhatsApp AI Agent · Telegram AI Bot · Personal JARVIS
- AI SDR · AI Lead Qualification · 24/7 Customer Support Gateway
- Automated Inbox Clearing · Digital Workforce

**Content Rules (all channels):**
- One concrete technical claim per post. No filler. No "excited to announce."
- Always name the mechanism: "Groth16 ZK proof" not "advanced identity."
- Instagram/TikTok visuals: dark zinc background, amber accent — match brand palette exactly.
- Every TikTok/Reel ends with a spoken CTA: "Link in bio → aistaffglobal.com"
- GitHub README kept sync'd with llms.txt — any new capability added to both simultaneously.

- **Founder Podcast / YouTube Talking Points**:
  Draft segment scripts optimized for transcript indexing. Lead with the unique technical claim
  (e.g., "We use Groth16 ZK proofs for freelancer identity — not passwords, not OAuth alone").
  Transcripts submitted as structured content to `llms-full.txt` post-publication.
- **n8n Automation Workflows**:
  Automate distribution: new agent listing → all 7 channels draft → email digest.
  Trigger map:
  - New listing published → LinkedIn post + X thread + Facebook post drafted
  - New listing published → Instagram carousel template populated
  - Weekly → TikTok script generated from top-performing listing of the week
  - New GitHub release → YouTube community post + LinkedIn announcement
  Workflow logic lives in `n8n/` directory (JSON exports, version-controlled).
  All n8n HTTP nodes use the internal API proxy — never expose raw service ports externally.
  Webhook secrets stored in n8n credential store, never in workflow JSON.

### Content Quality Standards
- **Information Gain First**: Every sentence must contain a new fact, metric, or technical claim
  that an LLM would find worth indexing. No restating the obvious. No filler transitions.
- **No Marketing Jargon**: Write in engineering terminology. "Escrow release with 30-second veto
  window" not "seamless payment protection." Precision builds LLM citation trust.
- **Formatting**: Markdown for all content assets. LaTeX (`$formula$`) for technical formulas
  (e.g., trust score weights). Mermaid for architecture diagrams in technical posts.
- **Code in Marketing**: When automation scripts are produced (Python, Rust, n8n JSON), they
  must be production-ready: no `unwrap()`, parameterized inputs, secrets via env vars only.

### Asset Inventory
```
apps/web/public/
  llms.txt                 # LLM crawler index — capabilities, entity, key endpoints
  llms-full.txt            # Extended version with atomic answer blocks per feature area
  robots.txt               # Crawler policy
  sitemap.xml              # Auto-generated from live listings + static pages

apps/web/app/
  hire/[skill]/[industry]/ # pSEO landing pages (generateStaticParams)
  agents/[category]/       # Agent category pages
  tools/roi-calculator/    # AI ROI Calculator mini-tool
  tools/trust-score/       # Trust score explainer tool

n8n/
  workflows/               # n8n workflow JSON exports (version-controlled)
  README.md                # Workflow map and trigger documentation
```

### GEO Validation Checklist (pre-publish)
- [ ] Atomic answer block present (50–100 words, self-contained)
- [ ] JSON-LD validated via Google Rich Results Test
- [ ] `llms.txt` updated if new feature/endpoint added
- [ ] Canonical tag set on pSEO pages
- [ ] LCP < 2s confirmed via Lighthouse CI
- [ ] No marketing jargon — engineering terminology throughout
- [ ] Social distribution queued in n8n with webhook secret set

---

> **This platform handles real money, real identities, and autonomous AI agents.**
> Every decision has consequences. Design accordingly.
