use crate::events::EventEnvelope;
use rdkafka::config::ClientConfig;
use rdkafka::producer::{FutureProducer, FutureRecord};
use std::time::Duration;
use tracing::{info, instrument};

#[derive(Clone)]
pub struct KafkaProducer {
    inner: FutureProducer,
}

impl KafkaProducer {
    pub fn new(brokers: &str) -> anyhow::Result<Self> {
        let inner = ClientConfig::new()
            .set("bootstrap.servers", brokers)
            .set("message.timeout.ms", "5000")
            .set("acks", "all")
            .create::<FutureProducer>()?;
        Ok(Self { inner })
    }

    #[instrument(skip(self, envelope), fields(event_type = %envelope.event_type))]
    pub async fn publish(
        &self,
        topic:    &str,
        key:      &str,
        envelope: &EventEnvelope,
    ) -> anyhow::Result<()> {
        let payload = serde_json::to_string(envelope)?;
        let record = FutureRecord::to(topic).key(key).payload(&payload);

        self.inner
            .send(record, Duration::from_secs(5))
            .await
            .map_err(|(e, _)| anyhow::anyhow!("Kafka send error: {e}"))?;

        info!(topic, key, "Event published");
        Ok(())
    }
}
