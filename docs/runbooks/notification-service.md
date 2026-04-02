# Runbook: notification_service (Kafka consumer — no HTTP port)

## Service Overview
Consumes notification events from Kafka and fans out to delivery channels: SMTP email (lettre),
SMS/WhatsApp (Twilio), push notifications (FCM), and Slack webhooks. Writes delivery status to
the `notifications` table. No inbound HTTP — health is inferred from Kafka consumer lag.

## Health Check
```bash
# No HTTP endpoint. Check Kafka consumer lag via CLI:
docker compose exec kafka kafka-consumer-groups.sh \
  --bootstrap-server kafka:9092 \
  --describe \
  --group notification-service-notifications-group
# Expected: LAG = 0 or near-zero on all partitions

# Check recent delivery activity:
docker compose logs --tail=50 notification-service
# Verify: recent "notification delivered" log lines
```

## Key Environment Variables
- `DATABASE_URL` — Postgres connection
- `KAFKA_BROKERS` — Kafka broker list
- `RUST_LOG` — Tracing filter (e.g. `info,sqlx=warn`)
- `SMTP_HOST` / `SMTP_PORT` / `SMTP_FROM` — lettre SMTP config
- `SMTP_USERNAME` / `SMTP_PASSWORD` — SMTP auth credentials
- `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` — Twilio REST API credentials
- `TWILIO_FROM_NUMBER` — E.164 sender number for SMS/WhatsApp
- `FCM_SERVER_KEY` — Firebase Cloud Messaging server key
- `SLACK_WEBHOOK_URL` — Slack incoming webhook for internal alerts

## Common Issues

### Emails Not Delivered
```
Symptom: notifications table shows status='PENDING' or status='FAILED' for email channel
Check:   docker compose logs -f notification-service | grep "smtp"
         Verify SMTP_HOST:SMTP_PORT is reachable: nc -zv $SMTP_HOST $SMTP_PORT
Fix:     Check SMTP credentials. Confirm SMTP_FROM is an authorized sender on the SMTP provider.
         If TLS negotiation fails, verify SMTP_PORT is 587 (STARTTLS) or 465 (TLS).
```

### Twilio SMS/WhatsApp Failures
```
Symptom: Logs show Twilio error code 21211 or 21608
Check:   TWILIO_FROM_NUMBER is E.164 format and enabled for the target channel (SMS vs WhatsApp).
         WhatsApp requires a pre-approved template for outbound messages.
Fix:     For WhatsApp: use an approved template message. Verify TWILIO_FROM_NUMBER is
         WhatsApp-enabled in the Twilio console. For SMS: confirm destination number country
         is covered by the account's geo permissions.
```

### Kafka Consumer Lag Growing
```
Symptom: Consumer group LAG continuously increases; notifications backed up
Check:   docker compose logs -f notification-service | grep "error\|panic\|timeout"
         Check if an external delivery call (SMTP/Twilio/FCM) is timing out and blocking.
Fix:     All external calls have 5s timeout. If a channel is degraded, the service will
         log and mark status='FAILED' and continue. Restart if consumer loop is deadlocked:
         docker compose restart notification-service
```

### FCM Push Not Delivered
```
Symptom: No push notification received; logs show FCM 401 or 403
Check:   FCM_SERVER_KEY is the legacy server key (not the OAuth2 credential).
Fix:     Rotate FCM_SERVER_KEY in the Google Cloud Console. Update the secret and restart.
         Confirm device FCM token in notifications row is current (tokens expire).
```

## Restart Procedure
```bash
docker compose restart notification-service
docker compose logs -f notification-service
# Verify: "notification_service consumer started" and no ERROR lines at startup
```

## Database Tables
- `notifications` — `id` (UUID v7), `recipient_id`, `channel` (email/sms/push/slack),
  `subject`, `body`, `status` (PENDING/SENT/FAILED), `sent_at`, `created_at`
