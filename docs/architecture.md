# System Architecture

## Overview

AiStaffApp is an event-driven, microservices monorepo implementing three
interconnected marketplaces on a shared identity, escrow, and compliance backbone:

- **AiTalent** — Freelancer marketplace (human talent + AI-augmented workflows)
- **AI Agent** — Autonomous AI agent marketplace (capability manifests, license bundles)
- **AIRobot** — Robot rental marketplace (hardware telemetry, drift detection, SLAs)

---

## System Context

```
┌──────────────────────────────────────────────────────────────────────┐
│                        apps/web (Next.js 15)                         │
│   Dashboard · Marketplace · Leaderboard · Profile · Compliance       │
└──────────────────┬───────────────────────────────────────────────────┘
                   │  HTTP / REST (JSON)
        ┌──────────▼──────────┐
        │   API Gateway / LB  │  (TLS 1.3, rate-limit, CORS allowlist)
        └──────────┬──────────┘
                   │
   ┌───────────────┼────────────────────────────────────────────┐
   │               │                                            │
   ▼               ▼                                            ▼
:3001           :3002                                        :3004-3010
identity_    marketplace_                              (all other services)
service      service
   │               │
   └───────────────┴──────────────────── Kafka ───────────────────────┐
                                     (PLAINTEXT dev / SASL_SSL prod)  │
                                                                       │
   ┌───────────────────────────────────────────────────────────────────┘
   │   Consumers: deployment_engine · payout_service · notification_service
   │              environment_orchestrator · telemetry_service
   └───────────────────────────────────────────────────────────────────
```

---

## Crate Map

| Crate | Port | Kafka Role | Core Responsibility |
|---|---|---|---|
| `common` | — | — | Shared types, EventEnvelope, Kafka producer/consumer helpers |
| `identity_service` | 3001 | Producer | OAuth stitching, ZK biometric, trust_score |
| `marketplace_service` | 3002 | Producer | POST /deployments, GET /deployments/:id, escrow consumer |
| `deployment_engine` | — | Consumer | Wasmtime sandbox, SuccessTrigger, MCP proxy |
| `payout_service` | 3010 | Both | Veto-First 30s window, 70/30 split |
| `mcp_server` | 4040 | — | MCP JSON-RPC (localhost only), tool_call_audit |
| `license_service` | 3004 | Producer | License issuance, jurisdiction lock, idempotency |
| `checklist_service` | 3003 | Producer | DoD 6-step tracker, gates escrow |
| `environment_orchestrator` | — | Consumer | Pre-flight env checks on DeploymentStarted |
| `matching_service` | 3005 | — | Jaccard skill match, talent↔agent |
| `notification_service` | — | Consumer | Kafka fanout → SMTP (lettre) |
| `compliance_service` | 3006 | — | NDA/SOW, SHA-256 doc hash, warranty claims |
| `telemetry_service` | 3007 | Both | Heartbeat ingest, artifact drift detection |
| `analytics_service` | 3008 | — | ROI report, reputation leaderboard |
| `reputation_service` | 3009 | Consumer | W3C VC export, reputation_vcs |

---

## Kafka Event Topology

```
marketplace_service ──[DeploymentStarted]──────► environment_orchestrator
                    ──[DeploymentStarted]──────► deployment_engine (after ChecklistFinalized)

checklist_service   ──[ChecklistFinalized]──────► deployment_engine
                                               ► notification_service

deployment_engine   ──[DeploymentComplete]──────► payout_service
                    ──[SuccessTrigger]──────────► marketplace_service

payout_service      ──[EscrowRelease]───────────► marketplace_service (audit log)

telemetry_service   ──[DriftDetected]───────────► notification_service
                                               ► compliance_service (warranty_claim creation)

license_service     ──[LicenseIssued]───────────► notification_service
                    ──[LicenseRevoked]──────────► notification_service

identity_service    ──[IdentityVerified]─────────► payout_service (BiometricSignoff gate)
```

---

## Deployment State Machine

```
PENDING
  │
  ├──[DeploymentStarted emitted]──► ENVIRONMENT_CHECKING
  │                                        │
  │                               [EnvironmentReady]
  │                                        │
  │                                  BIOMETRIC_PENDING
  │                                        │
  │                            [BiometricSignoff received]
  │                                        │
  │                                   VETO_WINDOW  ◄── 30s countdown
  │                                    │       │
  │                              [Vetoed]   [VetoExpired + ChecklistFinalized]
  │                                │               │
  │                             VETOED          EXECUTING
  │                                                │
  │                                     [SuccessTrigger]
  │                                                │
  │                                           COMPLETED
  │
  └──[Any failure]──► FAILED
```

---

## Escrow Flow

```
Client pays → ESCROW_HELD
                 │
    ┌────────────┼─────────────────────┐
    │            │                     │
 Checklist   Biometric ZK         30s Veto
 Finalized   Verified             Window
    │            │                     │
    └────────────┴──── ALL PASSED ─────┘
                              │
                    split_70_30(total_cents)
                    ├── 70% → developer wallet
                    └── 30% → talent wallet
                              │
                    EscrowRelease event emitted
                    (append-only escrow_payouts table)
```

---

## Security Boundaries

- **MCP server**: bound to `127.0.0.1:4040` only. All tool calls logged in `tool_call_audit`.
- **Wasm plugins**: loaded from signed manifests. Credentials via host functions only.
- **Biometric**: `Blake3(nonce || proof)` stored. Raw templates never touch disk.
- **Service auth**: RS256 JWT, 5-min TTL, verified at API gateway.

---

## Progressive Disclosure

- Security spec → `docs/security-audit.md`
- API definitions → `docs/api-spec.md`
- Architectural decisions → `docs/adr/`
- Service runbooks → `docs/runbooks/`
