# Deployment — Mr Wallet

Front (`apps/web`) on Vercel, API (`apps/api`) + Postgres on a VPS behind Caddy (auto HTTPS), database optionally on Neon if you'd rather not manage Postgres yourself.

---

## 1. Prerequisites

- A domain name (e.g. purchased at LWS, OVH, doesn't matter the registrar)
- A VPS (Hetzner CX22 or less is enough — 2 vCPU / 4 GB RAM is plenty for api+postgres alone; 2 GB is enough even if Postgres is elsewhere, e.g. Neon)
- Ubuntu 24.04 LTS on the VPS
- A Vercel account
- (Optional) A Neon account if you don't want to host Postgres yourself

---

## 2. DNS

At your registrar, add an **A** record:

```
api.yourdomain.com  →  <VPS IP>
```

Propagation: a few minutes to a few hours. Check with `dig api.yourdomain.com` or `nslookup`.

The HTTPS certificate (step 5) will fail as long as this DNS hasn't propagated.

---

## 3. Generate secrets

Locally or on the VPS:

```bash
openssl rand -base64 48   # → JWT_SECRET
openssl rand -base64 32   # → IP_HASH_SALT
```

VAPID keys (push notifications, optional — leaving them empty just disables push):

```bash
cd apps/api
npx web-push generate-vapid-keys
```

Keep these values aside, they go into `.env` in step 6.

---

## 4. Prepare the VPS

```bash
ssh root@<VPS-IP>

# Docker
curl -fsSL https://get.docker.com | sh

# Clone the repo
git clone <repo-url>
cd budget_manager
```

---

## 5. Configure `.env`

```bash
cp .env.prod.example .env
nano .env
```

Fill in:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Neon connection URL (**unpooled** variant, not the one with PgBouncer) |
| `JWT_SECRET` | value generated in step 3 |
| `IP_HASH_SALT` | value generated in step 3 |
| `CORS_ORIGIN` | Vercel URL of the front, e.g. `https://your-app.vercel.app` |
| `API_DOMAIN` | `api.yourdomain.com` |
| `NEXT_PUBLIC_API_URL` | `https://api.yourdomain.com/api/v1` (only matters if you build `web` yourself — otherwise it's the same value to set in Vercel, see step 8) |
| `VAPID_*` | values generated in step 3, or leave empty |

If you'd rather host Postgres yourself instead of Neon: uncomment `POSTGRES_USER/PASSWORD/DB` in `.env`, set `DATABASE_URL=postgresql://user:password@postgres:5432/db?schema=public` (host `postgres` = compose service name), and launch with `--profile local-db` (see step 6).

---

## 6. Launch the stack

Front hosted on Vercel, DB on Neon (standard case):

```bash
docker compose -f docker-compose.prod.yml --env-file .env up -d --build api caddy
```

With self-hosted Postgres (instead of Neon):

```bash
docker compose -f docker-compose.prod.yml --env-file .env --profile local-db up -d --build
```

Front self-hosted too (add `web` to the command used):

```bash
docker compose -f docker-compose.prod.yml --env-file .env up -d --build api caddy web
```

Caddy automatically fetches the Let's Encrypt certificate for `API_DOMAIN` on startup (DNS must already be pointing to the VPS, see step 2). The API is no longer exposed directly on port 3000 — only via Caddy over HTTPS.

On first startup, the API applies Prisma migrations automatically (`prisma migrate deploy`, see `apps/api/Dockerfile`).

---

## 7. Verify the API

```bash
curl -i https://api.yourdomain.com/api/v1/currencies
```

Should respond `200 OK` with JSON (empty list if the database isn't seeded yet — normal, no system currencies = no accounts can be created until seeded, see step 7bis).

### 7bis. Seed currencies (once)

```bash
docker compose -f docker-compose.prod.yml --env-file .env exec api npm run prisma:seed
```

---

## 8. Deploy the front on Vercel

1. vercel.com → **Add New Project** → import the GitHub repo
2. **Root Directory**: `apps/web`
3. **Environment Variables**:
   - `NEXT_PUBLIC_API_URL` = `https://api.yourdomain.com/api/v1`
4. **Deploy**
5. (Optional) Add your own front domain in Project Settings → Domains

If the Vercel URL changes (new project, custom domain different from the value set in `CORS_ORIGIN`), go back to the VPS and fix `CORS_ORIGIN` in `.env`, then:

```bash
docker compose -f docker-compose.prod.yml --env-file .env up -d --build api
```

---

## 9. Final check

- Open the Vercel app in the browser
- Create an account (`/register`)
- Verify that login/logout works (refresh cookie `secure: true` — only works over HTTPS, so only via the Vercel URL/domain, never by accessing the API directly over HTTP)
- Create a bank account, a transaction — confirm the CRUD screens work end to end

---

## Later updates

```bash
cd budget_manager
git pull
docker compose -f docker-compose.prod.yml --env-file .env up -d --build postgres api caddy
```

Prisma migrations apply automatically when the `api` container restarts. The Vercel front redeploys automatically on every push (if connected to the repo).

---

## What isn't handled here

- Postgres backups (if you're not using Neon, which handles them natively) — set up separately (`pg_dump` cron, or switch to Neon)
- Monitoring/alerting (uptime, logs) — nothing configured, add as needed
- `npm audit` — dependency vulnerabilities not audited here, check before real production deployment
