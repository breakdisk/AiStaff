use rdkafka::config::ClientConfig;
use rdkafka::consumer::{CommitMode, Consumer, StreamConsumer};
use rdkafka::error::KafkaError;
use rdkafka::Message;
use std::time::Duration;
use tokio::time::sleep;
use tracing::{error, warn};

/// Maximum consecutive transient errors before giving up.
const MAX_TRANSIENT_ERRORS: u32 = 10;

pub struct KafkaConsumer {
    inner: StreamConsumer,
}

impl KafkaConsumer {
    pub fn new(brokers: &str, group_id: &str, topics: &[&str]) -> anyhow::Result<Self> {
        let inner = ClientConfig::new()
            .set("bootstrap.servers", brokers)
            .set("group.id", group_id)
            .set("enable.auto.commit", "false")
            .set("auto.offset.reset", "earliest")
            // Allow rdkafka's internal reconnect logic time to work.
            .set("reconnect.backoff.ms", "500")
            .set("reconnect.backoff.max.ms", "10000")
            .create::<StreamConsumer>()?;

        inner.subscribe(topics)?;
        Ok(Self { inner })
    }

    /// Yields `(key, payload_json)`. Commits offset after each message.
    ///
    /// Transient broker errors (connection refused, transport failure) are
    /// retried with exponential back-off up to [`MAX_TRANSIENT_ERRORS`] times.
    /// Only truly unrecoverable errors return `None`.
    pub async fn next_payload(&self) -> Option<(String, String)> {
        let mut transient_count: u32 = 0;

        loop {
            match self.inner.recv().await {
                Ok(msg) => {
                    transient_count = 0; // reset on success

                    let key = msg
                        .key()
                        .and_then(|k| std::str::from_utf8(k).ok())
                        .unwrap_or("")
                        .to_string();

                    let payload = msg
                        .payload()
                        .and_then(|p| std::str::from_utf8(p).ok())
                        .map(|s| s.to_string());

                    self.inner.commit_message(&msg, CommitMode::Async).ok();

                    match payload {
                        Some(p) => return Some((key, p)),
                        None => warn!("Message with no payload — skipping"),
                    }
                }
                Err(e) => {
                    if is_transient(&e) {
                        transient_count += 1;
                        if transient_count >= MAX_TRANSIENT_ERRORS {
                            error!(
                                error = %e,
                                attempts = transient_count,
                                "Kafka consumer: too many transient errors, giving up"
                            );
                            return None;
                        }
                        // Exponential back-off: 500ms, 1s, 2s, 4s … capped at 10s.
                        let delay_ms = (500u64 * (1 << (transient_count - 1).min(4))).min(10_000);
                        warn!(
                            error = %e,
                            attempt = transient_count,
                            delay_ms,
                            "Kafka consumer transient error — retrying"
                        );
                        sleep(Duration::from_millis(delay_ms)).await;
                    } else {
                        error!(error = %e, "Kafka consumer unrecoverable error");
                        return None;
                    }
                }
            }
        }
    }
}

/// Returns `true` for errors that are safe to retry (broker not yet ready,
/// topic not yet created, transient network blip, etc.).
fn is_transient(e: &KafkaError) -> bool {
    let msg = e.to_string();
    msg.contains("BrokerTransportFailure")
        || msg.contains("Connection refused")
        || msg.contains("Transport failure")
        || msg.contains("All brokers down")
        || msg.contains("Timed out")
        || msg.contains("LeaderNotAvailable")
        || msg.contains("NotLeaderForPartition")
        // Topics are auto-created on first produce; consumers may start first.
        || msg.contains("UnknownTopicOrPartition")
        || msg.contains("Unknown topic or partition")
}
