#!/bin/sh
# Deploy or update FreAlgo on a server over SSH, then smoke-test the public URL.
#
#   scripts/ops/deploy-remote.sh <server-ip> <domain> [ssh-user]
#   e.g. scripts/ops/deploy-remote.sh 203.0.113.10 frealgo.duckdns.org
#
# Env: SSH_KEY (default ~/.ssh/frealgo_oci_ed25519) · BRANCH (main) · REPO (this repo's origin).
# The server pulls the code from GitHub, so push first. Re-run for every release.
set -eu
HOST="${1:?server IP or hostname}"
DOMAIN="${2:?public domain, e.g. frealgo.duckdns.org}"
SSH_USER="${3:-ubuntu}"
KEY="${SSH_KEY:-$HOME/.ssh/frealgo_oci_ed25519}"
REPO="${REPO:-$(git remote get-url origin)}"
BRANCH="${BRANCH:-main}"

case "$DOMAIN" in *[!a-z0-9.-]*) echo "invalid domain: $DOMAIN" >&2; exit 2 ;; esac
case "$BRANCH" in *[!A-Za-z0-9._/-]*) echo "invalid branch: $BRANCH" >&2; exit 2 ;; esac

echo "== deploying $REPO ($BRANCH) to $SSH_USER@$HOST as https://$DOMAIN"
ssh -i "$KEY" -o StrictHostKeyChecking=accept-new -o ServerAliveInterval=30 "$SSH_USER@$HOST" \
  "DOMAIN='$DOMAIN' REPO='$REPO' BRANCH='$BRANCH' bash -s" <"$(dirname "$0")/server-setup.sh"

echo "== smoke test (the first HTTPS request triggers certificate issuance)"
for _ in 1 2 3 4 5 6; do
  curl -fsS --max-time 20 "https://$DOMAIN/api/v1/health/live" >/dev/null 2>&1 && break
  sleep 10
done
sh "$(dirname "$0")/smoke.sh" "https://$DOMAIN"
