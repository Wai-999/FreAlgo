// Read-API load test with autocannon (fetched at a pinned version via npx).
// Usage: node scripts/perf/load-test.mjs [baseUrl] [seconds] [connections]
// Run the server with RATE_LIMIT_SCALE=1000 so the test measures latency rather than 429s.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const base = process.argv[2] ?? 'http://127.0.0.1:3000';
const seconds = process.argv[3] ?? '15';
const connections = process.argv[4] ?? '20';
const targets = [
  ['countries', '/api/v1/countries'],
  ['country articles (MM)', '/api/v1/countries/MM/articles'],
  [
    'country articles + filters',
    '/api/v1/countries/US/articles?sector=politics&orientation=center-right&sort=oldest',
  ],
  ['search (relevance)', '/api/v1/articles/search?q=rice%20harvest'],
  ['freshness', '/api/v1/health/freshness'],
  ['explore page (HTML)', '/?country=KE&intro=0'],
];
const rows = [];
for (const [name, path] of targets) {
  const out = execFileSync(
    'npx',
    ['-y', 'autocannon@8.0.0', '-j', '-d', seconds, '-c', connections, `${base}${path}`],
    {
      maxBuffer: 64 * 1024 * 1024,
    },
  ).toString();
  const r = JSON.parse(out);
  rows.push({
    endpoint: name,
    reqPerSec: Math.round(r.requests.average),
    p50ms: r.latency.p50,
    p90ms: r.latency.p90,
    p97_5ms: r.latency.p97_5,
    p99ms: r.latency.p99,
    maxMs: r.latency.max,
    non2xx: r.non2xx,
    errors: r.errors,
  });
}
console.table(rows);
mkdirSync('reports', { recursive: true });
writeFileSync(
  'reports/load-test.json',
  JSON.stringify(
    { measuredAt: new Date().toISOString(), base, seconds, connections, rows },
    null,
    2,
  ),
);
