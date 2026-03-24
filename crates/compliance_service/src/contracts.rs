use anyhow::{bail, Result};
use chrono::Utc;
use sha2::{Digest, Sha256};
use sqlx::{PgPool, Row};
use uuid::Uuid;

pub struct ContractService {
    pub db: PgPool,
}

impl ContractService {
    pub fn new(db: PgPool) -> Self {
        Self { db }
    }

    /// Creates a DRAFT contract. Party A is auto-signed at creation (implicit agreement).
    /// Returns `(contract_id, document_hash)`.
    pub async fn create_draft(
        &self,
        contract_type: &str,
        party_a: Uuid,
        party_b: Uuid,
        deployment_id: Option<Uuid>,
        document_bytes: &[u8],
        party_b_email: Option<&str>,
        party_a_email: Option<&str>,
    ) -> Result<(Uuid, String)> {
        let hash = hex::encode(Sha256::digest(document_bytes));
        let id = Uuid::new_v4();
        let doc_text = std::str::from_utf8(document_bytes).ok().map(str::to_owned);

        sqlx::query(
            "INSERT INTO contracts
                 (id, contract_type, party_a, party_b, deployment_id, document_hash,
                  document_text, party_b_email, party_a_email, party_a_signed_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())",
        )
        .bind(id)
        .bind(contract_type)
        .bind(party_a)
        .bind(party_b)
        .bind(deployment_id)
        .bind(&hash)
        .bind(doc_text.as_deref())
        .bind(party_b_email)
        .bind(party_a_email)
        .execute(&self.db)
        .await?;

        Ok((id, hash))
    }

    /// Transitions the contract to SIGNED after verifying the signer is a party.
    /// Used for authenticated (Party A) signing from the dashboard.
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

    /// Generates a sign token and stores it on the contract (7-day expiry).
    pub async fn request_signature_token(
        &self,
        contract_id: Uuid,
        party_b_email: &str,
    ) -> Result<String> {
        let row = sqlx::query("SELECT status::TEXT AS status FROM contracts WHERE id = $1")
            .bind(contract_id)
            .fetch_optional(&self.db)
            .await?;

        match row {
            None => bail!("contract {contract_id} not found"),
            Some(r) => {
                let status: Option<String> = r.try_get("status").ok();
                if status.as_deref() == Some("SIGNED") {
                    bail!("contract already signed")
                }
            }
        }

        let token = Uuid::new_v4().to_string();
        let expires_at = Utc::now() + chrono::Duration::days(7);

        sqlx::query(
            "UPDATE contracts
             SET party_b_email = $2,
                 sign_token = $3,
                 sign_token_expires_at = $4,
                 status = 'PENDING_SIGNATURE'
             WHERE id = $1",
        )
        .bind(contract_id)
        .bind(party_b_email)
        .bind(&token)
        .bind(expires_at)
        .execute(&self.db)
        .await?;

        Ok(token)
    }

    /// Returns contract data for a given sign token (validates token + expiry).
    pub async fn preview_for_token(
        &self,
        contract_id: Uuid,
        token: &str,
    ) -> Result<serde_json::Value> {
        use sqlx::Row;

        let row = sqlx::query(
            "SELECT id, contract_type, status::TEXT AS status, document_hash,
                    document_text, party_b_email, created_at,
                    sign_token, sign_token_expires_at
             FROM contracts WHERE id = $1",
        )
        .bind(contract_id)
        .fetch_optional(&self.db)
        .await?;

        let row = match row {
            Some(r) => r,
            None => bail!("contract {contract_id} not found"),
        };

        let stored_token: Option<String> = row.get("sign_token");
        let expires_at: Option<chrono::DateTime<Utc>> = row.get("sign_token_expires_at");
        let status: Option<String> = row.get("status");

        if stored_token.as_deref() != Some(token) {
            bail!("invalid or expired token");
        }
        if let Some(exp) = expires_at {
            if exp < Utc::now() {
                bail!("token expired");
            }
        }

        let id: Uuid = row.get("id");
        let contract_type: String = row.get("contract_type");
        let document_hash: String = row.get("document_hash");
        let document_text: Option<String> = row.get("document_text");
        let party_b_email: Option<String> = row.get("party_b_email");
        let created_at: chrono::DateTime<Utc> = row.get("created_at");

        Ok(serde_json::json!({
            "id":            id,
            "contract_type": contract_type,
            "status":        status,
            "document_hash": document_hash,
            "document_text": document_text,
            "party_b_email": party_b_email,
            "created_at":    created_at.to_rfc3339(),
        }))
    }

    /// External party signs via token. Returns both party emails for confirmation emails.
    pub async fn sign_external(
        &self,
        contract_id: Uuid,
        token: &str,
        _signer_name: &str,
    ) -> Result<(Option<String>, Option<String>)> {
        use sqlx::Row;

        let row = sqlx::query(
            "SELECT status::TEXT AS status, sign_token, sign_token_expires_at,
                    party_a_email, party_b_email
             FROM contracts WHERE id = $1",
        )
        .bind(contract_id)
        .fetch_optional(&self.db)
        .await?;

        let row = match row {
            Some(r) => r,
            None => bail!("contract {contract_id} not found"),
        };

        let stored_token: Option<String> = row.get("sign_token");
        let expires_at: Option<chrono::DateTime<Utc>> = row.get("sign_token_expires_at");
        let status: Option<String> = row.get("status");
        let party_a_email: Option<String> = row.get("party_a_email");
        let party_b_email: Option<String> = row.get("party_b_email");

        if stored_token.as_deref() != Some(token) {
            bail!("invalid token");
        }
        if let Some(exp) = expires_at {
            if exp < Utc::now() {
                bail!("token expired");
            }
        }
        if status.as_deref() == Some("SIGNED") {
            bail!("already signed");
        }

        sqlx::query(
            "UPDATE contracts
             SET status = 'SIGNED', signed_at = NOW(), party_b_signed_at = NOW()
             WHERE id = $1",
        )
        .bind(contract_id)
        .execute(&self.db)
        .await?;

        Ok((party_a_email, party_b_email))
    }
}
