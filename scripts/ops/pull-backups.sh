#!/bin/sh
# Copy the server's database backups to this computer and verify their checksums.
#
#   scripts/ops/pull-backups.sh <server-ip> [destination]     default destination: ~/FreAlgo-backups
#
# Env: SSH_KEY (default ~/.ssh/frealgo_oci_ed25519) · SSH_USER (ubuntu).
# Copies only new files and never deletes local copies, so older backups accumulate here even after
# the server prunes them (it keeps the newest 7). Run it whenever you like, or schedule it.
set -eu
HOST="${1:?server IP or hostname}"
DEST="${2:-$HOME/FreAlgo-backups}"
KEY="${SSH_KEY:-$HOME/.ssh/frealgo_oci_ed25519}"
SSH_USER="${SSH_USER:-ubuntu}"
mkdir -p "$DEST"
rsync -a --ignore-existing -e "ssh -i $KEY -o StrictHostKeyChecking=accept-new" \
  "$SSH_USER@$HOST:/var/backups/frealgo/" "$DEST/"
cd "$DEST"
ls frealgo-*.dump >/dev/null 2>&1 || { echo "no backups on the server yet"; exit 0; }
shasum -a 256 -c frealgo-*.dump.sha256
echo "$(ls frealgo-*.dump | wc -l | tr -d ' ') backups in $DEST (newest: $(ls -1t frealgo-*.dump | head -1))"
