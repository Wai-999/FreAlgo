#!/bin/sh
# Release verification: observe the real scheduler + worker ingesting real publisher feeds end to
# end, against the THROWAWAY test database (DATABASE_URL_TEST, must end in _test). Never touches
# the development or production database.
#
#   scripts/ops/observe-scheduler.sh [minutes]     (default 3)
#
# Steps: reset test schema → migrate → seed reference data + real registry (no fixtures) →
# record a verification terms note on 3 feeds in that throwaway DB → run the worker with a
# 1-minute cron and an isolated queue prefix → report scheduled runs, articles and freshness.
set -eu
MINUTES="${1:-3}"
# Read only what we need from .env (it is not valid shell: e.g. INGEST_CRON contains spaces).
TEST_URL="${DATABASE_URL_TEST:-$(grep '^DATABASE_URL_TEST=' .env 2>/dev/null | cut -d= -f2-)}"
[ -n "$TEST_URL" ] || { echo "DATABASE_URL_TEST is required" >&2; exit 2; }
case "$TEST_URL" in *_test\?*|*_test) ;; *) echo "DATABASE_URL_TEST must point at a *_test database" >&2; exit 2;; esac
PREFIX="observe-$(date +%s)"

echo "== reset + migrate + seed (test DB)"
docker compose exec -T postgres psql -U frealgo -d frealgo_test -q -c 'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;'
DATABASE_URL="$TEST_URL" npx prisma migrate deploy >/dev/null
DATABASE_URL="$TEST_URL" SEED_FIXTURES=false node --env-file-if-exists=.env --import tsx prisma/seed.ts
DATABASE_URL="$TEST_URL" node --env-file-if-exists=.env --import tsx scripts/activate-sources.ts \
  --slug bbc-news --slug dw-english --slug agencia-brasil \
  --reviewer "release-verification" \
  --notes "Throwaway test DB for scheduler verification only; personal non-commercial RSS use."

echo "== running worker for ${MINUTES} min (cron every minute, queue prefix ${PREFIX})"
DATABASE_URL="$TEST_URL" QUEUE_PREFIX="$PREFIX" INGEST_CRON='*/1 * * * *' WORKER_HEALTH_PORT=9480 \
  LOG_LEVEL=info node --env-file-if-exists=.env --import tsx workers/index.ts > "reports/observe-worker.log" 2>&1 &
WPID=$!
sleep $((MINUTES * 60))
curl -fsS http://127.0.0.1:9480/metrics | grep -E '^frealgo_(ingest_runs_24h|fetch_success|sources|dlq|queue_jobs\{state="(waiting|failed)")' || true
kill "$WPID" 2>/dev/null || true
wait "$WPID" 2>/dev/null || true

echo "== results"
docker compose exec -T postgres psql -U frealgo -d frealgo_test -c "
SELECT o.slug, r.trigger, r.status, r.\"fetchedCount\" AS fetched, r.\"insertedCount\" AS inserted,
       r.\"updatedCount\" AS updated, to_char(r.\"startedAt\", 'HH24:MI:SS') AS started
FROM \"IngestionRun\" r JOIN \"FeedSource\" f ON f.id = r.\"feedSourceId\" JOIN \"MediaOutlet\" o ON o.id = f.\"outletId\"
ORDER BY r.\"startedAt\";"
docker compose exec -T postgres psql -U frealgo -d frealgo_test -c "
SELECT o.slug, f.status, to_char(f.\"lastAttemptAt\",'HH24:MI:SS') AS last_attempt,
       to_char(f.\"lastSuccessfulSyncAt\",'HH24:MI:SS') AS last_success, f.etag IS NOT NULL AS has_etag,
       (SELECT count(*) FROM \"Article\" a WHERE a.\"feedSourceId\" = f.id) AS articles
FROM \"FeedSource\" f JOIN \"MediaOutlet\" o ON o.id = f.\"outletId\" WHERE f.status = 'ACTIVE' ORDER BY o.slug;"
grep -E '"msg":"(schedule tick|source ingested|source not modified|source fetch failed)"' reports/observe-worker.log | head -20 || true
