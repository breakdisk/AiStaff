use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct EnvCheckResult {
    pub check_name: String,
    pub passed: bool,
    pub detail: String,
}

/// Runs all pre-flight checks in parallel and returns their results.
pub async fn run_all_checks(
    required_ports: &[u16],
    required_bins: &[&str],
    min_mem_bytes: u64,
) -> Vec<EnvCheckResult> {
    let mut handles = vec![];

    // ── Memory check ──────────────────────────────────────────────────────────
    let min_mem = min_mem_bytes;
    handles.push(tokio::spawn(async move {
        let avail = sys_info::mem_info().map(|m| m.avail * 1024).unwrap_or(0);
        EnvCheckResult {
            check_name: "min_memory".into(),
            passed: avail >= min_mem,
            detail: format!("{avail} bytes available, {min_mem} required"),
        }
    }));

    // ── Port availability checks ──────────────────────────────────────────────
    for &port in required_ports.iter() {
        handles.push(tokio::spawn(async move {
            let addr = format!("127.0.0.1:{port}");
            let available = tokio::net::TcpListener::bind(&addr).await.is_ok();
            EnvCheckResult {
                check_name: format!("port_{port}_available"),
                passed: available,
                detail: if available {
                    format!("port {port} is free")
                } else {
                    format!("port {port} is already in use")
                },
            }
        }));
    }

    // ── Binary availability checks ────────────────────────────────────────────
    for &bin in required_bins.iter() {
        let bin_name = bin.to_string();
        handles.push(tokio::spawn(async move {
            let found = tokio::process::Command::new("which")
                .arg(&bin_name)
                .output()
                .await
                .map(|o| o.status.success())
                .unwrap_or(false);
            EnvCheckResult {
                check_name: format!("binary_{bin_name}"),
                passed: found,
                detail: if found {
                    format!("'{bin_name}' found in PATH")
                } else {
                    format!("'{bin_name}' not found in PATH")
                },
            }
        }));
    }

    let mut results = Vec::with_capacity(handles.len());
    for h in handles {
        if let Ok(r) = h.await {
            results.push(r);
        }
    }
    results
}
