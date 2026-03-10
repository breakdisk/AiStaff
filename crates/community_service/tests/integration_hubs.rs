mod common;

use community_service::{handlers::CreateHubRequest, hub_service};
use uuid::Uuid;

fn hub_req(owner_id: Uuid, slug: &str, name: &str) -> CreateHubRequest {
    CreateHubRequest {
        owner_id,
        slug: slug.to_string(),
        name: name.to_string(),
        description: Some("Integration test hub".to_string()),
        category: Some("general".to_string()),
        timezone: Some("UTC".to_string()),
        is_private: Some(false),
    }
}

#[tokio::test]
async fn hub_create_and_get() {
    let ctx = common::TestContext::new().await;
    let owner_id = ctx.new_user().await;
    let slug = format!("test-hub-{}", Uuid::new_v4().as_simple());

    let hub_id = hub_service::create_hub(ctx.db(), hub_req(owner_id, &slug, "Test Hub"))
        .await
        .expect("create hub");

    let hub = hub_service::get_hub(ctx.db(), hub_id)
        .await
        .expect("get hub")
        .expect("hub exists");

    assert_eq!(hub["id"].as_str().unwrap(), hub_id.to_string());
    assert_eq!(hub["slug"].as_str().unwrap(), slug);
    assert_eq!(hub["name"].as_str().unwrap(), "Test Hub");
    assert_eq!(hub["owner_id"].as_str().unwrap(), owner_id.to_string());
}

#[tokio::test]
async fn hub_owner_auto_membered_on_create() {
    let ctx = common::TestContext::new().await;
    let owner_id = ctx.new_user().await;
    let slug = format!("auto-member-{}", Uuid::new_v4().as_simple());

    let hub_id = hub_service::create_hub(ctx.db(), hub_req(owner_id, &slug, "Auto Member Hub"))
        .await
        .expect("create hub");

    // member_count starts at 0 in the INSERT; owner membership row exists but
    // the counter is separate — verify the membership row was inserted
    let member_count: i64 = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM hub_memberships WHERE hub_id = $1 AND user_id = $2",
    )
    .bind(hub_id)
    .bind(owner_id)
    .fetch_one(ctx.db())
    .await
    .expect("count members");

    assert_eq!(member_count, 1, "owner should be auto-added as a member");
}

#[tokio::test]
async fn hub_join_increments_member_count() {
    let ctx = common::TestContext::new().await;
    let owner_id = ctx.new_user().await;
    let member_id = ctx.new_user().await;
    let slug = format!("join-hub-{}", Uuid::new_v4().as_simple());

    let hub_id = hub_service::create_hub(ctx.db(), hub_req(owner_id, &slug, "Join Test Hub"))
        .await
        .expect("create hub");

    let before = hub_service::get_hub(ctx.db(), hub_id)
        .await
        .expect("get")
        .expect("exists")["member_count"]
        .as_i64()
        .unwrap();

    hub_service::join_hub(ctx.db(), hub_id, member_id)
        .await
        .expect("join hub");

    let after = hub_service::get_hub(ctx.db(), hub_id)
        .await
        .expect("get")
        .expect("exists")["member_count"]
        .as_i64()
        .unwrap();

    assert_eq!(
        after,
        before + 1,
        "member_count must increment by 1 after join"
    );
}

#[tokio::test]
async fn hub_leave_decrements_member_count() {
    let ctx = common::TestContext::new().await;
    let owner_id = ctx.new_user().await;
    let member_id = ctx.new_user().await;
    let slug = format!("leave-hub-{}", Uuid::new_v4().as_simple());

    let hub_id = hub_service::create_hub(ctx.db(), hub_req(owner_id, &slug, "Leave Test Hub"))
        .await
        .expect("create hub");

    hub_service::join_hub(ctx.db(), hub_id, member_id)
        .await
        .expect("join");

    let after_join = hub_service::get_hub(ctx.db(), hub_id)
        .await
        .expect("get")
        .expect("exists")["member_count"]
        .as_i64()
        .unwrap();

    hub_service::leave_hub(ctx.db(), hub_id, member_id)
        .await
        .expect("leave");

    let after_leave = hub_service::get_hub(ctx.db(), hub_id)
        .await
        .expect("get")
        .expect("exists")["member_count"]
        .as_i64()
        .unwrap();

    assert_eq!(
        after_leave,
        after_join - 1,
        "member_count must decrement after leave"
    );
}

#[tokio::test]
async fn hub_owner_cannot_leave() {
    let ctx = common::TestContext::new().await;
    let owner_id = ctx.new_user().await;
    let slug = format!("owner-leave-{}", Uuid::new_v4().as_simple());

    let hub_id = hub_service::create_hub(ctx.db(), hub_req(owner_id, &slug, "Owner Leave Hub"))
        .await
        .expect("create hub");

    hub_service::join_hub(ctx.db(), hub_id, owner_id)
        .await
        .expect("join (idempotent — owner already exists)");

    let before = hub_service::get_hub(ctx.db(), hub_id)
        .await
        .expect("get")
        .expect("exists")["member_count"]
        .as_i64()
        .unwrap();

    // leave_hub skips deletion when role = 'owner', so member_count is unchanged
    hub_service::leave_hub(ctx.db(), hub_id, owner_id)
        .await
        .expect("leave attempt");

    let after = hub_service::get_hub(ctx.db(), hub_id)
        .await
        .expect("get")
        .expect("exists")["member_count"]
        .as_i64()
        .unwrap();

    assert_eq!(
        before, after,
        "owner cannot leave — member_count must be unchanged"
    );
}
