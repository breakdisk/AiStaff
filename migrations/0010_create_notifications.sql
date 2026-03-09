CREATE TYPE notification_channel AS ENUM ('EMAIL', 'PUSH', 'WEBHOOK');

CREATE TABLE notifications (
    id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient UUID NOT NULL,
    channel   notification_channel NOT NULL,
    subject   TEXT NOT NULL,
    body      TEXT NOT NULL,
    sent_at   TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    error     TEXT
);
