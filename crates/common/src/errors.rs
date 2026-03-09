use thiserror::Error;

/// Domain-level typed errors — used inside library crates.
#[derive(Debug, Error)]
pub enum DomainError {
    #[error("Identity not found: {id}")]
    IdentityNotFound { id: uuid::Uuid },

    #[error("Trust score too low: required {required}, got {actual}")]
    InsufficientTrust { required: u8, actual: u8 },

    #[error("Credential verification failed: {reason}")]
    VerificationFailed { reason: String },

    #[error("Sandbox provisioning failed: {reason}")]
    SandboxError { reason: String },

    #[error("Escrow state invalid: {reason}")]
    EscrowStateError { reason: String },

    #[error("Kafka error: {0}")]
    KafkaError(String),

    #[error("Database error: {0}")]
    DatabaseError(#[from] sqlx::Error),

    #[error("ZK proof verification failed: {reason}")]
    ZkVerificationError { reason: String },

    #[error("Capability denied: tool '{tool}' not in manifest")]
    CapabilityDenied { tool: String },
}
