use anyhow::Result;
use chrono::Utc;
use lettre::{
    message::header::ContentType, AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor,
};
use sqlx::PgPool;
use uuid::Uuid;

/// Runtime configuration loaded from environment variables.
#[derive(Debug, Clone)]
pub struct AppConfig {
    pub twilio_account_sid: String,
    pub twilio_auth_token: String,
    pub twilio_from_number: String,
    pub twilio_whatsapp_number: String,
    pub fcm_server_key: String,
    pub slack_client_id: String,
    pub slack_client_secret: String,
    pub google_client_id: String,
    pub google_client_secret: String,
    pub encryption_key_b64: String,
    pub base_url: String,
    pub messenger_page_username: String,
}

impl AppConfig {
    pub fn from_env() -> Self {
        Self {
            twilio_account_sid: std::env::var("TWILIO_ACCOUNT_SID").expect("TWILIO_ACCOUNT_SID"),
            twilio_auth_token: std::env::var("TWILIO_AUTH_TOKEN").expect("TWILIO_AUTH_TOKEN"),
            twilio_from_number: std::env::var("TWILIO_FROM_NUMBER").expect("TWILIO_FROM_NUMBER"),
            twilio_whatsapp_number: std::env::var("TWILIO_WHATSAPP_NUMBER")
                .expect("TWILIO_WHATSAPP_NUMBER"),
            fcm_server_key: std::env::var("FCM_SERVER_KEY").expect("FCM_SERVER_KEY"),
            slack_client_id: std::env::var("SLACK_CLIENT_ID").expect("SLACK_CLIENT_ID"),
            slack_client_secret: std::env::var("SLACK_CLIENT_SECRET").expect("SLACK_CLIENT_SECRET"),
            google_client_id: std::env::var("GOOGLE_CLIENT_ID").expect("GOOGLE_CLIENT_ID"),
            google_client_secret: std::env::var("GOOGLE_CLIENT_SECRET")
                .expect("GOOGLE_CLIENT_SECRET"),
            encryption_key_b64: std::env::var("INTEGRATION_TOKEN_ENCRYPTION_KEY")
                .expect("INTEGRATION_TOKEN_ENCRYPTION_KEY"),
            base_url: std::env::var("BASE_URL").unwrap_or_else(|_| "http://localhost:3012".into()),
            messenger_page_username: std::env::var("MESSENGER_PAGE_USERNAME")
                .unwrap_or_else(|_| "aistaffglobal".into()),
        }
    }
}

pub struct Fanout {
    pub db: PgPool,
    pub smtp: AsyncSmtpTransport<Tokio1Executor>,
    pub smtp_from: String,
}

impl Fanout {
    pub fn new(db: PgPool, smtp: AsyncSmtpTransport<Tokio1Executor>, smtp_from: String) -> Self {
        Self {
            db,
            smtp,
            smtp_from,
        }
    }

    // -------------------------------------------------------------------------
    // Email
    // -------------------------------------------------------------------------

    pub async fn dispatch_email(
        &self,
        recipient_id: Uuid,
        to_address: &str,
        subject: &str,
        body: &str,
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

    // -------------------------------------------------------------------------
    // In-app
    // -------------------------------------------------------------------------

    pub async fn dispatch_in_app(
        &self,
        user_id: Uuid,
        title: &str,
        body: &str,
        event_type: &str,
        priority: &str,
    ) -> Result<()> {
        sqlx::query(
            "INSERT INTO in_app_notifications (id, user_id, title, body, event_type, priority)
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)",
        )
        .bind(user_id)
        .bind(title)
        .bind(body)
        .bind(event_type)
        .bind(priority)
        .execute(&self.db)
        .await?;

        tracing::info!(user_id=%user_id, event_type, "in-app notification created");
        Ok(())
    }

    // -------------------------------------------------------------------------
    // SMS (Twilio)
    // -------------------------------------------------------------------------

    #[allow(dead_code)]
    pub async fn dispatch_sms(&self, phone: &str, body: &str, config: &AppConfig) -> Result<()> {
        let url = format!(
            "https://api.twilio.com/2010-04-01/Accounts/{}/Messages.json",
            config.twilio_account_sid
        );

        let client = reqwest::Client::new();
        let res = client
            .post(&url)
            .basic_auth(&config.twilio_account_sid, Some(&config.twilio_auth_token))
            .form(&[
                ("From", config.twilio_from_number.as_str()),
                ("To", phone),
                ("Body", body),
            ])
            .send()
            .await;

        match res {
            Ok(r) if r.status().is_success() => {
                tracing::info!(phone, "SMS sent via Twilio");
            }
            Ok(r) => {
                tracing::warn!(phone, status=?r.status(), "Twilio SMS non-success status");
            }
            Err(e) => {
                tracing::warn!(phone, error=%e, "Twilio SMS request failed");
            }
        }
        // SMS is best-effort — never fail the fanout on SMS errors.
        Ok(())
    }

