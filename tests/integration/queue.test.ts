import { randomUUID } from 'node:crypto';
import { QueueEvents } from 'bullmq';
import pino from 'pino';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { FETCH_JOB_OPTIONS, INGEST_QUEUE, fetchJobId, windowStart } from '@/lib/queue/ingest-queue';
import { seedCountries, seedSectors } from '@/prisma/seed';
import { clearRobotsCache } from '@/workers/providers/rss';
import { startIngestRuntime } from '@/workers/runtime';
import { enqueueDueSources, registerSchedulers } from '@/workers/scheduler';
import { closeTestPrisma, testPrisma, truncateContent } from '../support/db';
import { startFeedServer, status, xml } from '../support/feed-server';
import { createTestSource, feedFixture, testProviderContext } from '../support/ingest-context';

const prisma = testPrisma();
const redisUrl = (process.env.REDIS_URL ?? 'redis://localhost:6379').replace(/\/\d*$/, '') + '/15';
const connection = { url: redisUrl, maxRetriesPerRequest: null };
let server: Awaited<ReturnType<typeof startFeedServer>>;
let base: string;

beforeAll(async () => {
  await truncateContent();
  await seedCountries(prisma);
  await seedSectors(prisma);
  server = await startFeedServer();
  base = `http://feeds.test:${server.port}`;
});

beforeEach(async () => {
  await truncateContent();
  clearRobotsCache();
  server.routes.clear();
  server.hits.clear();
  server.routes.set('/robots.txt', (_req, res) => res.writeHead(404).end());
});

afterAll(async () => {
  await server.close();
  await closeTestPrisma();
});

function runtime(prefix: string) {
  return startIngestRuntime({
    connection,
    prefix,
    prisma,
    limiter: null,
    providerContext: testProviderContext(server.port),
    retentionDays: 90,
    concurrency: 2,
    logger: pino({ level: 'silent' }),
    backoffMs: () => 50,
  });
}

