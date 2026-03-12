# Runbook: Production Deployment

> Service: All (full-stack)
> Severity scope: P0 risk — follow every step in order.
> Last updated: 2026-03-12

---

## Prerequisites

| Item | Minimum |
|---|---|
| Server | 4 vCPU, 8 GB RAM, 80 GB SSD (Ubuntu 22.04 LTS) |
| Domain | DNS A record pointing to server IP |
| Docker | 24+ with Compose v2 plugin |
| Ports open | 80, 443 (inbound); 22 (SSH, restricted to your IP) |

---

## 1. Server bootstrap

```bash
# Update packages
sudo apt-get update && sudo apt-get upgrade -y

# Install Docker Engine
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker

# Install Nginx + Certbot
sudo apt-get install -y nginx certbot python3-certbot-nginx

# Clone repository
git clone https://github.com/breakdisk/AiStaff.git /opt/aistaff
cd /opt/aistaff
```

---

## 2. Environment variables

Create `/opt/aistaff/.env` — **never commit this file**:

```bash
cat > /opt/aistaff/.env << 'ENVEOF'
# ── Database ──────────────────────────────────────────────────────────────────
POSTGRES_USER=aistaff
POSTGRES_PASSWORD=<strong-random-password>
POSTGRES_DB=aistaff
DATABASE_URL=postgresql://aistaff:<password>@postgres:5432/aistaff

# ── Kafka ─────────────────────────────────────────────────────────────────────
KAFKA_BROKERS=kafka:9092

# ── Auth.js (NextAuth v5) ──────────────────────────────────────────────────────
NEXTAUTH_SECRET=<32-byte-base64-random>        # openssl rand -base64 32
NEXTAUTH_URL=https://<your-domain.com>

# ── OAuth providers ───────────────────────────────────────────────────────────
GITHUB_CLIENT_ID=<prod-github-client-id>
GITHUB_CLIENT_SECRET=<prod-github-client-secret>
GOOGLE_CLIENT_ID=<prod-google-client-id>
GOOGLE_CLIENT_SECRET=<prod-google-client-secret>
LINKEDIN_CLIENT_ID=<prod-linkedin-client-id>
LINKEDIN_CLIENT_SECRET=<prod-linkedin-client-secret>

# ── JWT signing (RS256) ───────────────────────────────────────────────────────
JWT_PRIVATE_KEY=<base64-encoded-RS256-PEM-private-key>
JWT_PUBLIC_KEY=<base64-encoded-RS256-PEM-public-key>

# ── Services ──────────────────────────────────────────────────────────────────
RUST_LOG=info,sqlx=warn

# ── SMTP (Mailhog in dev; real SMTP in prod) ──────────────────────────────────
SMTP_HOST=<smtp.yourprovider.com>
SMTP_PORT=587
SMTP_FROM=noreply@<your-domain.com>

# ── Wasm + ZKP (Phase 2) ─────────────────────────────────────────────────────
WASM_PLUGIN_DIR=/opt/aistaff/plugins
ZKP_VERIFIER_KEY=<base64-groth16-verifier-key>
MCP_FS_ROOT=/opt/aistaff/mcp
PLATFORM_DID=did:web:<your-domain.com>
ENVEOF
```

Generate secrets:

```bash
# NEXTAUTH_SECRET
openssl rand -base64 32

# RS256 key pair for service-to-service JWT
openssl genrsa -out jwt_private.pem 2048
openssl rsa -in jwt_private.pem -pubout -out jwt_public.pem
base64 -w0 jwt_private.pem   # → JWT_PRIVATE_KEY
base64 -w0 jwt_public.pem    # → JWT_PUBLIC_KEY
rm jwt_private.pem jwt_public.pem   # never leave on disk
```

Register secrets in `docs/secret-registry.md` (names only, no values).

---

## 3. OAuth callback URLs (update in provider consoles)

| Provider | Authorized redirect URI |
|---|---|
| GitHub | `https://<your-domain.com>/api/auth/callback/github` |
| Google | `https://<your-domain.com>/api/auth/callback/google` |
| LinkedIn | `https://<your-domain.com>/api/auth/callback/linkedin` |

> **Critical:** Update `NEXTAUTH_URL` in `.env` to `https://<your-domain.com>` before deploying.
> Auth.js constructs the callback URI from `NEXTAUTH_URL`. A mismatch causes `redirect_uri` errors.

---

## 4. Nginx reverse proxy + TLS

