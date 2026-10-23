import { randomUUID } from 'node:crypto';
import type { ServerResponse } from 'node:http';
import { Queue, QueueEvents } from 'bullmq';
import pino from 'pino';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { FETCH_JOB_OPTIONS, INGEST_QUEUE } from '@/lib/queue/ingest-queue';
import { seedCountries, seedSectors } from '@/prisma/seed';
import { clearRobotsCache } from '@/workers/providers/rss';
import { startIngestRuntime } from '@/workers/runtime';
import { closeTestPrisma, testPrisma, truncateContent } from '../support/db';
import { startFeedServer, xml } from '../support/feed-server';
import { createTestSource, feedFixture, testProviderContext } from '../support/ingest-context';

/**
 * M5 recovery and load: the worker survives a crash and a restart without losing or duplicating
 * work, and a burst of sources is ingested completely with bounded concurrency.
 */
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
  server.routes.set('/robots.txt', (_req, res) => res.writeHead(404).end());
});

afterAll(async () => {
  await server.close();
  await closeTestPrisma();
});

const runtime = (prefix: string, concurrency = 2) =>
  startIngestRuntime({
    connection,
    prefix,
    prisma,
    limiter: null,
    providerContext: testProviderContext(server.port),
    retentionDays: 90,
    concurrency,
    logger: pino({ level: 'silent' }),
    backoffMs: () => 50,
    lockDurationMs: 1_500,
    stalledIntervalMs: 500,
  });

function completions(events: QueueEvents, ids: string[], timeoutMs = 30_000) {
  const pending = new Set(ids);
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`still pending: ${[...pending].join(', ')}`)),
      timeoutMs,
    );
    events.on('completed', ({ jobId }: { jobId: string }) => {
      pending.delete(jobId);
      if (!pending.size) {
        clearTimeout(timer);
        resolve();
      }
    });
  });
}

/** A small RSS feed whose item links are unique to the feed. */
function rss(name: string, items = 3): string {
  const entries = Array.from(
    { length: items },
    (_, i) => `<item><title>${name} report ${i + 1}</title>
      <link>https://${name}.example/news/${i + 1}</link>
      <guid>${name}-${i + 1}</guid>
      <pubDate>Wed, 21 Oct 2026 0${i}:00:00 GMT</pubDate></item>`,
  ).join('');
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>${name}</title>
    <link>https://${name}.example/</link><description>t</description>${entries}</channel></rss>`;
}

describe('worker recovery', () => {
  it('a job interrupted by a worker crash is run again by the restarted worker, once', async () => {
    const prefix = `t-${randomUUID()}`;
    let calls = 0;
    const hung: ServerResponse[] = [];
    server.routes.set('/slow.xml', (req, res) => {
      calls += 1;
      if (calls === 1) {
        hung.push(res); // the crashed worker never gets an answer
        return;
      }
      return xml(feedFixture('rss2-basic.xml'))(req, res);
    });
    const source = await createTestSource(prisma, { url: `${base}/slow.xml` });
    const events = new QueueEvents(INGEST_QUEUE, { connection, prefix });
    await events.waitUntilReady();
    const jobId = `crash-${randomUUID()}`;
    const a = runtime(prefix);
    const b = { rt: null as ReturnType<typeof runtime> | null };
    try {
      const active = new Promise<void>((resolve) =>
        events.on('active', ({ jobId: id }: { jobId: string }) => id === jobId && resolve()),
      );
      await a.queue.add(
        'fetch-source',
        { sourceId: source.id, trigger: 'manual' },
        { ...FETCH_JOB_OPTIONS, jobId },
      );
      await active;
      await a.close(true); // crash: the job stays locked by a worker that is gone
      const done = completions(events, [jobId]);
      b.rt = runtime(prefix); // restart
      await done;
      expect(calls).toBeGreaterThanOrEqual(2);
      expect(await prisma.article.count({ where: { feedSourceId: source.id } })).toBe(4);
      const runs = await prisma.ingestionRun.findMany({ where: { feedSourceId: source.id } });
      expect(runs.some((r) => r.status === 'SUCCESS' || r.status === 'PARTIAL')).toBe(true);
    } finally {
      for (const res of hung) res.destroy();
      await events.close();
      await b.rt?.queue.obliterate({ force: true });
      await b.rt?.close();
    }
  });

  it('jobs queued while no worker runs are all ingested when a worker starts', async () => {
    const prefix = `t-${randomUUID()}`;
    const queue = new Queue(INGEST_QUEUE, { connection, prefix });
    const events = new QueueEvents(INGEST_QUEUE, { connection, prefix });
    await events.waitUntilReady();
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      server.routes.set(`/q${i}.xml`, xml(rss(`queued${i}`)));
      const s = await createTestSource(prisma, { url: `${base}/q${i}.xml` });
      const jobId = `queued-${i}-${randomUUID()}`;
      ids.push(jobId);
      await queue.add(
        'fetch-source',
        { sourceId: s.id, trigger: 'manual' },
        { ...FETCH_JOB_OPTIONS, jobId },
      );
    }
    const done = completions(events, ids);
    const rt = runtime(prefix);
    try {
      await done;
      expect(await prisma.article.count()).toBe(15);
    } finally {
      await events.close();
      await rt.queue.obliterate({ force: true });
      await rt.close();
      await queue.close();
    }
  });
});

describe('ingestion load', () => {
  it('ingests a burst of 40 sources completely, without duplicates, with bounded concurrency', async () => {
    const prefix = `t-${randomUUID()}`;
    let inFlight = 0;
    let peak = 0;
    const n = 40;
    for (let i = 0; i < n; i++) {
      const body = rss(`burst${i}`, 5);
      server.routes.set(`/b${i}.xml`, (req, res) => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        setTimeout(() => {
          inFlight -= 1;
          xml(body)(req, res);
        }, 40);
      });
    }
    const sources = [];
    for (let i = 0; i < n; i++)
      sources.push(await createTestSource(prisma, { url: `${base}/b${i}.xml` }));
    const events = new QueueEvents(INGEST_QUEUE, { connection, prefix });
    await events.waitUntilReady();
    const rt = runtime(prefix, 4);
    const started = Date.now();
    try {
      const ids = sources.map((s) => `burst-${s.id}`);
      const done = completions(events, ids, 60_000);
      await rt.queue.addBulk(
        sources.map((s, i) => ({
          name: 'fetch-source',
          data: { sourceId: s.id, trigger: 'manual' as const },
          opts: { ...FETCH_JOB_OPTIONS, jobId: ids[i]! },
        })),
      );
      await done;
      const ms = Date.now() - started;
      expect(await prisma.article.count()).toBe(n * 5);
      expect(peak).toBeLessThanOrEqual(4); // worker concurrency bounds publisher load
      console.log(JSON.stringify({ sources: n, articles: n * 5, ms, peakConcurrentFetches: peak }));
      // Re-running every job ingests nothing new.
      const again = sources.map((s) => `again-${s.id}`);
      const done2 = completions(events, again, 60_000);
      await rt.queue.addBulk(
        sources.map((s, i) => ({
          name: 'fetch-source',
          data: { sourceId: s.id, trigger: 'manual' as const },
          opts: { ...FETCH_JOB_OPTIONS, jobId: again[i]! },
        })),
      );
      await done2;
      expect(await prisma.article.count()).toBe(n * 5);
    } finally {
      await events.close();
      await rt.queue.obliterate({ force: true });
      await rt.close();
    }
  });
});