async function waitFor(
  events: QueueEvents,
  jobId: string,
  kind: 'completed' | 'failed',
  timeoutMs = 15_000,
) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timeout waiting for ${kind} ${jobId}`)),
      timeoutMs,
    );
    events.on(kind, ({ jobId: id }: { jobId: string }) => {
      if (id === jobId) {
        clearTimeout(timer);
        resolve();
      }
    });
  });
}

describe('BullMQ ingestion queue', () => {
  it('retries a transient failure and ingests exactly once', async () => {
    const prefix = `t-${randomUUID()}`;
    let calls = 0;
    server.routes.set('/flaky.xml', (req, res) => {
      calls += 1;
      if (calls === 1) return status(503)(req, res);
      return xml(feedFixture('rss2-basic.xml'))(req, res);
    });
    const source = await createTestSource(prisma, { url: `${base}/flaky.xml` });
    const rt = runtime(prefix);
    const events = new QueueEvents(INGEST_QUEUE, { connection, prefix });
    await events.waitUntilReady();
    try {
      const jobId = fetchJobId(source.id, windowStart(new Date()));
      const done = waitFor(events, jobId, 'completed');
      await rt.queue.add(
        'fetch-source',
        { sourceId: source.id, trigger: 'manual' },
        { ...FETCH_JOB_OPTIONS, jobId },
      );
      // A duplicate enqueue in the same window is ignored by BullMQ (same job id).
      await rt.queue.add(
        'fetch-source',
        { sourceId: source.id, trigger: 'manual' },
        { ...FETCH_JOB_OPTIONS, jobId },
      );
      await done;
      const job = await rt.queue.getJob(jobId);
      // BullMQ 5 counts the successful attempt as well: one failure + one success.
      expect(job?.attemptsMade).toBe(2);
      expect(calls).toBe(2);
      expect(await prisma.article.count({ where: { feedSourceId: source.id } })).toBe(4);
      const runs = await prisma.ingestionRun.findMany({
        where: { feedSourceId: source.id },
        orderBy: { startedAt: 'asc' },
      });
      expect(runs.map((r) => [r.attempt, r.status])).toEqual([
        [1, 'FAILED'],
        [2, 'PARTIAL'],
      ]);
    } finally {
      await events.close();
      await rt.queue.obliterate({ force: true });
      await rt.close();
    }
  });

  it('moves jobs that exhaust their retries to the dead-letter queue', async () => {
    const prefix = `t-${randomUUID()}`;
    server.routes.set('/down.xml', status(503));
    const source = await createTestSource(prisma, { url: `${base}/down.xml` });
    const rt = runtime(prefix);
    const events = new QueueEvents(INGEST_QUEUE, { connection, prefix });
    await events.waitUntilReady();
    try {
      const jobId = `manual__${source.id}__1`;
      const failed = waitFor(events, jobId, 'failed');
      await rt.queue.add(
        'fetch-source',
        { sourceId: source.id, trigger: 'manual' },
        { ...FETCH_JOB_OPTIONS, jobId },
      );
      await failed;
      // Final failure: wait for the 'failed' event to reach the DLQ writer.
      for (let i = 0; i < 50 && (await rt.dlq.count()) === 0; i++)
        await new Promise((r) => setTimeout(r, 50));
      expect(await rt.dlq.count()).toBe(1);
      const s = await prisma.feedSource.findUniqueOrThrow({ where: { id: source.id } });
      expect(s.failureCount).toBe(1); // only the final attempt counts against the circuit
      expect(await prisma.ingestionRun.count({ where: { feedSourceId: source.id } })).toBe(3);
    } finally {
      await events.close();
      await rt.queue.obliterate({ force: true });
      await rt.dlq.obliterate({ force: true });
      await rt.close();
    }
  });

  it('registers job schedulers idempotently across replicas', async () => {
    const prefix = `t-${randomUUID()}`;
    const a = runtime(prefix);
    const b = runtime(prefix);
    try {
      await registerSchedulers(a.queue, '0 */3 * * *');
      await registerSchedulers(b.queue, '0 */3 * * *');
      await registerSchedulers(a.queue, '0 */3 * * *');
      const schedulers = await a.queue.getJobSchedulers();
      expect(schedulers.map((s) => s.key).sort()).toEqual(['ingest-tick', 'maintenance-daily']);
      const tick = schedulers.find((s) => s.key === 'ingest-tick')!;
      expect(tick.pattern).toBe('0 */3 * * *');
      expect(tick.tz).toBe('UTC');
    } finally {
      await a.queue.obliterate({ force: true });
      await a.close();
      await b.close();
    }
  });

  it('enqueues each due source once per 3-hour window (mocked clock)', async () => {
    const prefix = `t-${randomUUID()}`;
    const s1 = await createTestSource(prisma, { url: `${base}/a.xml` });
    const s2 = await createTestSource(prisma, { url: `${base}/b.xml` });
    await createTestSource(prisma, { url: `${base}/c.xml`, status: 'PAUSED' });
    await prisma.feedSource.update({
      where: { id: s2.id },
      data: { nextEligibleFetchAt: new Date('2026-10-19T08:00:00Z') },
    });
    const { Queue } = await import('bullmq');
    const queue = new Queue(INGEST_QUEUE, { connection, prefix });
    try {
      const t0 = new Date('2026-10-19T06:00:00Z');
      expect((await enqueueDueSources(prisma, queue, t0)).enqueued).toBe(1); // s2 backing off, s3 paused
      await enqueueDueSources(prisma, queue, new Date('2026-10-19T07:30:00Z')); // re-tick, same window
      expect((await queue.getJobs(['waiting', 'delayed'])).length).toBe(1);

      // Next window: s2's backoff has elapsed. s1 was not attempted (no worker), so it's due too.
      await enqueueDueSources(prisma, queue, new Date('2026-10-19T09:00:00Z'));
      const ids = (await queue.getJobs(['waiting', 'delayed'])).map((j) => j.id).sort();
      expect(ids).toEqual(
        [
          fetchJobId(s1.id, new Date('2026-10-19T06:00:00Z')),
          fetchJobId(s1.id, new Date('2026-10-19T09:00:00Z')),
          fetchJobId(s2.id, new Date('2026-10-19T09:00:00Z')),
        ].sort(),
      );

      // A source attempted 30 minutes ago is not due again at the next tick.
      await prisma.feedSource.update({
        where: { id: s1.id },
        data: { lastAttemptAt: new Date('2026-10-19T11:30:00Z') },
      });
      const res = await enqueueDueSources(prisma, queue, new Date('2026-10-19T12:00:00Z'));
      expect(res.enqueued).toBe(1);
    } finally {
      await queue.obliterate({ force: true });
      await queue.close();
    }
  });
});
