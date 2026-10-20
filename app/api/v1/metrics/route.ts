import { timingSafeEqual } from 'node:crypto';
import { renderApiMetrics } from '@/lib/api/metrics';
import { getPrisma } from '@/lib/db/client';
import { getFreshnessReport } from '@/lib/db/freshness';

/**
 * Prometheus metrics for the web tier. Disabled unless METRICS_TOKEN is set; requires
 * `Authorization: Bearer <METRICS_TOKEN>`. Aggregates only, no user data.
 */
export async function GET(req: Request) {
  const token = process.env.METRICS_TOKEN;
  const given = req.headers.get('authorization')?.replace(/^Bearer /, '') ?? '';
  if (
    !token ||
    given.length !== token.length ||
    !timingSafeEqual(Buffer.from(given), Buffer.from(token))
  ) {
    return new Response('Not found', { status: 404 });
  }
  const prisma = getPrisma();
  const [freshness, events, articles] = await Promise.all([
    getFreshnessReport(prisma, { includeFixtures: false }),
    prisma.clientEventCounter.findMany({
      where: { day: { gte: new Date(Date.now() - 7 * 86_400_000) } },
    }),
    prisma.article.groupBy({ by: ['status'], _count: true }),
  ]);
  const lines = [renderApiMetrics()];
  lines.push(
    '# HELP frealgo_sources_by_freshness Real sources by freshness state',
    '# TYPE frealgo_sources_by_freshness gauge',
  );
  for (const [state, n] of Object.entries(freshness.summary))
    lines.push(`frealgo_sources_by_freshness{state="${state}"} ${n}`);
  lines.push('# HELP frealgo_articles Articles by status', '# TYPE frealgo_articles gauge');
  for (const a of articles) lines.push(`frealgo_articles{status="${a.status}"} ${a._count}`);
  lines.push(
    '# HELP frealgo_client_events_7d Anonymous client health events, last 7 days',
    '# TYPE frealgo_client_events_7d gauge',
  );
  const totals = new Map<string, number>();
  for (const e of events) totals.set(e.event, (totals.get(e.event) ?? 0) + e.count);
  for (const [event, n] of totals) lines.push(`frealgo_client_events_7d{event="${event}"} ${n}`);
  return new Response(`${lines.join('\n')}\n`, {
    headers: { 'Content-Type': 'text/plain; version=0.0.4', 'Cache-Control': 'no-store' },
  });
}
