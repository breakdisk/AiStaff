//! ZK liveness proof verification using arkworks Groth16 on BN254.
//!
//! Circuit semantics:
//!   Prover holds biometric template `t` and a nonce.
//!   Proves knowledge of `t` such that `Blake3(nonce || t) == commitment`
//!   without revealing `t` to the verifier.
//!
//! Verifier inputs: `commitment` (public), `nonce` (public), `proof` (opaque).
//! Raw biometric data NEVER enters this module.

use anyhow::{anyhow, Result};
use ark_bn254::{Bn254, Fr};
use ark_groth16::{Groth16, PreparedVerifyingKey, Proof};
use ark_serialize::CanonicalDeserialize;
use blake3::Hasher;

/// Public inputs visible to the verifier — no biometric data.
pub struct ZkPublicInputs {
    /// Blake3(nonce) — prevents replay attacks.
    pub nonce_hash: [u8; 32],
    /// Blake3(nonce || zk_proof_bytes) commitment stored in `UnifiedProfile`.
    pub liveness_commitment: [u8; 32],
}

/// Verifies a Groth16 proof of biometric liveness.
///
/// Returns `Ok(true)` iff the proof is cryptographically valid for the given inputs.
/// Returns `Ok(false)` on invalid proof (caller should treat as authentication failure).
/// Returns `Err` only on deserialization / runtime failures.
pub fn verify_liveness_proof(
    proof_bytes: &[u8],
    vk_bytes: &[u8],
    public_in: &ZkPublicInputs,
) -> Result<bool> {
    let proof = Proof::<Bn254>::deserialize_compressed(proof_bytes)
        .map_err(|e| anyhow!("Failed to deserialize ZK proof: {e}"))?;

    let pvk = PreparedVerifyingKey::<Bn254>::deserialize_compressed(vk_bytes)
        .map_err(|e| anyhow!("Failed to deserialize prepared verifying key: {e}"))?;

    // Encode public inputs as BN254 field elements (split 32-byte arrays into 16-byte halves).
    let chunks: [&[u8]; 4] = [
        &public_in.nonce_hash[..16],
        &public_in.nonce_hash[16..],
        &public_in.liveness_commitment[..16],
        &public_in.liveness_commitment[16..],
    ];

    let pub_inputs: Vec<Fr> = chunks
        .iter()
        .map(|chunk| {
            let mut bytes = [0u8; 32];
            bytes[..chunk.len()].copy_from_slice(chunk);
            Fr::deserialize_compressed(bytes.as_slice())
                .map_err(|e| anyhow!("Fr deserialization: {e}"))
        })
        .collect::<Result<Vec<_>>>()?;

    Groth16::<Bn254>::verify_proof(&pvk, &proof, &pub_inputs)
        .map_err(|e| anyhow!("Groth16 proof verification error: {e}"))
}

/// Derives the liveness commitment stored in `UnifiedProfile.biometric_commitment`.
/// This is the ONLY biometric-derived value that persists. Raw proof bytes are discarded.
pub fn derive_commitment(nonce: &[u8], proof_bytes: &[u8]) -> String {
    let mut hasher = Hasher::new();
    hasher.update(b"aistaff-liveness-v1");
    hasher.update(nonce);
    hasher.update(proof_bytes);
    hex::encode(hasher.finalize().as_bytes())
}
