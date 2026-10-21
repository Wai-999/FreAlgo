# Operations runbook

## 1. Topology

| Service        | Image target                 | Scales                                                   | State                                           |
| -------------- | ---------------------------- | -------------------------------------------------------- | ----------------------------------------------- |
| `web`          | `web` (Next.js standalone)   | Horizontally; stateless (sessions are signed cookies)    | none                                            |
| `worker`       | `worker` (bundled Node)      | Horizontally; schedulers are cluster-wide and idempotent | none                                            |
| `migrate`      | `migrate`                    | One-shot per deploy                                      | none                                            |
| `postgres` 17  | official                     | Vertically / managed service                             | **all durable data**                            |
| `redis` 8      | official (`noeviction`, AOF) | Single node                                              | queues, locks, rate-limit windows (rebuildable) |
| `caddy` (prod) | official                     | One                                                      | TLS certificates                                |

Web and worker deploy independently. A worker outage only delays fetching; pages keep serving
stored stories and the freshness page shows the gap.

## 2. Environments and configuration

All configuration comes from environment variables, validated at startup by `lib/env.ts`. A bad
configuration fails fast with a list of problems.

| Variable                              | Required in prod      | Notes                                                                        |
| ------------------------------------- | --------------------- | ---------------------------------------------------------------------------- |
| `APP_BASE_URL`                        | yes                   | `https://…` origin; enables HSTS and upgrade-insecure-requests               |
| `DATABASE_URL`                        | yes                   | App role (least privilege) in prod                                           |
| `REDIS_URL`                           | yes                   | Include the password in prod                                                 |
| `SESSION_SECRET`                      | yes                   | ≥ 32 chars; the built-in local fallback is rejected on non-localhost origins |
| `ADMIN_API_TOKEN`                     | optional              | ≥ 32 chars; enables bearer-token admin API                                   |
| `ADMIN_USER_IDS`                      | optional              | Comma-separated session user ids allowed into `/admin`                       |
| `AUTH_DEV_LOGIN`                      | must be false         | Refused automatically on non-localhost origins                               |
| `OIDC_ISSUER/CLIENT_ID/CLIENT_SECRET` | optional              | External identity provider (external gate)                                   |
| `SEED_FIXTURES`, `SHOW_FIXTURES`      | false                 | Fixture data is for development and demos only                               |
| `INGEST_CRON`                         | default `0 */3 * * *` | Scheduled attempts, UTC                                                      |
| `METRICS_TOKEN`                       | recommended           | Enables `/api/v1/metrics` (web)                                              |
| `RATE_LIMIT_SCALE`                    | **never in prod**     | Multiplies rate limits; for controlled load tests only                       |

Generate secrets with `openssl rand -base64 48`. Store them in your secret manager or in a
host-only `deploy/.env.production` (git-ignored). Rotate `SESSION_SECRET` to invalidate all
sessions, and `ADMIN_API_TOKEN` and `METRICS_TOKEN` independently.

## 3. Deploy (production recipe)

**One command (Ubuntu server reachable over SSH, DNS pointing at it):**

```bash
scripts/ops/deploy-remote.sh <server-ip> <domain>      # e.g. 203.0.113.10 frealgo.duckdns.org
```

It runs `scripts/ops/server-setup.sh` on the server. That script is idempotent, so re-run it for
every release. It installs Docker, opens ports 80/443 in the host firewall, pulls `main` from
GitHub, generates secrets once into `deploy/.env.production` (mode 600, never printed), builds and
starts the stack, applies the owner-approved activations from `deploy/source-activations.json`,
triggers a first fetch, and finally runs the smoke test against `https://<domain>`. Verified end
to end on 2026-10-21 against a local run of the production stack (`SKIP_SYSTEM=1`). Secrets live
only on the server: read them with `ssh … cat /opt/frealgo/deploy/.env.production` when needed.

**Manual equivalent:**

```bash
cp deploy/env.production.example deploy/.env.production    # fill in real values
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.production up -d --build
scripts/ops/smoke.sh https://$DOMAIN
```

The `migrate` job runs `prisma migrate deploy` (as the owner role) followed by the idempotent seed
(reference data plus the paused real-source registry; fixtures disabled). `web` and `worker` wait
for it to succeed. To roll out a new version, rebuild and `up -d`: Compose replaces containers
after `migrate` finishes. Follow `docs/deployment-checklist.md`.

Hosting on a PaaS works the same way. Build the `web` and `worker` targets as separate services,
run the `migrate` target as a release command, and provide managed Postgres 16+ and Redis 7+
with `noeviction`. Never run the scheduler inside a serverless or sleeping web process: the worker
must be an always-on process.

## 4. Migrations and rollback

- Create migrations with `npm run db:migrate` (dev), commit `prisma/migrations/*`, and apply them
  with `prisma migrate deploy` (the `migrate` job).
- Keep migrations additive (expand → migrate code → contract) so web and worker versions can
  overlap during a rollout.
- Every migration has a reviewed rollback script in `prisma/rollbacks/<migration>.down.sql`.
  Prisma has no automatic down migrations. To roll back:
  1. Take a backup (§5).
  2. Stop `web` and `worker`.
  3. Run the down script with `psql`.
  4. `DELETE FROM "_prisma_migrations" WHERE migration_name = '<name>';`
  5. Deploy the previous image.
  6. Smoke test.
- If anything is uncertain, restore the pre-deploy backup instead.

## 5. Backups and restore

