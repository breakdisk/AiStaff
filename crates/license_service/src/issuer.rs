use anyhow::Result;
use chrono::{DateTime, Utc};
use common::events::{EventEnvelope, LicenseIssued, TOPIC_LICENSE_COMMANDS};
use common::kafka::producer::KafkaProducer;
use sqlx::PgPool;
use uuid::Uuid;

pub struct LicenseIssuer {
    pub db: PgPool,
    pub producer: KafkaProducer,
}

impl LicenseIssuer {
    pub fn new(db: PgPool, producer: KafkaProducer) -> Self {
        Self { db, producer }
    }

    /// Issues a new license. Idempotent: same `transaction_id` returns existing `license_id`.
    pub async fn issue(
        &self,
        agent_id: Uuid,
        licensee_id: Uuid,
        jurisdiction: String,
        seats: u32,
        expires_at: DateTime<Utc>,
        transaction_id: Uuid,
    ) -> Result<Uuid> {
        let existing: Option<Uuid> = sqlx::query_scalar!(
            "SELECT id FROM licenses WHERE transaction_id = $1",
            transaction_id
        )
        .fetch_optional(&self.db)
        .await?;

        if let Some(id) = existing {
            return Ok(id);
        }

        let license_id = Uuid::new_v4();
        sqlx::query!(
            "INSERT INTO licenses
                 (id, agent_id, licensee_id, jurisdiction, seats, expires_at, transaction_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7)",
            license_id,
            agent_id,
            licensee_id,
            jurisdiction,
            seats as i32,
            expires_at,
            transaction_id,
        )
        .execute(&self.db)
        .await?;

        let event = LicenseIssued {
            license_id,
            agent_id,
            licensee_id,
            jurisdiction,
            seats,
            expires_at,
        };
        let envelope = EventEnvelope::new("LicenseIssued", &event);
        self.producer
            .publish(TOPIC_LICENSE_COMMANDS, &license_id.to_string(), &envelope)
            .await?;

        Ok(license_id)
    }

    pub async fn revoke(&self, license_id: Uuid, reason: &str) -> Result<()> {
        let updated = sqlx::query!(
            "UPDATE licenses
             SET revoked_at = NOW(), revoke_reason = $2
             WHERE id = $1 AND revoked_at IS NULL",
            license_id,
            reason,
        )
        .execute(&self.db)
        .await?;

        if updated.rows_affected() == 0 {
            anyhow::bail!("license not found or already revoked: {license_id}");
        }

        let envelope = EventEnvelope::new(
            "LicenseRevoked",
            &common::events::LicenseRevoked {
                license_id,
                reason: reason.to_string(),
            },
        );
        self.producer
            .publish(TOPIC_LICENSE_COMMANDS, &license_id.to_string(), &envelope)
            .await?;

        Ok(())
    }
}
