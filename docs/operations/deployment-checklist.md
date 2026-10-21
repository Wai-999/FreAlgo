# Deployment checklist

Use this for the first production deploy and for every release. Background for each step is in
`docs/operations/runbook.md`; security context in `docs/security-review.md`.

## A. One-time setup (external gates: these need the operator's accounts)

- [ ] **Hosting**: a Linux host or PaaS with Docker, 2+ vCPU and 4 GB RAM to start, and a
      persistent volume for Postgres. Alternatively, managed Postgres 16+ and Redis 7+
      (`maxmemory-policy noeviction`).
- [ ] **Domain and DNS**: an A/AAAA record for `DOMAIN` pointing at the host; ports 80 and 443
      open (Caddy obtains TLS certificates automatically).
- [ ] **Git remote and CI**: push the repository, confirm `.github/workflows/ci.yml` runs green on
      the hosted runner, and enable branch protection requiring CI.
- [ ] **Secrets** in a secret manager or in host-only `deploy/.env.production` (git-ignored),
      each generated with `openssl rand -base64 48`:
      `POSTGRES_PASSWORD`, `APP_DB_PASSWORD`, `REDIS_PASSWORD`, `SESSION_SECRET`,
      `METRICS_TOKEN`, and optionally `ADMIN_API_TOKEN`.
- [ ] **Identity (optional)**: register an OIDC client (redirect URI
      `https://DOMAIN/api/v1/auth/oidc/callback`) and set `OIDC_ISSUER`, `OIDC_CLIENT_ID`,
      `OIDC_CLIENT_SECRET`. Put the operators' user ids in `ADMIN_USER_IDS`: sign in once, then
      read the id on `/account`.
- [ ] **Off-host backups**: a versioned object-storage bucket and a host cron or systemd timer for
      `scripts/ops/backup.sh` (daily) plus the copy job.
- [ ] **Monitoring**: uptime checks on `/api/v1/health` and `/api/v1/health/freshness`, metrics
      scraping with the bearer token, and the alert rules in `docs/operations/runbook.md` §7.
- [ ] **Privacy notice**: fill in the controller name and contact on `/privacy` for your
      jurisdiction (legal review recommended).
- [ ] **Sources**: for each feed you want live, review the publisher's terms and robots policy,
      then activate it with notes (Admin → Sources, or `npm run sources:activate`). Feeds stay
      paused until then. Record licensed-API keys and costs if you add any provider beyond
      RSS/Atom.

## B. Every release

Before deploying:

- [ ] CI is green on the release commit: format, lint, typecheck, unit, integration, build, e2e,
      dependency audit, and Docker build.
- [ ] Migrations reviewed. Each new migration is additive or has a documented expand/contract
      plan, plus a `prisma/rollbacks/<name>.down.sql` script.
- [ ] Take a fresh backup (`scripts/ops/backup.sh`) and confirm the checksum file exists.
- [ ] Release notes written: what changed, risks, and how to roll back.

Deploy:

- [ ] `docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.production up -d --build`
- [ ] `migrate` exits 0 (`docker compose … logs migrate`); `web` and `worker` report healthy.

Verify:

- [ ] `scripts/ops/smoke.sh https://DOMAIN` prints `SMOKE PASSED`.
- [ ] Response headers on `/` include HSTS, CSP with a nonce, `frame-ancestors 'none'`, and no
      `X-Powered-By`.
- [ ] `/api/v1/metrics` returns 404 from the internet (Caddy blocks it) and works internally
      with the token.
- [ ] `/status` shows the scheduler's last run. Within one schedule window (≤ 3 h 15 min), every
      active feed shows a new attempt, and `frealgo_fetch_success_ratio_24h` stays ≥ 0.8.
- [ ] Spot-check on a phone and a desktop browser: open a country, filter, open an original
      article link, and confirm the 2D fallback works with WebGL disabled.

If something is wrong:

- [ ] Roll back the image (redeploy the previous tag). If a migration must be reverted, follow
      `docs/operations/runbook.md` §4, or restore the pre-deploy backup.

## C. Monthly

- [ ] Restore drill: `scripts/ops/restore-drill.sh` passes; record the result.
- [ ] `npm audit --omit=dev` is clean, or advisories are triaged; update dependencies.
- [ ] Licence audit: `node scripts/ops/license-audit.mjs`; review any newly flagged package.
- [ ] Review stale or errored sources and any open label appeals.
- [ ] Rotate `METRICS_TOKEN` and `ADMIN_API_TOKEN` if they were shared.
