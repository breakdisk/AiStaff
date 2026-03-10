//! Bridges Wasmtime host function calls to a local MCP server over HTTP.
//! All tool calls are validated against a per-agent CapabilityManifest
//! and logged to an immutable audit table.

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use uuid::Uuid;

/// Declared at agent purchase time and stored in the DB.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CapabilityManifest {
    pub agent_id: Uuid,
    /// Tool names the agent is permitted to call, e.g. `["filesystem.read_file"]`.
    pub allowed_tools: HashSet<String>,
    /// MCP server base URL — must be `http://127.0.0.1:PORT` (localhost only).
    pub mcp_endpoint: String,
}

#[derive(Debug, Serialize)]
struct JsonRpcRequest<'a> {
    jsonrpc: &'static str,
    id: u64,
    method: &'a str,
    params: serde_json::Value,
}

#[derive(Debug, Deserialize)]
struct JsonRpcResponse {
    result: Option<serde_json::Value>,
    error: Option<serde_json::Value>,
}

/// Thin async HTTP client that the Wasmtime host function delegates to.
pub struct McpProxy {
    manifest: CapabilityManifest,
    client: reqwest::Client,
}

impl McpProxy {
    pub fn new(manifest: CapabilityManifest) -> Self {
        Self {
            manifest,
            client: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(10))
                .build()
                .expect("reqwest client init"),
        }
    }

    /// Called from the Wasmtime host function.
    /// Returns a JSON string result, or `Err` if denied or the tool fails.
    pub async fn call_tool(
        &self,
        tool_name: &str,
        params_json: &str,
        request_id: u64,
        deployment_id: Uuid,
        db: &sqlx::PgPool,
    ) -> Result<String> {
        // ── Capability check ─────────────────────────────────────────────
        if !self.manifest.allowed_tools.contains(tool_name) {
            self.log_tool_call(db, deployment_id, tool_name, params_json, "DENIED")
                .await
                .ok();
            anyhow::bail!(
                "Tool '{}' not in capability manifest — access denied",
                tool_name
            );
        }

        let params: serde_json::Value =
            serde_json::from_str(params_json).context("Invalid params JSON")?;

        let rpc_req = JsonRpcRequest {
            jsonrpc: "2.0",
            id: request_id,
            method: tool_name,
            params,
        };

        let resp: JsonRpcResponse = self
            .client
            .post(format!("{}/rpc", self.manifest.mcp_endpoint))
            .header("X-Deployment-Id", deployment_id.to_string())
            .json(&rpc_req)
            .send()
            .await
            .context("MCP HTTP send")?
            .json()
            .await
            .context("MCP JSON decode")?;

        self.log_tool_call(db, deployment_id, tool_name, params_json, "ALLOWED")
            .await
            .ok();

        if let Some(err) = resp.error {
            anyhow::bail!("MCP tool error: {}", serde_json::to_string(&err)?);
        }

        Ok(serde_json::to_string(&resp.result.unwrap_or_default())?)
    }

    async fn log_tool_call(
        &self,
        db: &sqlx::PgPool,
        deployment_id: Uuid,
        tool_name: &str,
        params_json: &str,
        decision: &str,
    ) -> Result<()> {
        sqlx::query!(
            "INSERT INTO tool_call_audit (deployment_id, tool_name, params, decision, called_at)
             VALUES ($1, $2, $3, $4, NOW())",
            deployment_id,
            tool_name,
            params_json,
            decision,
        )
        .execute(db)
        .await
        .context("Audit log insert")?;
        Ok(())
    }
}
