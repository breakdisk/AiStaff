# ADR 0003 — ZKP Biometric: Groth16 over BN254, Blake3 Commitment

**Date:** 2026-03-09
**Status:** Accepted

---

## Context

Tier 2 identity requires biometric verification. Storing raw biometric templates
is a catastrophic privacy liability — a single DB breach would expose irreplaceable
biometric data for all users.

---

## Decision

Biometric identity uses Zero-Knowledge Proofs:

- **Circuit:** Groth16 over BN254 (ark-groth16 0.4 + ark-bn254 with `features = ["curve"]`)
- **Stored value:** `Blake3(nonce || groth16_proof_bytes)` only
- **Nonce:** 32-byte random, single-use, invalidated after proof submission
- Raw biometric template is processed client-side and **never transmitted**
- Proof verification is server-side in `identity_service` only

---

## Consequences

**Positive:**
- Zero biometric data stored — breach of DB reveals only opaque commitments.
- ZKP proves biometric validity without revealing the biometric itself.
- Blake3 commitment is computationally binding and collision-resistant.

**Negative:**
- ZKP circuit requires careful auditing (included in pentest scope).
- Client-side proof generation adds UX latency (~500ms on mobile).
- ark-* crates have complex dependency requirements (`default-features = false` + explicit feature flags).

---

## Alternatives Rejected

| Alternative | Reason Rejected |
|---|---|
| Store hashed biometric template | Hash inversion possible with known template sets |
| Third-party biometric SaaS | Data leaves platform; GDPR complexity; vendor lock-in |
| No biometric (Tier 2 via docs) | Weaker identity assurance for high-value escrow |
| STARK proofs | Larger proof size; slower verification; tooling less mature |
