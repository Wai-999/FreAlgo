import type { Queue } from 'bullmq';
import type { PrismaClient } from '@/generated/prisma/client';

/**
 * Prometheus text-format metrics for the worker. Aggregates only (no user data).
 * Source-level gauges use the outlet slug + feed id as labels (bounded cardinality).
 */
function line(name: string, value: number, labels?: Record<string, string>): string {
  const l = labels
    ? `{${Object.entries(labels)
        .map(([k, v]) => `${k}="${v.replace(/["\\\n]/g, '_')}"`)
        .join(',')}}`
    : '';
  return `${name}${l} ${Number.isFinite(value) ? value : 0}`;
}

export async function collectMetrics(
  prisma: PrismaClient,
  queue: Queue,
  dlq: Queue,
  now = new Date(),
): Promise<string> {
  const out: string[] = [];
  const counts = await queue.getJobCounts(
    'waiting',
    'active',
    'delayed',
    'failed',
    'completed',
    'prioritized',
  );
  out.push(
    '# HELP frealgo_queue_jobs Jobs in the ingest queue by state',
    '# TYPE frealgo_queue_jobs gauge',
  );
  for (const [state, n] of Object.entries(counts))
    out.push(line('frealgo_queue_jobs', n, { state }));
  const dlqCount = await dlq.count();
  out.push(
    '# HELP frealgo_dlq_jobs Jobs in the dead-letter queue',
    '# TYPE frealgo_dlq_jobs gauge',
    line('frealgo_dlq_jobs', dlqCount),
  );

  const since = new Date(now.getTime() - 24 * 3_600_000);
  const runs = await prisma.ingestionRun.groupBy({
    by: ['status'],
    where: { startedAt: { gte: since } },
    _count: true,
  });
  out.push(
    '# HELP frealgo_ingest_runs_24h Fetch attempts in the last 24h by outcome',
    '# TYPE frealgo_ingest_runs_24h gauge',
  );
  let ok = 0;
  let total = 0;
  for (const r of runs) {
    out.push(line('frealgo_ingest_runs_24h', r._count, { status: r.status }));
    if (r.status !== 'RUNNING' && r.status !== 'SKIPPED') total += r._count;
    if (r.status === 'SUCCESS' || r.status === 'NOT_MODIFIED' || r.status === 'PARTIAL')
      ok += r._count;
  }
  out.push(
    '# HELP frealgo_fetch_success_ratio_24h Successful fetch attempts / attempts (24h)',
    '# TYPE frealgo_fetch_success_ratio_24h gauge',
    line('frealgo_fetch_success_ratio_24h', total ? ok / total : 1),
  );

  const sources = await prisma.feedSource.findMany({
    where: { isFixture: false },
    select: {
      id: true,
      status: true,
      lastSuccessfulSyncAt: true,
      failureCount: true,
      outlet: { select: { slug: true } },
    },
  });
  const byStatus: Record<string, number> = {};
  out.push(
    '# HELP frealgo_source_freshness_seconds Seconds since last successful sync (-1 = never)',
    '# TYPE frealgo_source_freshness_seconds gauge',
  );
  for (const s of sources) {
    byStatus[s.status] = (byStatus[s.status] ?? 0) + 1;
    const age = s.lastSuccessfulSyncAt
      ? (now.getTime() - s.lastSuccessfulSyncAt.getTime()) / 1000
      : -1;
    out.push(
      line('frealgo_source_freshness_seconds', Math.round(age), {
        outlet: s.outlet.slug,
        feed: s.id,
      }),
    );
  }
  out.push(
    '# HELP frealgo_sources Registered real sources by status',
    '# TYPE frealgo_sources gauge',
  );
  for (const [status, n] of Object.entries(byStatus))
    out.push(line('frealgo_sources', n, { status }));
  return `${out.join('\n')}\n`;
}
