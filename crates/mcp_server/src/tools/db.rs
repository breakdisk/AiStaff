//! Database read-only query tool.
//! Only SELECT statements are permitted — any DML is rejected.

use anyhow::{bail, Context, Result};
use serde_json::Value;
use sqlx::PgPool;

/// `database.query` — params: `{ "sql": "SELECT ...", "args": [] }`
///
/// Security: rejects any SQL that is not a read-only SELECT.
pub async fn query(pool: &PgPool, params: &Value) -> Result<Value> {
    let sql = params["sql"]
        .as_str()
        .context("params.sql must be a string")?
        .trim();

    // Reject non-SELECT statements — simple but effective for audit compliance.
    let upper = sql.to_uppercase();
    if !upper.starts_with("SELECT") {
        bail!("Only SELECT statements are permitted in database.query");
    }
    for forbidden in &["INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "TRUNCATE"] {
        if upper.contains(forbidden) {
            bail!("Statement contains forbidden keyword: {forbidden}");
        }
    }

    // Execute as an untyped query and return rows as JSON
    let rows = sqlx::query(sql)
        .fetch_all(pool)
        .await
        .context("database.query execution")?;

    let json_rows: Vec<Value> = rows
        .iter()
        .map(|row| {
            use sqlx::{Column, Row};
            let cols = row.columns();
            let mut map = serde_json::Map::new();
            for col in cols {
                let val: Option<String> = row.try_get(col.name()).unwrap_or(None);
                map.insert(col.name().to_string(), val.into());
            }
            Value::Object(map)
        })
        .collect();

    Ok(serde_json::json!({ "rows": json_rows, "count": json_rows.len() }))
}
