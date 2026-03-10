mod common;

use community_service::{handlers::CheckinRequest, wellbeing};

// ── Burnout formula: (avg_stress * 1.5 + (10 - avg_mood) * 0.5) * 5 ──────────
// Risk levels:  0-29=low  30-59=medium  60-79=high  80+=critical

#[tokio::test]
async fn burnout_low_risk() {
    let ctx = common::TestContext::new().await;
    let user_id = ctx.new_user().await;

    // stress=1, mood=10 → (1*1.5 + 0*0.5)*5 = 7 → low
    wellbeing::submit_checkin(
        ctx.db(),
        &ctx.state.kafka_brokers,
        user_id,
        CheckinRequest {
            mood_score: 10,
            energy_score: 8,
            stress_score: 1,
            notes: None,
        },
    )
    .await
    .expect("submit checkin");

    let signal = wellbeing::get_burnout_signal(ctx.db(), user_id)
        .await
        .expect("get signal")
        .expect("signal created");

    assert_eq!(signal["risk_level"], "low");
    let score = signal["risk_score"].as_i64().expect("risk_score");
    assert!(score < 30, "expected score < 30, got {score}");
}

#[tokio::test]
async fn burnout_medium_risk() {
    let ctx = common::TestContext::new().await;
    let user_id = ctx.new_user().await;

    // stress=5, mood=5 → (5*1.5 + 5*0.5)*5 = 50 → medium
    wellbeing::submit_checkin(
        ctx.db(),
        &ctx.state.kafka_brokers,
        user_id,
        CheckinRequest {
            mood_score: 5,
            energy_score: 5,
            stress_score: 5,
            notes: None,
        },
    )
    .await
    .expect("submit checkin");

    let signal = wellbeing::get_burnout_signal(ctx.db(), user_id)
        .await
        .expect("get signal")
        .expect("signal created");

    assert_eq!(signal["risk_level"], "medium");
    let score = signal["risk_score"].as_i64().expect("risk_score");
    assert!((30..60).contains(&score), "expected 30-59, got {score}");
}

#[tokio::test]
async fn burnout_high_risk() {
    let ctx = common::TestContext::new().await;
    let user_id = ctx.new_user().await;

    // stress=7, mood=3 → (7*1.5 + 7*0.5)*5 = (10.5+3.5)*5 = 70 → high
    wellbeing::submit_checkin(
        ctx.db(),
        &ctx.state.kafka_brokers,
        user_id,
        CheckinRequest {
            mood_score: 3,
            energy_score: 4,
            stress_score: 7,
            notes: None,
        },
    )
    .await
    .expect("submit checkin");

    let signal = wellbeing::get_burnout_signal(ctx.db(), user_id)
        .await
        .expect("get signal")
        .expect("signal created");

    assert_eq!(signal["risk_level"], "high");
    let score = signal["risk_score"].as_i64().expect("risk_score");
    assert!((60..80).contains(&score), "expected 60-79, got {score}");
}

#[tokio::test]
async fn burnout_critical_risk() {
    let ctx = common::TestContext::new().await;
    let user_id = ctx.new_user().await;

    // stress=10, mood=1 → (10*1.5 + 9*0.5)*5 = (15+4.5)*5 = 97 → critical
    wellbeing::submit_checkin(
        ctx.db(),
        &ctx.state.kafka_brokers,
        user_id,
        CheckinRequest {
            mood_score: 1,
            energy_score: 2,
            stress_score: 10,
            notes: None,
        },
    )
    .await
    .expect("submit checkin");

    let signal = wellbeing::get_burnout_signal(ctx.db(), user_id)
        .await
        .expect("get signal")
        .expect("signal created");

    assert_eq!(signal["risk_level"], "critical");
    let score = signal["risk_score"].as_i64().expect("risk_score");
    assert!(score >= 80, "expected score >= 80, got {score}");
}