- **Backup.** `scripts/ops/backup.sh [dir]` writes a compressed `pg_dump` custom-format file plus
  a SHA-256 checksum. Schedule it daily on the host (cron or systemd timer) with
  `COMPOSE_FILE=deploy/docker-compose.prod.yml`, and copy the output off-host (object storage
  with versioning). Keep 7 daily, 4 weekly and 6 monthly copies.
- **Restore.** `scripts/ops/restore.sh <file> [target-db]` verifies the checksum and restores into
  a scratch database by default. It refuses to overwrite `frealgo` unless explicitly confirmed.
- **Drill.** `scripts/ops/restore-drill.sh` backs up, restores into a scratch DB, compares
  per-table row counts and migration state, and drops the scratch DB. Run it monthly and after
  schema changes. The last result is recorded in `docs/release-report.md`.
- **Redis** holds no irreplaceable data. After a loss, the worker re-registers its schedulers at
  boot and the next tick enqueues everything that is due.

## 6. Source operations

| Task                                  | How                                                                                                                                                                                                                                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Review terms and activate a feed      | Admin console → Sources → "Activate…" (records notes), or `npm run sources:activate -- --slug <outlet> --reviewer "<name>" --notes "<terms summary>"`                                                                                                                                 |
| Check a feed without storing anything | `npm run sources:dry-run -- --slug <outlet>`                                                                                                                                                                                                                                          |
| Pause a feed                          | Admin console, or `npm run sources:activate -- --slug <outlet> --pause`                                                                                                                                                                                                               |
| Re-fetch now                          | Admin console "Re-fetch now" or `POST /api/v1/admin/sources/:id/refetch`                                                                                                                                                                                                              |
| Circuit open (status ERROR)           | Read `lastError` in the admin console, fix the cause (URL moved, robots, terms), then "Reset circuit" (→ PAUSED) and re-activate                                                                                                                                                      |
| **Publisher takedown**                | Pause the feed; for each affected story `POST /api/v1/admin/articles/:id/status {"status":"REMOVED","reason":"Publisher takedown <ref>"}`; reply to the publisher. Target: within 72 h. Removed stories disappear from every page and API immediately and never come back on re-fetch |
| Label change or appeal                | `PATCH /api/v1/admin/outlets/:id/label` with methodology, source URL and reason. History is appended automatically. Resolve the appeal in the admin console                                                                                                                           |
| Quarantine review                     | Admin console → Quarantine: dismiss bad items, release or remove quarantined stories                                                                                                                                                                                                  |

## 7. Monitoring and alerting

Endpoints: web `/api/v1/health/live`, `/api/v1/health` (DB + Redis), `/api/v1/health/freshness`,
`/api/v1/metrics` (Bearer `METRICS_TOKEN`); worker `:9464/healthz` and `:9464/metrics`
(internal only).

| Alert             | Condition                                                                                               | First response                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Web down          | readiness non-200 for 5 min                                                                             | Check DB connectivity and container logs                                   |
| Scheduler stalled | no `IngestionRun` with `trigger=schedule` in the last 4 h (`lastScheduledRunAt` on `/health/freshness`) | Check worker health and Redis; restart the worker (schedulers re-register) |
| Fetch success low | `frealgo_fetch_success_ratio_24h < 0.8`                                                                 | Admin → runs; look for a common error code (network, robots, 403)          |
| Sources stale     | `frealgo_sources_by_freshness{state="stale"} > 0` for 6 h                                               | Inspect those sources; publishers sometimes move feeds                     |
| DLQ growing       | `frealgo_dlq_jobs` increases                                                                            | Inspect DLQ entries (`frealgo-ingest-dlq`); fix and re-fetch               |
| Queue backlog     | `frealgo_queue_jobs{state="waiting"} > 200` for 30 min                                                  | Scale workers; check per-host limits                                       |
| API latency       | p95 of `frealgo_api_request_duration_ms` > 500 ms (cached reads)                                        | Check DB load and slow-query log; EXPLAIN (see `docs/performance.md`)      |
| WebGL failures    | `frealgo_client_events_7d{event="webgl_unavailable"}` share rising                                      | Usually a browser change; the 2D fallback keeps working                    |

Logs are structured JSON (pino) on stdout and contain no IPs, cookies or request bodies. Ship
them to your log store with 30-day retention.

**SLOs** (validate under real load): read API p95 < 500 ms when cached, LCP < 2.5 s on mid-range
mobile, and 99 % of active feeds attempted within their 3-hour window plus 15 minutes.

## 8. Data retention

The daily maintenance job (04:17 UTC) deletes:

- `IngestionRun` and `IngestionQuarantine` older than `RETENTION_DAYS` (90);
- `AdminAuditLog` older than 4 × `RETENTION_DAYS`;
- client counters older than 400 days.

It also purges label-appeal contact emails 30 days after resolution. Articles are kept until
removed; add an article-retention policy if storage becomes a concern.

## 9. Incidents

1. **Assess.** Check `/api/v1/health`, the freshness page and recent deploys.
2. **Mitigate.**
   - Bad deploy: roll back to the previous image (§4).
   - Bad source: pause it.
   - Abuse: lower rate limits or block at the proxy.
3. **Communicate.** For an outage of the public instance, put a short note on the status page.
4. **Learn.** Write a short post-incident note in the repository.

## 10. Rate limiting behind proxies

Rate-limit keys are a salted, daily-rotating hash of the client address from `X-Forwarded-For`,
which Caddy sets in the production recipe. Without a proxy, requests may share a bucket. Never
expose the web container directly with a client-controlled `X-Forwarded-For`; put it behind the
proxy.
