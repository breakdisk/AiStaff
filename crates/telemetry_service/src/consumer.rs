use crate::drift_detector::DriftDetector;
use anyhow::Result;
use common::events::{EventEnvelope, TelemetryHeartbeat};
use common::kafka::consumer::KafkaConsumer;

pub struct TelemetryConsumer {
    consumer: KafkaConsumer,
    detector: DriftDetector,
}

impl TelemetryConsumer {
    pub fn new(consumer: KafkaConsumer, detector: DriftDetector) -> Self {
        Self { consumer, detector }
    }

    pub async fn run(self) -> Result<()> {
        tracing::info!("telemetry consumer started");
        loop {
            let (key, payload) = match self.consumer.next_payload().await {
                Some(p) => p,
                None => break,
            };

            let envelope = match serde_json::from_str::<EventEnvelope>(&payload) {
                Ok(e) => e,
                Err(e) => {
                    tracing::warn!(key=%key, error=%e, "bad envelope");
                    continue;
                }
            };

            if envelope.event_type == "TelemetryHeartbeat" {
                match serde_json::from_value::<TelemetryHeartbeat>(envelope.payload) {
                    Ok(hb) => {
                        if let Err(e) = self.detector.process_heartbeat(hb).await {
                            tracing::error!(error=%e, "heartbeat processing error");
                        }
                    }
                    Err(e) => tracing::warn!(error=%e, "failed to parse heartbeat"),
                }
            }
        }
        Ok(())
    }
}
