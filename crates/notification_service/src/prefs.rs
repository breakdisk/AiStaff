use anyhow::Result;
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct NotifPrefs {
    pub email_enabled: bool,
    pub sms_enabled: bool,
    pub push_enabled: bool,
    pub in_app_enabled: bool,
    pub whatsapp_enabled: bool,
    pub slack_enabled: bool,
    pub teams_enabled: bool,
    pub quiet_hours_start: Option<String>, // "HH:MM"
    pub quiet_hours_end: Option<String>,
    pub quiet_hours_tz: String,
    pub digest_mode: String, // "realtime" | "hourly" | "daily"
}

pub async fn get_prefs(pool: &PgPool, user_id: Uuid) -> Result<NotifPrefs> {
    let row = sqlx::query(
        "SELECT email_enabled, sms_enabled, push_enabled, in_app_enabled,
                whatsapp_enabled, slack_enabled, teams_enabled,
                quiet_hours_start::TEXT, quiet_hours_end::TEXT,
                quiet_hours_tz, digest_mode
         FROM notification_preferences WHERE user_id = $1",
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await?;

    if let Some(r) = row {
        use sqlx::Row;
        Ok(NotifPrefs {
            email_enabled: r.try_get("email_enabled").unwrap_or(true),
            sms_enabled: r.try_get("sms_enabled").unwrap_or(false),
            push_enabled: r.try_get("push_enabled").unwrap_or(false),
            in_app_enabled: r.try_get("in_app_enabled").unwrap_or(true),
            whatsapp_enabled: r.try_get("whatsapp_enabled").unwrap_or(false),
            slack_enabled: r.try_get("slack_enabled").unwrap_or(false),
            teams_enabled: r.try_get("teams_enabled").unwrap_or(false),
            quiet_hours_start: r.try_get("quiet_hours_start").ok().flatten(),
            quiet_hours_end: r.try_get("quiet_hours_end").ok().flatten(),
            quiet_hours_tz: r.try_get("quiet_hours_tz").unwrap_or_else(|_| "UTC".into()),
            digest_mode: r
                .try_get("digest_mode")
                .unwrap_or_else(|_| "realtime".into()),
        })
    } else {
        Ok(NotifPrefs {
            email_enabled: true,
            in_app_enabled: true,
            quiet_hours_tz: "UTC".into(),
            digest_mode: "realtime".into(),
            ..Default::default()
        })
    }
}

pub async fn upsert_prefs(pool: &PgPool, user_id: Uuid, p: &NotifPrefs) -> Result<()> {
    sqlx::query(
        "INSERT INTO notification_preferences
             (user_id, email_enabled, sms_enabled, push_enabled, in_app_enabled,
              whatsapp_enabled, slack_enabled, teams_enabled,
              quiet_hours_start, quiet_hours_end, quiet_hours_tz, digest_mode, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,
                 $9::TIME, $10::TIME, $11, $12, NOW())
         ON CONFLICT (user_id) DO UPDATE SET
             email_enabled     = EXCLUDED.email_enabled,
             sms_enabled       = EXCLUDED.sms_enabled,
             push_enabled      = EXCLUDED.push_enabled,
             in_app_enabled    = EXCLUDED.in_app_enabled,
             whatsapp_enabled  = EXCLUDED.whatsapp_enabled,
             slack_enabled     = EXCLUDED.slack_enabled,
             teams_enabled     = EXCLUDED.teams_enabled,
             quiet_hours_start = EXCLUDED.quiet_hours_start,
             quiet_hours_end   = EXCLUDED.quiet_hours_end,
             quiet_hours_tz    = EXCLUDED.quiet_hours_tz,
             digest_mode       = EXCLUDED.digest_mode,
             updated_at        = NOW()",
    )
    .bind(user_id)
    .bind(p.email_enabled)
    .bind(p.sms_enabled)
    .bind(p.push_enabled)
    .bind(p.in_app_enabled)
    .bind(p.whatsapp_enabled)
    .bind(p.slack_enabled)
    .bind(p.teams_enabled)
    .bind(p.quiet_hours_start.as_deref())
    .bind(p.quiet_hours_end.as_deref())
    .bind(&p.quiet_hours_tz)
    .bind(&p.digest_mode)
    .execute(pool)
    .await?;

    Ok(())
}
