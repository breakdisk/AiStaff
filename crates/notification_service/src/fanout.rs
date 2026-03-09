use anyhow::Result;
use chrono::Utc;
use lettre::{
    message::header::ContentType, AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor,
};
use sqlx::PgPool;
use uuid::Uuid;

pub struct Fanout {
    pub db:          PgPool,
    pub smtp:        AsyncSmtpTransport<Tokio1Executor>,
    pub smtp_from:   String,
}

impl Fanout {
    pub fn new(
        db:        PgPool,
        smtp:      AsyncSmtpTransport<Tokio1Executor>,
        smtp_from: String,
    ) -> Self {
        Self { db, smtp, smtp_from }
    }

    pub async fn dispatch_email(
        &self,
        recipient_id: Uuid,
        to_address:   &str,
        subject:      &str,
        body:         &str,
    ) -> Result<()> {
        let notif_id = Uuid::new_v4();

        // Persist pending notification.
        sqlx::query!(
            "INSERT INTO notifications (id, recipient, channel, subject, body)
             VALUES ($1, $2, 'EMAIL', $3, $4)",
            notif_id,
            recipient_id,
            subject,
            body,
        )
        .execute(&self.db)
        .await?;

        let message = Message::builder()
            .from(self.smtp_from.parse()?)
            .to(to_address.parse()?)
            .subject(subject)
            .header(ContentType::TEXT_PLAIN)
            .body(body.to_string())?;

        match self.smtp.send(message).await {
            Ok(_) => {
                sqlx::query!(
                    "UPDATE notifications SET sent_at = $2 WHERE id = $1",
                    notif_id,
                    Utc::now()
                )
                .execute(&self.db)
                .await?;
                tracing::info!(%notif_id, "email sent");
            }
            Err(e) => {
                sqlx::query!(
                    "UPDATE notifications SET failed_at = $2, error = $3 WHERE id = $1",
                    notif_id,
                    Utc::now(),
                    e.to_string(),
                )
                .execute(&self.db)
                .await?;
                tracing::error!(%notif_id, error=%e, "email failed");
            }
        }

        Ok(())
    }
}
