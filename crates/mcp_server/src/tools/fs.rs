//! Filesystem tools — all paths are jail-rooted to `fs_root`.

use anyhow::{bail, Context, Result};
use serde_json::Value;
use std::path::{Path, PathBuf};

/// Resolves `path` relative to `root`, refusing path traversal attempts.
fn safe_join(root: &Path, path: &str) -> Result<PathBuf> {
    let joined = root.join(path);
    let canonical = joined
        .canonicalize()
        .unwrap_or_else(|_| joined.clone()); // allow non-existent for write
    if !canonical.starts_with(root) {
        bail!("Path traversal denied: '{}' escapes sandbox root", path);
    }
    Ok(canonical)
}

/// `filesystem.read_file` — params: `{ "path": "relative/path.txt" }`
pub async fn read_file(root: &Path, params: &Value) -> Result<Value> {
    let rel = params["path"]
        .as_str()
        .context("params.path must be a string")?;
    let abs = safe_join(root, rel)?;
    let content = tokio::fs::read_to_string(&abs)
        .await
        .with_context(|| format!("read_file: {}", abs.display()))?;
    Ok(serde_json::json!({ "content": content, "path": rel }))
}

/// `filesystem.write_file` — params: `{ "path": "...", "content": "..." }`
pub async fn write_file(root: &Path, params: &Value) -> Result<Value> {
    let rel = params["path"]
        .as_str()
        .context("params.path must be a string")?;
    let content = params["content"]
        .as_str()
        .context("params.content must be a string")?;
    let abs = safe_join(root, rel)?;
    if let Some(parent) = abs.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }
    tokio::fs::write(&abs, content)
        .await
        .with_context(|| format!("write_file: {}", abs.display()))?;
    Ok(serde_json::json!({ "written": true, "path": rel }))
}

/// `filesystem.list_dir` — params: `{ "path": "." }`
pub async fn list_dir(root: &Path, params: &Value) -> Result<Value> {
    let rel = params["path"].as_str().unwrap_or(".");
    let abs = safe_join(root, rel)?;
    let mut entries = tokio::fs::read_dir(&abs)
        .await
        .with_context(|| format!("list_dir: {}", abs.display()))?;

    let mut names = Vec::new();
    while let Ok(Some(entry)) = entries.next_entry().await {
        if let Some(name) = entry.file_name().to_str() {
            names.push(name.to_string());
        }
    }
    Ok(serde_json::json!({ "entries": names, "path": rel }))
}
