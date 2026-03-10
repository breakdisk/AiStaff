mod common;

use community_service::{
    career,
    handlers::{AssignPathRequest, AwardMilestoneRequest},
};

fn milestone(key: &str, label: &str, xp: i32) -> AwardMilestoneRequest {
    AwardMilestoneRequest {
        milestone_key: key.to_string(),
        label: label.to_string(),
        xp_awarded: Some(xp),
    }
}

#[tokio::test]
async fn milestone_award_creates_career_profile() {
    let ctx = common::TestContext::new().await;
    let user_id = ctx.new_user().await;

    // Profile does not exist yet
    let profile_before = career::get_career_profile(ctx.db(), user_id)
        .await
        .expect("get profile");
    assert!(profile_before.is_none());

    career::award_milestone(
        ctx.db(),
        &ctx.state.kafka_brokers,
        user_id,
        milestone("first_deployment", "First Deployment!", 100),
    )
    .await
    .expect("award milestone");

    // Profile auto-created by ensure_career_profile
    let profile = career::get_career_profile(ctx.db(), user_id)
        .await
        .expect("get profile")
        .expect("profile exists");

    assert_eq!(profile["user_id"].as_str().unwrap(), user_id.to_string());
}

#[tokio::test]
async fn milestone_idempotency_same_key_returns_same_id() {
    let ctx = common::TestContext::new().await;
    let user_id = ctx.new_user().await;

    let id1 = career::award_milestone(
        ctx.db(),
        &ctx.state.kafka_brokers,
        user_id,
        milestone("first_deployment", "First Deployment!", 100),
    )
    .await
    .expect("first award");

    let id2 = career::award_milestone(
        ctx.db(),
        &ctx.state.kafka_brokers,
        user_id,
        milestone("first_deployment", "First Deployment — Updated Label", 100),
    )
    .await
    .expect("second award same key");

    assert_eq!(
        id1, id2,
        "duplicate milestone_key must return the same UUID"
    );

    // Only one row should exist for this key
    let milestones = career::list_milestones(ctx.db(), user_id)
        .await
        .expect("list milestones");
    let matching: Vec<_> = milestones
        .iter()
        .filter(|m| m["milestone_key"] == "first_deployment")
        .collect();
    assert_eq!(
        matching.len(),
        1,
        "exactly one row per (user_id, milestone_key)"
    );
}

#[tokio::test]
async fn milestone_xp_accumulates_across_distinct_keys() {
    let ctx = common::TestContext::new().await;
    let user_id = ctx.new_user().await;

    career::award_milestone(
        ctx.db(),
        &ctx.state.kafka_brokers,
        user_id,
        milestone("first_deployment", "First Deploy", 100),
    )
    .await
    .expect("milestone 1");

    career::award_milestone(
        ctx.db(),
        &ctx.state.kafka_brokers,
        user_id,
        milestone("tier_1_verified", "Identity Verified", 250),
    )
    .await
    .expect("milestone 2");

    let profile = career::get_career_profile(ctx.db(), user_id)
        .await
        .expect("get profile")
        .expect("exists");

    let total_xp = profile["total_xp"].as_i64().expect("total_xp field");
    assert_eq!(total_xp, 350, "total_xp should be 100 + 250");
}

#[tokio::test]
async fn learning_path_completes_at_100_pct() {
    let ctx = common::TestContext::new().await;
    let user_id = ctx.new_user().await;

    let path_id = career::assign_learning_path(
        ctx.db(),
        &ctx.state.kafka_brokers,
        user_id,
        AssignPathRequest {
            title: "Rust Fundamentals".to_string(),
            description: None,
            skill_target: "rust".to_string(),
            steps: serde_json::json!([{"title": "Ownership"}, {"title": "Traits"}]),
        },
    )
    .await
    .expect("assign path");

    // Progress to 100% → completed_at should be set
    career::update_path_progress(ctx.db(), path_id, 100)
        .await
        .expect("update progress");

    let paths = career::list_learning_paths(ctx.db(), user_id)
        .await
        .expect("list paths");
    let path = paths
        .iter()
        .find(|p| p["id"].as_str() == Some(&path_id.to_string()))
        .expect("path in list");

    assert_eq!(path["progress_pct"].as_i64().unwrap(), 100);
    assert!(
        !path["completed_at"].is_null(),
        "completed_at must be set at 100%"
    );
}

#[tokio::test]
async fn learning_path_incomplete_has_no_completed_at() {
    let ctx = common::TestContext::new().await;
    let user_id = ctx.new_user().await;

    let path_id = career::assign_learning_path(
        ctx.db(),
        &ctx.state.kafka_brokers,
        user_id,
        AssignPathRequest {
            title: "Advanced Async Rust".to_string(),
            description: None,
            skill_target: "async-rust".to_string(),
            steps: serde_json::json!([]),
        },
    )
    .await
    .expect("assign path");

    career::update_path_progress(ctx.db(), path_id, 50)
        .await
        .expect("update to 50%");

    let paths = career::list_learning_paths(ctx.db(), user_id)
        .await
        .expect("list paths");
    let path = paths
        .iter()
        .find(|p| p["id"].as_str() == Some(&path_id.to_string()))
        .expect("path in list");

    assert_eq!(path["progress_pct"].as_i64().unwrap(), 50);
    assert!(
        path["completed_at"].is_null(),
        "completed_at must be null below 100%"
    );
}