```bash
# Initial config (HTTP only — certbot will rewrite to HTTPS)
sudo tee /etc/nginx/sites-available/aistaff << 'NGEOF'
server {
    listen 80;
    server_name <your-domain.com>;

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
NGEOF

sudo ln -s /etc/nginx/sites-available/aistaff /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# Issue TLS certificate (Let's Encrypt)
sudo certbot --nginx -d <your-domain.com> --non-interactive --agree-tos \
  -m admin@<your-domain.com>

# Auto-renew (certbot installs a systemd timer; verify it)
sudo systemctl status certbot.timer
```

After certbot runs, Nginx config will have HTTPS redirect and HSTS injected.
Manually add HSTS preload header to the HTTPS server block:

```nginx
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
```

---

## 5. docker-compose production overrides

Create `/opt/aistaff/docker-compose.prod.yml`:

```yaml
# Production overrides — merged on top of docker-compose.yml
# Usage: docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

services:
  web:
    build:
      args:
        # Use production service names (same as dev — Docker networking)
        IDENTITY_SERVICE_URL: http://identity-service:3001
        MARKETPLACE_SERVICE_URL: http://marketplace-service:3002
        CHECKLIST_SERVICE_URL: http://checklist-service:3003
        LICENSE_SERVICE_URL: http://license-service:3004
        MATCHING_SERVICE_URL: http://matching-service:3005
        COMPLIANCE_SERVICE_URL: http://compliance-service:3006
        TELEMETRY_SERVICE_URL: http://telemetry-service:3007
        ANALYTICS_SERVICE_URL: http://analytics-service:3008
        REPUTATION_SERVICE_URL: http://reputation-service:3009
        PAYOUT_SERVICE_URL: http://payout-service:3010
        COMMUNITY_SERVICE_URL: http://community-service:3011
        NOTIFICATION_SERVICE_URL: http://notification-service:3012
    restart: always

  postgres:
    restart: always
    volumes:
      - postgres_data:/var/lib/postgresql/data   # named volume for persistence

  kafka:
    restart: always

  zookeeper:
    restart: always

  # Remove mailhog in production — use real SMTP via notification_service
  mailhog:
    profiles: ["dev"]   # only starts with --profile dev

volumes:
  postgres_data:
    external: false
```

---

## 6. Run DB migrations

```bash
cd /opt/aistaff

# Start only Postgres first
docker compose up -d postgres
sleep 5

# Install sqlx-cli (once)
cargo install sqlx-cli --no-default-features --features postgres

# Run all migrations
DATABASE_URL="postgresql://aistaff:<password>@localhost:5432/aistaff" \
  sqlx migrate run --source migrations/
```

---

## 7. Build and deploy

```bash
cd /opt/aistaff

# Build all images (sequential to avoid OOM — 4 GB Docker Desktop limit)
docker compose -f docker-compose.yml -f docker-compose.prod.yml build --no-cache

# Start infra first, wait for healthy
docker compose up -d postgres zookeeper kafka
docker compose ps   # wait until kafka shows (healthy)

# Start all services
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Tail logs to confirm startup
docker compose logs -f --tail=50
```

---

## 8. Smoke test checklist

Run after every deploy:

- [ ] `curl -s https://<domain>/api/auth/session` returns `{}` (not an error)
- [ ] `https://<domain>/login` loads — GitHub / Google / LinkedIn buttons visible
- [ ] Sign in with Google → lands on `/onboarding` (new user) or `/dashboard`
- [ ] `https://<domain>/marketplace` loads listings
- [ ] `docker compose ps` — all containers show `Up` or `Up (healthy)`
- [ ] `docker compose logs identity-service | tail -20` — no FATAL errors
- [ ] HSTS header present: `curl -I https://<domain> | grep Strict`
- [ ] TLS grade A: https://www.ssllabs.com/ssltest/

---

## 9. Rollback procedure

```bash
cd /opt/aistaff

# Stop current deploy
docker compose down

# Revert to previous commit
git log --oneline -10          # find the target SHA
git checkout <previous-sha>

# Rebuild and redeploy
docker compose -f docker-compose.yml -f docker-compose.prod.yml build
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

> **Database:** Migrations are append-only and irreversible. If a migration must be
> reverted, write a new forward migration — never edit or drop committed migrations.

---

## 10. Ongoing maintenance

| Task | Frequency | Command |
|---|---|---|
| Rotate DB credentials | 30 days | Update `.env`, restart services |
| Renew TLS cert | Automatic | `systemctl status certbot.timer` |
| `cargo audit` | Before every release | CI gate enforces this |
| Pull latest images | Per deploy | `docker compose pull` (for base images) |
| Prune old Docker layers | Weekly | `docker system prune -f` |
| Check disk usage | Weekly | `df -h && docker system df` |
