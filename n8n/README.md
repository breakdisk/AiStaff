# n8n Automation Workflows — AiStaff

All workflow JSON exports are version-controlled here. Import via n8n UI: Workflows → Import from file.

---

## Trigger Map

| Workflow | Trigger | Output |
|---|---|---|
| `new-listing-social-distribution.json` | POST webhook from internal API on new listing publish | LinkedIn draft post + X/Twitter thread + Facebook draft post |
| `weekly-tiktok-script.json` | Schedule: every Monday 09:00 UTC | TikTok script draft posted to Slack #marketing |
| `github-release-announcement.json` | Webhook: GitHub release published event | LinkedIn post + YouTube community post + Slack #releases notification |

---

## Webhook Secret Setup

Webhook secrets are stored exclusively in the n8n credential store. Never put secret values in workflow JSON files.

1. Open n8n → Settings → Credentials → New Credential → Header Auth
2. Name the credential exactly as referenced in the workflow notes
3. Set the header name to `X-Webhook-Secret`
4. Set the value to the secret (generate with `openssl rand -hex 32`)
5. Reference the credential in the webhook node: Authentication → Header Auth

For the GitHub release webhook:
- Set the secret in GitHub: repository → Settings → Webhooks → Secret field
- Store the same value in n8n credential store under "GitHub Release Webhook Secret"

---

## Channel Mapping

| n8n Credential Name | Platform | Account |
|---|---|---|
| `AiStaff LinkedIn` | LinkedIn OAuth 2.0 | linkedin.com/company/aistaff |
| `AiStaff Twitter` | X/Twitter OAuth 2.0 | @aistaff |
| `AiStaff Facebook` | Facebook Graph API | facebook.com/aistaffglobal |
| `AiStaff YouTube` | YouTube OAuth 2.0 | AiStaff — Future Workforce channel |
| `AiStaff Slack Internal` | Slack API | Internal workspace #marketing + #releases |

---

## Importing Workflows into n8n

1. Open n8n UI (default: http://localhost:5678)
2. Navigate to Workflows in the sidebar
3. Click the three-dot menu → Import from file
4. Select the JSON file from `n8n/workflows/`
5. Review all credential references — each will show as "not configured" until you create the credential in Settings → Credentials
6. Set the workflow to Active only after all credentials are configured and a test run succeeds

---

## Internal API Proxy Note

All HTTP Request nodes call `https://aistaffglobal.com` public endpoints — not internal service ports (3001–3010, 4040). This ensures workflows function identically in development (with ngrok or Cloudflare Tunnel) and production without port-mapping changes.

The MCP server at `127.0.0.1:4040` is intentionally not exposed to n8n — it is localhost-only by design and not accessible from the n8n container network.

---

## Webhook Endpoint Configuration

After importing workflows, n8n generates webhook URLs in the format:
```
https://your-n8n-instance.com/webhook/new-listing
https://your-n8n-instance.com/webhook/github-release
```

Register these URLs:
- **New listing webhook**: configure in the AiStaff internal API deployment pipeline (post-publish step)
- **GitHub release webhook**: GitHub repository → Settings → Webhooks → Add webhook → select "Releases" event

---

## Security Notes

- All social API credentials use OAuth 2.0 flows managed by n8n — no long-lived tokens in workflow JSON
- Webhook secrets validate that requests originate from trusted sources
- Facebook posts are created as DRAFT (`published: false`) — require manual review before publishing
- LinkedIn posts use DRAFT `lifecycleState` for the social distribution workflow — approve via LinkedIn Campaign Manager before going live
- The weekly TikTok script workflow posts to Slack for human review — it does not auto-publish to any social platform
