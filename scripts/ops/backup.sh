#!/bin/sh
# PostgreSQL logical backup (custom format, compressed) via the compose `postgres` service.
#   scripts/ops/backup.sh [output-dir]       default: ./backups
# Writes frealgo-<UTC timestamp>.dump and a .sha256 checksum (bare file name, so copies verify
# anywhere with `shasum -a 256 -c`). Keep backups off-host in production (docs/operations/runbook.md §5);
# this script never uploads anything itself.
# Env: COMPOSE (default "docker compose"; production sets the -f/--env-file flags)
#      KEEP=N keeps only the newest N backups in output-dir.
set -eu
OUT_DIR="${1:-./backups}"
COMPOSE="${COMPOSE:-docker compose}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
NAME="frealgo-$STAMP.dump"
mkdir -p "$OUT_DIR"
$COMPOSE exec -T postgres pg_dump -U frealgo -d "${PGDATABASE:-frealgo}" --format=custom --compress=6 --no-owner </dev/null > "$OUT_DIR/$NAME"
(cd "$OUT_DIR" && shasum -a 256 "$NAME" > "$NAME.sha256")
echo "$(date -u +%FT%TZ) backup written: $OUT_DIR/$NAME ($(wc -c < "$OUT_DIR/$NAME" | tr -d ' ') bytes)"
if [ -n "${KEEP:-}" ]; then
  ls -1t "$OUT_DIR"/frealgo-*.dump | tail -n +"$((KEEP + 1))" | while read -r old; do
    rm -f "$old" "$old.sha256"
    echo "pruned $old"
  done
fi
