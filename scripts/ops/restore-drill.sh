#!/bin/sh
# Backup/restore drill: back up the live DB, restore into a scratch DB, and compare row counts
# and migration state table by table. Exits non-zero on any mismatch. Drops the scratch DB after.
set -eu
COMPOSE="${COMPOSE:-docker compose}"
export COMPOSE
DIR="$(mktemp -d)"
scripts/ops/backup.sh "$DIR"
FILE="$(ls "$DIR"/*.dump | head -1)"
scripts/ops/restore.sh "$FILE" frealgo_restore_drill
Q="SELECT string_agg(t || '=' || n, ' ' ORDER BY t) FROM (
  SELECT 'Country' t, count(*) n FROM \"Country\" UNION ALL SELECT 'Sector', count(*) FROM \"Sector\"
  UNION ALL SELECT 'MediaOutlet', count(*) FROM \"MediaOutlet\" UNION ALL SELECT 'FeedSource', count(*) FROM \"FeedSource\"
  UNION ALL SELECT 'Article', count(*) FROM \"Article\" UNION ALL SELECT 'ArticleCountry', count(*) FROM \"ArticleCountry\"
  UNION ALL SELECT 'ArticleSector', count(*) FROM \"ArticleSector\" UNION ALL SELECT 'OutletLabelHistory', count(*) FROM \"OutletLabelHistory\"
  UNION ALL SELECT 'IngestionRun', count(*) FROM \"IngestionRun\" UNION ALL SELECT 'AdminAuditLog', count(*) FROM \"AdminAuditLog\"
  UNION ALL SELECT '_prisma_migrations', count(*) FROM \"_prisma_migrations\"
  UNION ALL SELECT 'searchVector_nonnull', count(*) FROM \"Article\" WHERE \"searchVector\" IS NOT NULL) x;"
LIVE="$($COMPOSE exec -T postgres psql -U frealgo -d frealgo -Atc "$Q")"
RESTORED="$($COMPOSE exec -T postgres psql -U frealgo -d frealgo_restore_drill -Atc "$Q")"
echo "live:     $LIVE"
echo "restored: $RESTORED"
$COMPOSE exec -T postgres psql -U frealgo -d postgres -c 'DROP DATABASE IF EXISTS "frealgo_restore_drill";' >/dev/null
rm -rf "$DIR"
if [ "$LIVE" = "$RESTORED" ]; then echo "RESTORE DRILL PASSED"; else echo "RESTORE DRILL FAILED" >&2; exit 1; fi
