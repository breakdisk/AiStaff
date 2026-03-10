//! Wasmtime sandbox provisioning for AiStaff agents.
//! Credentials are injected exclusively via host functions — never via env vars
//! or Wasm linear memory at init time.
//! MCP tool calls are gated by a per-agent CapabilityManifest.

use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
};

use anyhow::Result;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use wasmtime::{Config, Engine, Extern, Linker, Module, ResourceLimiter, Store};

use common::errors::DomainError;

use crate::mcp_proxy::McpProxy;

/// An AI agent bundle purchased from the marketplace.
#[derive(Debug, Clone)]
pub struct AiAgent {
    pub id: Uuid,
    #[allow(dead_code)] // used in future manifest logging
    pub name: String,
    pub wasm_bytes: Vec<u8>,
    /// Pre-computed SHA-256 hex of `wasm_bytes` — set on upload, verified on deploy.
    pub artifact_hash: String,
}

/// Client credentials injected into the sandbox via host functions.
/// Map keys are credential names (e.g. `"db_url"`, `"api_key"`).
#[derive(Debug, Clone)]
pub struct ClientCredentials {
    #[allow(dead_code)] // used for future per-tenant credential lookup
    pub client_id: Uuid,
    pub secrets: HashMap<String, String>,
}

/// Result returned after sandbox provisioning completes.
#[derive(Debug, Serialize, Deserialize)]
pub struct DeploymentResult {
    pub deployment_id: Uuid,
    pub sandbox_id: Uuid,
    pub agent_id: Uuid,
    pub status: DeploymentStatus,
    pub artifact_hash: String,
    pub provisioned_at: chrono::DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum DeploymentStatus {
    Provisioned,
    Failed,
}

/// Host-side state carried into the Wasm instance via `Store<HostState>`.
struct HostState {
    credentials: Arc<HashMap<String, String>>,
    limiter: SandboxResourceLimiter,
    proxy: Option<Arc<McpProxy>>,
    db: sqlx::PgPool,
    deployment_id: Uuid,
    rpc_seq: Arc<AtomicU64>,
}

/// Provisions a Wasmtime sandbox, injects credentials via host functions,
/// runs the agent's `_start` entry point, and returns a `DeploymentResult`.
///
/// Security invariants:
/// - Credentials never appear in Wasm linear memory before the host function is called.
/// - A finite fuel budget prevents infinite-loop agents from blocking the thread.
/// - Memory growth is bounded by `SandboxResourceLimiter`.
/// - MCP tool calls are validated against `proxy.manifest.allowed_tools` before dispatch.
pub async fn provision_sandbox(
    agent: AiAgent,
    credentials: ClientCredentials,
    deployment_id: Uuid,
    db: sqlx::PgPool,
    proxy: Option<McpProxy>,
) -> Result<DeploymentResult, DomainError> {
    let sandbox_id = Uuid::new_v4();

    // ── Engine configuration ──────────────────────────────────────────────
    let mut config = Config::new();
    config.consume_fuel(true); // fuel metering — prevents runaway agents (async always on in v42+)

    let engine = Engine::new(&config).map_err(|e| DomainError::SandboxError {
        reason: e.to_string(),
    })?;

    // ── Module compilation ────────────────────────────────────────────────
    let module =
        Module::new(&engine, &agent.wasm_bytes).map_err(|e| DomainError::SandboxError {
            reason: format!("compile: {e}"),
        })?;

    // ── Host state — credentials live here, not in Wasm memory ───────────
    let creds_arc = Arc::new(credentials.secrets);
    let proxy_arc = proxy.map(Arc::new);
    let rpc_seq = Arc::new(AtomicU64::new(0));

    let host_state = HostState {
        credentials: Arc::clone(&creds_arc),
        limiter: SandboxResourceLimiter,
        proxy: proxy_arc,
        db,
        deployment_id,
        rpc_seq,
    };

    let mut store = Store::new(&engine, host_state);
    store
        .set_fuel(1_000_000_000) // 1 billion instructions ≈ generous timeout
        .map_err(|e| DomainError::SandboxError {
            reason: e.to_string(),
        })?;
    store.limiter(|state| &mut state.limiter as &mut dyn ResourceLimiter);

    // ── Host function definitions ─────────────────────────────────────────
    let mut linker: Linker<HostState> = Linker::new(&engine);

    // `host::get_credential(key_ptr, key_len, buf_ptr, buf_len) -> i32`
    // Returns bytes written, or -1 on error. ONLY way the agent reads credentials.
    linker
        .func_wrap_async(
            "host",
            "get_credential",
            |mut caller: wasmtime::Caller<'_, HostState>,
             (key_ptr, key_len, buf_ptr, buf_len): (i32, i32, i32, i32)| {
                Box::new(async move {
                    let mem = match caller.get_export("memory") {
                        Some(Extern::Memory(m)) => m,
                        _ => return -1i32,
                    };

                    // Read credential key from Wasm linear memory
                    let key = {
                        let data = mem.data(&caller);
                        let start = key_ptr as usize;
                        let end = start.saturating_add(key_len as usize);
                        if end > data.len() {
                            return -1i32;
                        }
                        match std::str::from_utf8(&data[start..end]) {
                            Ok(s) => s.to_string(),
                            Err(_) => return -1i32,
                        }
                    };

                    // Credential lookup — only permitted keys are served
                    let value = match caller.data().credentials.get(&key) {
                        Some(v) => v.clone(),
                        None => return -1i32,
                    };

                    let val_bytes = value.as_bytes();
                    if val_bytes.len() > buf_len as usize {
                        return -1i32;
                    }

                    // Write credential value into Wasm linear memory
                    let data = mem.data_mut(&mut caller);
                    let start = buf_ptr as usize;
                    data[start..start + val_bytes.len()].copy_from_slice(val_bytes);
                    val_bytes.len() as i32
                })
            },
        )
        .map_err(|e| DomainError::SandboxError {
            reason: e.to_string(),
        })?;

    // `host::call_mcp_tool(tool_ptr, tool_len, params_ptr, params_len, buf_ptr, buf_len) -> i32`
    // Validates the capability manifest, dispatches to the MCP server, writes JSON result.
    // Returns bytes written into the output buffer, or -1 on denied/error.
    linker
        .func_wrap_async(
            "host",
            "call_mcp_tool",
            |mut caller: wasmtime::Caller<'_, HostState>,
             (tool_ptr, tool_len, params_ptr, params_len, buf_ptr, buf_len): (
                i32,
                i32,
                i32,
                i32,
                i32,
                i32,
            )| {
                Box::new(async move {
                    let mem = match caller.get_export("memory") {
                        Some(Extern::Memory(m)) => m,
                        _ => return -1i32,
                    };

                    // Read tool name from Wasm linear memory
                    let tool_name = {
                        let data = mem.data(&caller);
                        let start = tool_ptr as usize;
                        let end = start.saturating_add(tool_len as usize);
                        if end > data.len() {
                            return -1i32;
                        }
                        match std::str::from_utf8(&data[start..end]) {
                            Ok(s) => s.to_string(),
                            Err(_) => return -1i32,
                        }
                    };

                    // Read params JSON from Wasm linear memory
                    let params_json = {
                        let data = mem.data(&caller);
                        let start = params_ptr as usize;
                        let end = start.saturating_add(params_len as usize);
                        if end > data.len() {
                            return -1i32;
                        }
                        match std::str::from_utf8(&data[start..end]) {
                            Ok(s) => s.to_string(),
                            Err(_) => return -1i32,
                        }
                    };

                    // Clone state needed for the async call — no borrows held during await
                    let proxy = caller.data().proxy.clone();
                    let db = caller.data().db.clone();
                    let dep_id = caller.data().deployment_id;
                    let seq = caller.data().rpc_seq.fetch_add(1, Ordering::Relaxed);

                    let Some(proxy) = proxy else {
                        return -1i32;
                    };

                    let result = match proxy
                        .call_tool(&tool_name, &params_json, seq, dep_id, &db)
                        .await
                    {
                        Ok(r) => r,
                        Err(_) => return -1i32,
                    };

                    let result_bytes = result.as_bytes();
                    if result_bytes.len() > buf_len as usize {
                        return -1i32;
                    }

                    // Write result into Wasm linear memory
                    let data = mem.data_mut(&mut caller);
                    let start = buf_ptr as usize;
                    data[start..start + result_bytes.len()].copy_from_slice(result_bytes);
                    result_bytes.len() as i32
                })
            },
        )
        .map_err(|e| DomainError::SandboxError {
            reason: e.to_string(),
        })?;

    // ── Instantiate and run ───────────────────────────────────────────────
    let instance = linker
        .instantiate_async(&mut store, &module)
        .await
        .map_err(|e| DomainError::SandboxError {
            reason: format!("instantiate: {e}"),
        })?;

    if let Ok(func) = instance.get_typed_func::<(), ()>(&mut store, "_start") {
        func.call_async(&mut store, ())
            .await
            .map_err(|e| DomainError::SandboxError {
                reason: format!("run: {e}"),
            })?;
    }

    Ok(DeploymentResult {
        deployment_id,
        sandbox_id,
        agent_id: agent.id,
        status: DeploymentStatus::Provisioned,
        artifact_hash: agent.artifact_hash,
        provisioned_at: Utc::now(),
    })
}

/// Bounds memory growth — prevents agents from allocating unbounded memory.
struct SandboxResourceLimiter;

impl ResourceLimiter for SandboxResourceLimiter {
    fn memory_growing(
        &mut self,
        _current: usize,
        desired: usize,
        _maximum: Option<usize>,
    ) -> Result<bool, wasmtime::Error> {
        const MAX_BYTES: usize = 256 * 1024 * 1024; // 256 MiB hard cap
        Ok(desired <= MAX_BYTES)
    }

    fn table_growing(
        &mut self,
        _current: usize,
        _desired: usize,
        _maximum: Option<usize>,
    ) -> Result<bool, wasmtime::Error> {
        Ok(true)
    }
}
