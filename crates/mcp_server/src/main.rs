//! MCP Server — Model Context Protocol JSON-RPC 2.0 endpoint.
//!
//! Security:
//! - Binds to 127.0.0.1 ONLY — never externally reachable.
//! - All filesystem paths are jail-rooted to `MCP_FS_ROOT`.
//! - Database queries are restricted to read-only SELECT statements.

use std::{path::PathBuf, sync::Arc};

use axum::{extract::State, routing::post, Json, Router};
use dotenvy::dotenv;
use serde::{Deserialize, Serialize};
use sqlx::postgres::PgPoolOptions;
use tokio::net::TcpListener;
use tracing_subscriber::{fmt, EnvFilter};

mod tools;

#[derive(Clone)]
struct AppState {
    fs_root: PathBuf,
    db:      sqlx::PgPool,
}

#[derive(Debug, Deserialize)]
struct JsonRpcRequest {
    #[allow(dead_code)]
    jsonrpc: String,
    id:      serde_json::Value,
    method:  String,
    params:  serde_json::Value,
}

#[derive(Debug, Serialize)]
struct JsonRpcResponse {
    jsonrpc: &'static str,
    id:      serde_json::Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    result:  Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error:   Option<JsonRpcError>,
}

#[derive(Debug, Serialize)]
struct JsonRpcError {
    code:    i32,
    message: String,
}

async fn rpc_handler(
    State(state): State<Arc<AppState>>,
    headers:      axum::http::HeaderMap,
    Json(req):    Json<JsonRpcRequest>,
) -> Json<JsonRpcResponse> {
    // Extract deployment context for server-side audit trail
    let deployment_id = headers
        .get("X-Deployment-Id")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| uuid::Uuid::parse_str(s).ok());

    let method = req.method.clone();

    let result = match req.method.as_str() {
        "filesystem.read_file"  => tools::fs::read_file(&state.fs_root, &req.params).await,
        "filesystem.write_file" => tools::fs::write_file(&state.fs_root, &req.params).await,
        "filesystem.list_dir"   => tools::fs::list_dir(&state.fs_root, &req.params).await,
        "database.query"        => tools::db::query(&state.db, &req.params).await,
        unknown => Err(anyhow::anyhow!("Method not found: {unknown}")),
    };

    // Server-side audit log — independent of the proxy-side ALLOWED/DENIED record.
    // Fire-and-forget: audit failure never blocks the response.
    if let Some(dep_id) = deployment_id {
        let decision = if result.is_ok() { "SERVER_EXECUTED" } else { "SERVER_ERROR" };
        let db = state.db.clone();
        tokio::spawn(async move {
            let _ = sqlx::query(
                "INSERT INTO tool_call_audit (deployment_id, tool_name, params, decision, called_at)
                 VALUES ($1, $2, $3, $4, NOW())",
            )
            .bind(dep_id)
            .bind(&method)
            .bind("{}")
            .bind(decision)
            .execute(&db)
            .await;
        });
    }

    match result {
        Ok(val) => Json(JsonRpcResponse {
            jsonrpc: "2.0",
            id:      req.id,
            result:  Some(val),
            error:   None,
        }),
        Err(e) => Json(JsonRpcResponse {
            jsonrpc: "2.0",
            id:      req.id,
            result:  None,
            error:   Some(JsonRpcError {
                code:    -32603,
                message: e.to_string(),
            }),
        }),
    }
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenv().ok();
    fmt().with_env_filter(EnvFilter::from_default_env()).json().init();

    let db_url  = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    let fs_root = std::env::var("MCP_FS_ROOT")
        .unwrap_or_else(|_| "/tmp/agent-workspace".into());

    let db = PgPoolOptions::new()
        .max_connections(5)
        .connect(&db_url)
        .await?;

    let state = Arc::new(AppState {
        fs_root: PathBuf::from(&fs_root),
        db,
    });

    let app = Router::new()
        .route("/rpc", post(rpc_handler))
        .with_state(state);

    // CRITICAL: bind to localhost only — this server MUST NOT be reachable externally.
    let addr = "127.0.0.1:4040";
    tracing::info!("MCP server on {addr} (localhost only)");
    let listener = TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}
