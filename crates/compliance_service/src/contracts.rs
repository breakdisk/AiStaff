use anyhow::{bail, Result};
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use uuid::Uuid;

pub struct ContractService {
    pub db: PgPool,
}

impl ContractService {
    pub fn new(db: PgPool) -> Self {
        Self { db }
    }

    /// Creates a DRAFT contract. Returns `(contract_id, document_hash)`.
    pub async fn create_draft(
        &self,
        contract_type:  &str,
        party_a:        Uuid,
        party_b:        Uuid,
        deployment_id:  Option<Uuid>,
        document_bytes: &[u8],
    ) -> Result<(Uuid, String)> {
        let hash = hex::encode(Sha256::digest(document_bytes));
        let id   = Uuid::new_v4();

        sqlx::query!(
            "INSERT INTO contracts
                 (id, contract_type, party_a, party_b, deployment_id, document_hash)
             VALUES ($1, $2, $3, $4, $5, $6)",
            id,
            contract_type,
            party_a,
            party_b,
            deployment_id,
            hash,
        )
        .execute(&self.db)
        .await?;

        Ok((id, hash))
    }

    /// Transitions the contract to SIGNED after verifying the signer is a party.
    pub async fn record_signature(&self, contract_id: Uuid, signer_id: Uuid) -> Result<()> {
        let row = sqlx::query!(
            "SELECT party_a, party_b, status::TEXT AS status FROM contracts WHERE id = $1",
            contract_id
        )
        .fetch_optional(&self.db)
        .await?;

        let row = match row {
            Some(r) => r,
            None => bail!("contract {contract_id} not found"),
        };

        let status = row.status.as_deref().unwrap_or("");
        if status != "DRAFT" && status != "PENDING_SIGNATURE" {
            bail!("contract {contract_id} is already in state '{status}'");
        }
        if row.party_a != signer_id && row.party_b != signer_id {
            bail!("signer {signer_id} is not a party to contract {contract_id}");
        }

        sqlx::query!(
            "UPDATE contracts SET status = 'SIGNED', signed_at = NOW() WHERE id = $1",
            contract_id
        )
        .execute(&self.db)
        .await?;

        Ok(())
    }
}
