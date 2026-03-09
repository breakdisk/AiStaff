use rdkafka::config::ClientConfig;
use rdkafka::consumer::{CommitMode, Consumer, StreamConsumer};
use rdkafka::Message;
use tracing::{error, warn};

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
            .create::<StreamConsumer>()?;

        inner.subscribe(topics)?;
        Ok(Self { inner })
    }

    /// Yields `(key, payload_json)`. Commits offset after each message.
    /// Returns `None` only on unrecoverable consumer error.
    pub async fn next_payload(&self) -> Option<(String, String)> {
        loop {
            match self.inner.recv().await {
                Ok(msg) => {
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
                    error!("Kafka consumer error: {e}");
                    return None;
                }
            }
        }
    }
}
