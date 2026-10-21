#!/usr/bin/env bash
# Provision or update a FreAlgo production host (Ubuntu 22.04/24.04, x86-64 or ARM64). Idempotent:
# safe to re-run for every release. Normally invoked by scripts/ops/deploy-remote.sh over SSH.
#
#   DOMAIN=frealgo.duckdns.org bash server-setup.sh
#
# Env: DOMAIN (required) · REPO (git URL) · BRANCH (main) · APP_DIR (/opt/frealgo)
#      SKIP_SYSTEM=1 skips packages, firewall and git (to test the stack from a local checkout).
#
# Docker commands read stdin from /dev/null so the script also works when piped (bash -s).
# Secrets are generated once on the host into deploy/.env.production (mode 600, git-ignored) and
# are never printed. Owner-approved feed activations come from deploy/source-activations.json.
set -euo pipefail
: "${DOMAIN:?DOMAIN is required (e.g. frealgo.duckdns.org)}"
REPO="${REPO:-https://github.com/Wai-999/FreAlgo.git}"
BRANCH="${BRANCH:-main}"
APP_DIR="${APP_DIR:-/opt/frealgo}"
SUDO=""
[ "$(id -u)" -ne 0 ] && [ "${SKIP_SYSTEM:-0}" != 1 ] && SUDO="sudo"
log() { printf '\n== %s\n' "$*"; }

if [ "${SKIP_SYSTEM:-0}" != 1 ]; then
  log "packages"
  if ! command -v docker >/dev/null || ! $SUDO docker compose version >/dev/null 2>&1; then
    # A fresh cloud server runs cloud-init and unattended upgrades on first boot; they hold the
    # apt locks for several minutes ("Could not get lock /var/lib/apt/lists/lock").
    if command -v cloud-init >/dev/null; then $SUDO cloud-init status --wait >/dev/null 2>&1 || true; fi
    for _ in $(seq 1 90); do
      $SUDO fuser /var/lib/dpkg/lock-frontend /var/lib/apt/lists/lock >/dev/null 2>&1 || break
      echo "waiting for another apt process (first-boot updates)..."
      sleep 10
    done
    $SUDO apt-get -o DPkg::Lock::Timeout=600 update -qq
    $SUDO env DEBIAN_FRONTEND=noninteractive apt-get -o DPkg::Lock::Timeout=600 install -y -qq \
      docker.io docker-compose-v2 git openssl ca-certificates curl
    $SUDO systemctl enable --now docker
  fi

  log "firewall: allow 80/443 (Oracle's Ubuntu images reject inbound traffic except SSH)"
  for port in 80 443; do
    $SUDO iptables -C INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null ||
      $SUDO iptables -I INPUT 1 -p tcp --dport "$port" -j ACCEPT
  done
  if command -v netfilter-persistent >/dev/null; then $SUDO netfilter-persistent save >/dev/null; fi

  log "code: $REPO ($BRANCH) -> $APP_DIR"
  if [ -d "$APP_DIR/.git" ]; then
    git -C "$APP_DIR" fetch -q origin "$BRANCH"
    git -C "$APP_DIR" reset -q --hard "origin/$BRANCH" # deploy-only checkout; .env.production is git-ignored
  else
    $SUDO mkdir -p "$APP_DIR"
    $SUDO chown "$(id -u):$(id -g)" "$APP_DIR"
    git clone -q --branch "$BRANCH" "$REPO" "$APP_DIR"
  fi
fi

cd "$APP_DIR"
ENV_FILE=deploy/.env.production
log "secrets: $ENV_FILE (generated once on this host, never printed)"
if [ ! -f "$ENV_FILE" ]; then
  (
    umask 077
    {
      echo "DOMAIN=$DOMAIN"
      # Hex keeps the values URL-safe inside DATABASE_URL / REDIS_URL.
      for key in POSTGRES_PASSWORD APP_DB_PASSWORD REDIS_PASSWORD SESSION_SECRET ADMIN_API_TOKEN METRICS_TOKEN; do
        echo "$key=$(openssl rand -hex 32)"
      done
    } >"$ENV_FILE"
  )
fi
if ! grep -qx "DOMAIN=$DOMAIN" "$ENV_FILE"; then
  sed -i.bak "s/^DOMAIN=.*/DOMAIN=$DOMAIN/" "$ENV_FILE" && rm -f "$ENV_FILE.bak"
fi

COMPOSE=($SUDO docker compose -f deploy/docker-compose.prod.yml --env-file "$ENV_FILE")
log "build and start (first build takes several minutes)"
"${COMPOSE[@]}" up -d --build --remove-orphans </dev/null

log "waiting for the web app"
healthy=0
for _ in $(seq 1 60); do
  if "${COMPOSE[@]}" exec -T web wget -qO- http://127.0.0.1:3000/api/v1/health </dev/null >/dev/null 2>&1; then
    healthy=1
    break
  fi
  sleep 5
done
[ "$healthy" = 1 ] || { "${COMPOSE[@]}" ps; echo "web did not become healthy" >&2; exit 1; }

log "owner-approved feed activations (deploy/source-activations.json; idempotent)"
"${COMPOSE[@]}" run --rm --no-deps migrate \
  node --import tsx scripts/activate-sources.ts --from deploy/source-activations.json </dev/null

log "first fetch of active feeds now, instead of waiting for the next 3-hour tick"
"${COMPOSE[@]}" exec -T web node --input-type=module -e '
const base = "http://127.0.0.1:3000";
const headers = { authorization: `Bearer ${process.env.ADMIN_API_TOKEN}` };
const res = await fetch(`${base}/api/v1/admin/sources`, { headers });
if (!res.ok) throw new Error(`admin sources: HTTP ${res.status}`);
const { sources } = await res.json();
for (const s of sources.filter((x) => x.status === "ACTIVE")) {
  const r = await fetch(`${base}/api/v1/admin/sources/${s.id}/refetch`, { method: "POST", headers });
  console.log(`refetch ${s.outlet?.slug ?? s.id} -> HTTP ${r.status}`);
}' </dev/null

if [ "${SKIP_SYSTEM:-0}" != 1 ]; then
  log "daily database backup: 02:37 UTC, newest 7 kept in /var/backups/frealgo"
  OWNER="$(id -un)"
  $SUDO mkdir -p /var/backups/frealgo
  $SUDO chown "$OWNER:$OWNER" /var/backups/frealgo
  $SUDO chmod 700 /var/backups/frealgo
  # Runs as root (Docker access); files are handed to the deploy user so they can be copied off
  # the server with scripts/ops/pull-backups.sh.
  $SUDO tee /etc/cron.d/frealgo-backup >/dev/null <<CRON
# FreAlgo daily database backup (installed by scripts/ops/server-setup.sh; edits are overwritten).
SHELL=/bin/sh
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
37 2 * * * root cd $APP_DIR && COMPOSE="docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.production" KEEP=7 sh scripts/ops/backup.sh /var/backups/frealgo >>/var/log/frealgo-backup.log 2>&1; chown -R $OWNER:$OWNER /var/backups/frealgo
CRON
  $SUDO chmod 644 /etc/cron.d/frealgo-backup
fi

log "status"
"${COMPOSE[@]}" ps --format 'table {{.Service}}\t{{.State}}\t{{.Status}}'
echo "Done. Site: https://$DOMAIN (the TLS certificate is issued on the first request once DNS points here)."
