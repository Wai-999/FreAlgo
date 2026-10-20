#!/bin/sh
# Post-deploy smoke test. Usage: scripts/ops/smoke.sh https://news.example.org
set -eu
BASE="${1:-http://127.0.0.1:3000}"
fail=0
check() { # name, path, expected-substring
  body="$(curl -fsS --max-time 15 "$BASE$2" 2>/dev/null)" || { echo "FAIL $1 ($2): request failed"; fail=1; return; }
  echo "$body" | grep -q "$3" && echo "ok   $1" || { echo "FAIL $1 ($2): missing '$3'"; fail=1; }
}
check liveness      /api/v1/health/live              '"status":"ok"'
check readiness     /api/v1/health                   '"database":"ok"'
check freshness     /api/v1/health/freshness         '"schedule"'
check countries     /api/v1/countries                '"iso2":"MM"'
check articles      '/api/v1/countries/KE/articles?limit=1' '"page"'
check search        '/api/v1/articles/search?q=a&limit=1'   '"ordering"'
check home          /                                'Explore news by country'
check map-asset     /geo/world-map.v2.svg            'data-iso2'
check sources       /sources                         'Source registry'
hdr="$(curl -fsSI --max-time 15 "$BASE/" | tr -d '\r')"
echo "$hdr" | grep -qi "content-security-policy: .*frame-ancestors 'none'" && echo "ok   csp" || { echo "FAIL csp header"; fail=1; }
echo "$hdr" | grep -qi '^x-powered-by' && { echo "FAIL x-powered-by exposed"; fail=1; } || echo "ok   no x-powered-by"
[ "$fail" -eq 0 ] && echo "SMOKE PASSED" || { echo "SMOKE FAILED"; exit 1; }
