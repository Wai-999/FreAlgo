#!/bin/sh
# Restores a backup into a target database (default: a scratch DB, never the live one unless
# explicitly named). Verifies the checksum first.
#   scripts/ops/restore.sh backups/frealgo-<stamp>.dump [target-db]
set -eu
FILE="$1"
TARGET="${2:-frealgo_restore_drill}"
if [ "$TARGET" = "frealgo" ] && [ "${I_UNDERSTAND_THIS_OVERWRITES_PRODUCTION:-}" != "yes" ]; then
  echo "Refusing to restore over 'frealgo' without I_UNDERSTAND_THIS_OVERWRITES_PRODUCTION=yes" >&2
  exit 2
fi
shasum -a 256 -c "$FILE.sha256"
docker compose exec -T postgres psql -U frealgo -d postgres -v ON_ERROR_STOP=1 \
  -c "DROP DATABASE IF EXISTS \"$TARGET\";" -c "CREATE DATABASE \"$TARGET\" OWNER frealgo;"
docker compose exec -T postgres pg_restore -U frealgo -d "$TARGET" --no-owner --exit-on-error < "$FILE"
echo "restored $FILE into database $TARGET"