    // -------------------------------------------------------------------------
    // Push (FCM)
    // -------------------------------------------------------------------------

    #[allow(dead_code)]
    pub async fn dispatch_push(
        &self,
        device_tokens: &[String],
        title: &str,
        body: &str,
        config: &AppConfig,
    ) -> Result<()> {
        let client = reqwest::Client::new();

        for token in device_tokens {
            let payload = serde_json::json!({
                "to": token,
                "notification": {
                    "title": title,
                    "body":  body,
                }
            });

            let res = client
                .post("https://fcm.googleapis.com/fcm/send")
                .header("Authorization", format!("key={}", config.fcm_server_key))
                .json(&payload)
                .send()
                .await;

            match res {
                Ok(r) if r.status().is_success() => {
                    tracing::info!(token, "push notification sent");
                }
                Ok(r) => {
                    tracing::warn!(token, status=?r.status(), "FCM push non-success status");
                }
                Err(e) => {
                    tracing::warn!(token, error=%e, "FCM push request failed");
                }
            }
        }
        Ok(())
    }

    // -------------------------------------------------------------------------
    // WhatsApp (Twilio WhatsApp API)
    // -------------------------------------------------------------------------

    #[allow(dead_code)]
    pub async fn dispatch_whatsapp(
        &self,
        phone: &str,
        body: &str,
        config: &AppConfig,
    ) -> Result<()> {
        let url = format!(
            "https://api.twilio.com/2010-04-01/Accounts/{}/Messages.json",
            config.twilio_account_sid
        );

        let from = format!("whatsapp:{}", config.twilio_whatsapp_number);
        let to = format!("whatsapp:{phone}");

        let client = reqwest::Client::new();
        let res = client
            .post(&url)
            .basic_auth(&config.twilio_account_sid, Some(&config.twilio_auth_token))
            .form(&[("From", from.as_str()), ("To", to.as_str()), ("Body", body)])
            .send()
            .await;

        match res {
            Ok(r) if r.status().is_success() => {
                tracing::info!(phone, "WhatsApp message sent via Twilio");
            }
            Ok(r) => {
                tracing::warn!(phone, status=?r.status(), "Twilio WhatsApp non-success status");
            }
            Err(e) => {
                tracing::warn!(phone, error=%e, "Twilio WhatsApp request failed");
            }
        }
        Ok(())
    }

    // -------------------------------------------------------------------------
    // Slack (incoming webhook)
    // -------------------------------------------------------------------------

    #[allow(dead_code)]
    pub async fn dispatch_slack(&self, webhook_url: &str, title: &str, body: &str) -> Result<()> {
        let payload = serde_json::json!({
            "text": format!("*{title}*\n{body}")
        });

        let client = reqwest::Client::new();
        let res = client.post(webhook_url).json(&payload).send().await;

        match res {
            Ok(r) if r.status().is_success() => {
                tracing::info!("Slack notification sent");
            }
            Ok(r) => {
                tracing::warn!(status=?r.status(), "Slack webhook non-success status");
            }
            Err(e) => {
                tracing::warn!(error=%e, "Slack webhook request failed");
            }
        }
        Ok(())
    }

    // -------------------------------------------------------------------------
    // Microsoft Teams (incoming webhook — Adaptive Card)
    // -------------------------------------------------------------------------

    #[allow(dead_code)]
    pub async fn dispatch_teams(&self, webhook_url: &str, title: &str, body: &str) -> Result<()> {
        let payload = serde_json::json!({
            "@type":      "MessageCard",
            "@context":   "http://schema.org/extensions",
            "themeColor": "FBBF24",
            "summary":    title,
            "sections": [{
                "activityTitle": title,
                "activityText":  body,
            }]
        });

        let client = reqwest::Client::new();
        let res = client.post(webhook_url).json(&payload).send().await;

        match res {
            Ok(r) if r.status().is_success() => {
                tracing::info!("Teams notification sent");
            }
            Ok(r) => {
                tracing::warn!(status=?r.status(), "Teams webhook non-success status");
            }
            Err(e) => {
                tracing::warn!(error=%e, "Teams webhook request failed");
            }
        }
        Ok(())
    }
}
