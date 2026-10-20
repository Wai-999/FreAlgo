#!/bin/sh
# PostgreSQL logical backup (custom format, compressed) via the compose `postgres` service.
#   scripts/ops/backup.sh [output-dir]       default: ./backups
# Writes frealgo-<UTC timestamp>.dump and a .sha256 checksum. Keep backups off-host in production
# (see docs/operations.md#backups); this script never uploads anything itself.
set -eu
OUT_DIR="${1:-./backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="$OUT_DIR/frealgo-$STAMP.dump"
mkdir -p "$OUT_DIR"
docker compose exec -T postgres pg_dump -U frealgo -d "${PGDATABASE:-frealgo}" --format=custom --compress=6 --no-owner > "$FILE"
shasum -a 256 "$FILE" > "$FILE.sha256"
echo "backup written: $FILE ($(wc -c < "$FILE") bytes)"