#[tokio::test]
async fn burnout_escalation_sets_last_alert_at() {
    let ctx = common::TestContext::new().await;
    let user_id = ctx.new_user().await;

    // Step 1: low-stress checkin → no alert
    wellbeing::submit_checkin(
        ctx.db(),
        &ctx.state.kafka_brokers,
        user_id,
        CheckinRequest {
            mood_score: 9,
            energy_score: 9,
            stress_score: 1,
            notes: None,
        },
    )
    .await
    .expect("low checkin");

    let sig = wellbeing::get_burnout_signal(ctx.db(), user_id)
        .await
        .expect("get")
        .expect("exists");
    assert_eq!(sig["risk_level"], "low");
    assert!(sig["last_alert_at"].is_null(), "no alert for low risk");

    // Step 2: flood with high-stress checkins → 7-day average tilts critical
    // avg after 6 checkins (1 low + 5 critical):
    //   avg_stress ≈ (1+10*5)/6 ≈ 8.5, avg_mood ≈ (9+1*5)/6 ≈ 2.3
    //   score ≈ (8.5*1.5 + 7.7*0.5)*5 ≈ (12.75+3.85)*5 = 83 → critical
    for _ in 0..5 {
        wellbeing::submit_checkin(
            ctx.db(),
            &ctx.state.kafka_brokers,
            user_id,
            CheckinRequest {
                mood_score: 1,
                energy_score: 1,
                stress_score: 10,
                notes: None,
            },
        )
        .await
        .expect("high-stress checkin");
    }

    let sig_after = wellbeing::get_burnout_signal(ctx.db(), user_id)
        .await
        .expect("get")
        .expect("exists");
    assert!(
        matches!(sig_after["risk_level"].as_str(), Some("high" | "critical")),
        "expected high/critical, got {}",
        sig_after["risk_level"]
    );
    assert!(
        !sig_after["last_alert_at"].is_null(),
        "last_alert_at must be set after escalation"
    );
}

#[tokio::test]
async fn burnout_no_alert_on_sustained_critical() {
    let ctx = common::TestContext::new().await;
    let user_id = ctx.new_user().await;

    // Establish critical state via 3 high-stress checkins
    for _ in 0..3 {
        wellbeing::submit_checkin(
            ctx.db(),
            &ctx.state.kafka_brokers,
            user_id,
            CheckinRequest {
                mood_score: 1,
                energy_score: 1,
                stress_score: 10,
                notes: None,
            },
        )
        .await
        .expect("critical checkin");
    }

    let alert_time_1 = wellbeing::get_burnout_signal(ctx.db(), user_id)
        .await
        .expect("get")
        .expect("exists")["last_alert_at"]
        .clone();

    assert!(
        !alert_time_1.is_null(),
        "alert should be set on first escalation"
    );

    // Another critical checkin: prev was already critical → no new alert,
    // so last_alert_at must NOT change.
    wellbeing::submit_checkin(
        ctx.db(),
        &ctx.state.kafka_brokers,
        user_id,
        CheckinRequest {
            mood_score: 1,
            energy_score: 1,
            stress_score: 10,
            notes: None,
        },
    )
    .await
    .expect("sustained critical checkin");

    let alert_time_2 = wellbeing::get_burnout_signal(ctx.db(), user_id)
        .await
        .expect("get")
        .expect("exists")["last_alert_at"]
        .clone();

    assert_eq!(
        alert_time_1, alert_time_2,
        "last_alert_at must not change when risk was already critical"
    );
}

#[tokio::test]
async fn list_checkins_returns_up_to_30() {
    let ctx = common::TestContext::new().await;
    let user_id = ctx.new_user().await;

    for i in 0..5_i16 {
        wellbeing::submit_checkin(
            ctx.db(),
            &ctx.state.kafka_brokers,
            user_id,
            CheckinRequest {
                mood_score: 5 + i % 3,
                energy_score: 6,
                stress_score: 3,
                notes: None,
            },
        )
        .await
        .expect("insert checkin");
    }

    let checkins = wellbeing::list_checkins(ctx.db(), user_id)
        .await
        .expect("list");
    assert_eq!(checkins.len(), 5);
}
