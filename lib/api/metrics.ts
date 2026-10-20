/**
 * In-process API latency/status counters for the web /metrics endpoint (per instance).
 * Routes are normalised (ids/codes replaced) to keep label cardinality bounded.
 */
const BUCKETS = [25, 50, 100, 250, 500, 1000, 2500, 5000];

interface Series {
  count: number;
  sumMs: number;
  buckets: number[];
  statuses: Record<string, number>;
}

const series = new Map<string, Series>();

export function normaliseRoute(path: string): string {
  return path
    .replace(/\/countries\/[A-Za-z]{2}\//, '/countries/:iso2/')
    .replace(/\/(sources|quarantine|articles|outlets)\/[a-z0-9]{20,}/g, '/$1/:id')
    .slice(0, 80);
}

export function recordApiLatency(path: string, status: number, ms: number): void {
  const route = normaliseRoute(path);
  let s = series.get(route);
  if (!s) {
    if (series.size > 200) return; // hard cap on cardinality
    s = { count: 0, sumMs: 0, buckets: BUCKETS.map(() => 0), statuses: {} };
    series.set(route, s);
  }
  s.count += 1;
  s.sumMs += ms;
  BUCKETS.forEach((b, i) => {
    if (ms <= b) s.buckets[i]! += 1;
  });
  const cls = `${Math.floor(status / 100)}xx`;
  s.statuses[cls] = (s.statuses[cls] ?? 0) + 1;
}

export function renderApiMetrics(): string {
  const out = [
    '# HELP frealgo_api_request_duration_ms API latency histogram (per web instance)',
    '# TYPE frealgo_api_request_duration_ms histogram',
  ];
  for (const [route, s] of series) {
    BUCKETS.forEach((b, i) =>
      out.push(
        `frealgo_api_request_duration_ms_bucket{route="${route}",le="${b}"} ${s.buckets[i]}`,
      ),
    );
    out.push(`frealgo_api_request_duration_ms_bucket{route="${route}",le="+Inf"} ${s.count}`);
    out.push(`frealgo_api_request_duration_ms_sum{route="${route}"} ${s.sumMs}`);
    out.push(`frealgo_api_request_duration_ms_count{route="${route}"} ${s.count}`);
  }
  out.push(
    '# HELP frealgo_api_responses_total API responses by status class',
    '# TYPE frealgo_api_responses_total counter',
  );
  for (const [route, s] of series) {
    for (const [cls, n] of Object.entries(s.statuses))
      out.push(`frealgo_api_responses_total{route="${route}",status="${cls}"} ${n}`);
  }
  return out.join('\n');
}
