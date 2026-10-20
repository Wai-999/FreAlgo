import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { seedCountries, seedSectors } from '@/prisma/seed';
import { runSource, resetLookupCache } from '@/workers/run-source';
import { clearRobotsCache } from '@/workers/providers/rss';
import { closeTestPrisma, testPrisma, truncateContent } from '../support/db';
import { redirect, startFeedServer, status, xml } from '../support/feed-server';
import { createTestSource, feedFixture, testProviderContext } from '../support/ingest-context';

const prisma = testPrisma();
let server: Awaited<ReturnType<typeof startFeedServer>>;
let base: string;

const deps = () => ({ prisma, providerContext: testProviderContext(server.port) });
const articles = (feedSourceId: string) =>
  prisma.article.findMany({ where: { feedSourceId }, orderBy: { canonicalUrl: 'asc' } });

beforeAll(async () => {
  await truncateContent();
  await seedCountries(prisma);
  await seedSectors(prisma);
  server = await startFeedServer();
  base = `http://feeds.test:${server.port}`;
});

beforeEach(async () => {
  await truncateContent();
  server.routes.clear();
  server.hits.clear();
  server.routes.set('/robots.txt', (_req, res) =>
    res
      .writeHead(200, { 'content-type': 'text/plain' })
      .end('User-agent: *\nDisallow: /private/\n'),
  );
  clearRobotsCache();
  resetLookupCache();
});

afterAll(async () => {
  await server.close();
  await closeTestPrisma();
});

describe('feed ingestion pipeline', () => {
  it('ingests a fixture feed once, even when the job is retried or re-run', async () => {
    server.routes.set('/basic.xml', xml(feedFixture('rss2-basic.xml')));
    const source = await createTestSource(prisma, { url: `${base}/basic.xml` });

    const first = await runSource({ sourceId: source.id, trigger: 'test' }, deps());
    expect(first).toMatchObject({
      status: 'PARTIAL',
      fetched: 7,
      inserted: 4,
      updated: 0,
      quarantined: 3,
    });

    // Simulated retry / duplicate delivery of the same job.
    const second = await runSource(
      { sourceId: source.id, trigger: 'test', attempt: 2, maxAttempts: 3 },
      deps(),
    );
    expect(second).toMatchObject({ inserted: 0, updated: 0 });

    const rows = await articles(source.id);
    expect(rows).toHaveLength(4);
    expect(new Set(rows.map((r) => r.canonicalUrlHash)).size).toBe(4);

    const rice = rows.find((r) => r.externalId === 'test-gazette-1')!;
    expect(rice.canonicalUrl).toBe('https://feeds.test/articles/rice?id=7');
    expect(rice.excerpt).toBe('Synthetic fixture excerpt about farmers.');
    expect(rice.publishedAt.toISOString()).toBe('2026-10-19T02:00:00.000Z');
    expect(rice.publishedOffsetMinutes).toBe(390);
    expect(rice.isFixture).toBe(true);

    const future = rows.find((r) => r.externalId === 'test-gazette-6')!;
    expect(future.status).toBe('QUARANTINED');
    expect(future.statusReason).toBe('future-timestamp');
    const undated = rows.find((r) => r.externalId === 'test-gazette-7')!;
    expect(undated.publishedAtEstimated).toBe(true);
  });

  it('records auditable country and sector tags with their basis', async () => {
    server.routes.set('/tags.xml', xml(feedFixture('rss2-basic.xml')));
    const source = await createTestSource(prisma, { url: `${base}/tags.xml`, countryIso2: 'MM' });
    await runSource({ sourceId: source.id, trigger: 'test' }, deps());
    const rice = await prisma.article.findFirstOrThrow({
      where: { feedSourceId: source.id, externalId: 'test-gazette-1' },
      include: {
        countries: { include: { country: true } },
        sectors: { include: { sector: true } },
      },
    });
    const countries = Object.fromEntries(rice.countries.map((c) => [c.country.iso2, c]));
    expect(countries.MM).toMatchObject({ basis: 'SOURCE_COUNTRY' });
    expect(countries.TH).toMatchObject({ basis: 'TEXT_MATCH', matchedTerm: 'Thailand (rules v1)' });
    const sectors = Object.fromEntries(rice.sectors.map((s) => [s.sector.slug, s]));
    expect(sectors.agriculture).toMatchObject({ basis: 'FEED_CATEGORY' });
    // Denormalized publishedAt matches the article (ADR-005).
    expect(
      rice.countries.every((c) => c.publishedAt.getTime() === rice.publishedAt.getTime()),
    ).toBe(true);
  });

  it('upserts changed entries without creating duplicates', async () => {
    server.routes.set('/changing.xml', xml(feedFixture('rss2-basic.xml')));
    const source = await createTestSource(prisma, { url: `${base}/changing.xml` });
    await runSource({ sourceId: source.id, trigger: 'test' }, deps());
    const before = await prisma.article.findFirstOrThrow({
      where: { feedSourceId: source.id, externalId: 'test-gazette-2' },
    });

    server.routes.set('/changing.xml', xml(feedFixture('rss2-updated.xml')));
    const res = await runSource({ sourceId: source.id, trigger: 'test' }, deps());
    expect(res).toMatchObject({ inserted: 0, updated: 1 });
    const after = await prisma.article.findFirstOrThrow({ where: { id: before.id } });
    expect(after.title).toBe('Fixture: Parliament postpones budget debate (updated)');
    expect(after.publishedAt).toEqual(before.publishedAt);
    expect(await prisma.article.count({ where: { feedSourceId: source.id } })).toBe(4);
  });

  it('keeps takedowns: a REMOVED article is never resurrected', async () => {
    server.routes.set('/takedown.xml', xml(feedFixture('rss2-basic.xml')));
    const source = await createTestSource(prisma, { url: `${base}/takedown.xml` });
    await runSource({ sourceId: source.id, trigger: 'test' }, deps());
    const a = await prisma.article.findFirstOrThrow({
      where: { feedSourceId: source.id, externalId: 'test-gazette-2' },
    });
    await prisma.article.update({
      where: { id: a.id },
      data: { status: 'REMOVED', statusReason: 'publisher takedown' },
    });
    server.routes.set('/takedown.xml', xml(feedFixture('rss2-updated.xml')));
    await runSource({ sourceId: source.id, trigger: 'test' }, deps());
    expect((await prisma.article.findUniqueOrThrow({ where: { id: a.id } })).status).toBe(
      'REMOVED',
    );
  });

  it('parses RSS 1.0 and Atom sources', async () => {
    server.routes.set('/rdf.xml', xml(feedFixture('rss1-rdf.xml')));
    server.routes.set('/atom.xml', xml(feedFixture('atom.xml')));
    const rdf = await createTestSource(prisma, { url: `${base}/rdf.xml`, countryIso2: 'DE' });
    const atom = await createTestSource(prisma, { url: `${base}/atom.xml`, countryIso2: 'JP' });
    expect(await runSource({ sourceId: rdf.id, trigger: 'test' }, deps())).toMatchObject({
      status: 'SUCCESS',
      inserted: 1,
    });
    expect(await runSource({ sourceId: atom.id, trigger: 'test' }, deps())).toMatchObject({
      status: 'SUCCESS',
      inserted: 1,
    });
    const jp = await prisma.article.findFirstOrThrow({ where: { feedSourceId: atom.id } });
    expect(jp.language).toBe('ja');
    expect(jp.canonicalUrl).toBe('https://feeds.test/atom/1');
  });
});

describe('conditional HTTP and freshness', () => {
  it('sends If-None-Match and treats 304 as a successful sync without changes', async () => {
    server.routes.set('/etag.xml', xml(feedFixture('rss1-rdf.xml'), { etag: '"v1"' }));
    const source = await createTestSource(prisma, { url: `${base}/etag.xml` });
    await runSource({ sourceId: source.id, trigger: 'test' }, deps());
    const afterFirst = await prisma.feedSource.findUniqueOrThrow({ where: { id: source.id } });
    expect(afterFirst.etag).toBe('"v1"');

    const second = await runSource({ sourceId: source.id, trigger: 'test' }, deps());
    expect(second.status).toBe('NOT_MODIFIED');
    const afterSecond = await prisma.feedSource.findUniqueOrThrow({ where: { id: source.id } });
    expect(afterSecond.lastHttpStatus).toBe(304);
    expect(afterSecond.lastSuccessfulSyncAt!.getTime()).toBeGreaterThanOrEqual(
      afterFirst.lastSuccessfulSyncAt!.getTime(),
    );
    const runs = await prisma.ingestionRun.findMany({
      where: { feedSourceId: source.id },
      orderBy: { startedAt: 'asc' },
    });
    expect(runs.map((r) => r.status)).toEqual(['SUCCESS', 'NOT_MODIFIED']);
  });

  it('reports freshness truthfully: failures update attempt time but not success time', async () => {
    server.routes.set('/flaky.xml', xml(feedFixture('rss1-rdf.xml')));
    const source = await createTestSource(prisma, { url: `${base}/flaky.xml` });
    await runSource({ sourceId: source.id, trigger: 'test' }, deps());
    const ok = await prisma.feedSource.findUniqueOrThrow({ where: { id: source.id } });

    server.routes.set('/flaky.xml', status(503));
    const res = await runSource(
      { sourceId: source.id, trigger: 'test', attempt: 3, maxAttempts: 3 },
      deps(),
    );
    expect(res).toMatchObject({ status: 'FAILED', errorCode: 'HTTP_503', retry: false });
    const failed = await prisma.feedSource.findUniqueOrThrow({ where: { id: source.id } });
    expect(failed.lastSuccessfulSyncAt).toEqual(ok.lastSuccessfulSyncAt);
    expect(failed.lastAttemptAt!.getTime()).toBeGreaterThan(ok.lastAttemptAt!.getTime() - 1);
    expect(failed.lastError).toMatch(/HTTP_503/);
    expect(failed.failureCount).toBe(1);
    expect(failed.nextEligibleFetchAt!.getTime()).toBeGreaterThan(Date.now() + 2.9 * 3_600_000);
  });

  it('asks BullMQ to retry transient errors without counting them against the circuit', async () => {
    server.routes.set('/retry.xml', status(502));
    const source = await createTestSource(prisma, { url: `${base}/retry.xml` });
    const res = await runSource(
      { sourceId: source.id, trigger: 'test', attempt: 1, maxAttempts: 3 },
      deps(),
    );
    expect(res).toMatchObject({ status: 'FAILED', retry: true });
    expect(
      (await prisma.feedSource.findUniqueOrThrow({ where: { id: source.id } })).failureCount,
    ).toBe(0);
  });

  it('opens the circuit after repeated failures and skips scheduled fetches while backing off', async () => {
    server.routes.set('/down.xml', status(500));
    const source = await createTestSource(prisma, { url: `${base}/down.xml` });
    await prisma.feedSource.update({ where: { id: source.id }, data: { failureCount: 7 } });
    await runSource({ sourceId: source.id, trigger: 'manual' }, deps());
    const s = await prisma.feedSource.findUniqueOrThrow({ where: { id: source.id } });
    expect(s.failureCount).toBe(8);
    expect(s.status).toBe('ERROR');
    expect(await runSource({ sourceId: source.id, trigger: 'schedule' }, deps())).toMatchObject({
      status: 'SKIPPED',
      skippedReason: 'status-error',
    });
  });
});

describe('quarantine and validation', () => {
  it('quarantines malformed payloads with an excerpt for review', async () => {
    server.routes.set('/broken.xml', xml(feedFixture('malformed.xml')));
    const source = await createTestSource(prisma, { url: `${base}/broken.xml` });
    const res = await runSource({ sourceId: source.id, trigger: 'test' }, deps());
    expect(res).toMatchObject({ status: 'FAILED', errorCode: 'PARSE_ERROR', retry: false });
    const q = await prisma.ingestionQuarantine.findFirstOrThrow({
      where: { feedSourceId: source.id },
    });
    expect(q.reason).toBe('invalid-payload');
    expect(q.payloadExcerpt).toContain('<rss');
    expect(await prisma.article.count({ where: { feedSourceId: source.id } })).toBe(0);
  });

  it('rejects entity-expansion payloads', async () => {
    server.routes.set('/bomb.xml', xml(feedFixture('doctype-bomb.xml')));
    const source = await createTestSource(prisma, { url: `${base}/bomb.xml` });
    expect(await runSource({ sourceId: source.id, trigger: 'test' }, deps())).toMatchObject({
      errorCode: 'PARSE_ERROR',
    });
  });

  it('stores item-level rejections in the quarantine log', async () => {
    server.routes.set('/items.xml', xml(feedFixture('rss2-basic.xml')));
    const source = await createTestSource(prisma, { url: `${base}/items.xml` });
    await runSource({ sourceId: source.id, trigger: 'test' }, deps());
    const reasons = (
      await prisma.ingestionQuarantine.findMany({ where: { feedSourceId: source.id } })
    )
      .map((q) => q.reason)
      .sort();
    expect(reasons).toEqual(['invalid-url', 'missing-title']);
  });
});

describe('SSRF protection', () => {
  it('blocks literal private addresses before any request is made', async () => {
    server.routes.set('/basic.xml', xml(feedFixture('rss2-basic.xml')));
    const source = await createTestSource(prisma, {
      url: `http://127.0.0.1:${server.port}/basic.xml`,
    });
    const res = await runSource({ sourceId: source.id, trigger: 'test' }, deps());
    expect(res).toMatchObject({ status: 'FAILED', errorCode: 'SSRF_BLOCKED' });
    expect(server.totalHits()).toBe(0);
    expect((await prisma.feedSource.findUniqueOrThrow({ where: { id: source.id } })).status).toBe(
      'ERROR',
    );
  });

  it.each([
    ['cloud metadata IP', 'http://169.254.169.254/latest/meta-data/'],
    ['localhost', 'http://localhost/admin'],
    ['a host resolving to a private address', 'http://internal.test/feed'],
    ['a non-http scheme', 'file:///etc/passwd'],
  ])('re-validates redirects to %s', async (_label, target) => {
    server.routes.set('/redir.xml', redirect(target));
    const source = await createTestSource(prisma, { url: `${base}/redir.xml` });
    const res = await runSource({ sourceId: source.id, trigger: 'test' }, deps());
    expect(res).toMatchObject({ status: 'FAILED', errorCode: 'SSRF_BLOCKED' });
  });

  it('refuses hosts whose DNS answers include any private address (rebinding)', async () => {
    const source = await createTestSource(prisma, { url: 'http://rebind.test/feed.xml' });
    const res = await runSource({ sourceId: source.id, trigger: 'test' }, testDepsWithoutRobots());
    expect(res).toMatchObject({ status: 'FAILED', errorCode: 'SSRF_BLOCKED' });
  });

  it('honours robots.txt disallow rules', async () => {
    server.routes.set('/private/feed.xml', xml(feedFixture('rss2-basic.xml')));
    const source = await createTestSource(prisma, { url: `${base}/private/feed.xml` });
    const res = await runSource({ sourceId: source.id, trigger: 'test' }, deps());
    expect(res).toMatchObject({ status: 'FAILED', errorCode: 'ROBOTS_DISALLOWED' });
    expect(server.hits.get('/private/feed.xml')).toBeUndefined();
  });

  it('enforces the response size limit', async () => {
    const huge = `<rss><channel>${'<item><title>x</title><link>https://feeds.test/a</link></item>'.repeat(30_000)}</channel></rss>`;
    server.routes.set('/huge.xml', xml(huge));
    const source = await createTestSource(prisma, { url: `${base}/huge.xml` });
    const res = await runSource({ sourceId: source.id, trigger: 'test' }, deps());
    expect(res).toMatchObject({ status: 'FAILED', errorCode: 'RESPONSE_TOO_LARGE' });
  });
});

describe('failure isolation', () => {
  it('a failing source does not affect other sources', async () => {
    server.routes.set('/good.xml', xml(feedFixture('rss1-rdf.xml')));
    server.routes.set('/bad.xml', status(500));
    const good = await createTestSource(prisma, { url: `${base}/good.xml` });
    const bad = await createTestSource(prisma, { url: `${base}/bad.xml` });
    const results = await Promise.all([
      runSource({ sourceId: bad.id, trigger: 'test' }, deps()),
      runSource({ sourceId: good.id, trigger: 'test' }, deps()),
    ]);
    expect(results[0]).toMatchObject({ status: 'FAILED' });
    expect(results[1]).toMatchObject({ status: 'SUCCESS', inserted: 1 });
  });
});

describe('licensed JSON API adapter', () => {
  const config = {
    apiKeyEnv: 'LICENSED_API_TEST',
    itemsPath: 'data.items',
    fields: { id: 'uid', url: 'href', title: 'headline', summary: 'abstract', publishedAt: 'ts' },
  };

  it('maps JSON items and sends the key only in a server-side header', async () => {
    let auth: string | undefined;
    server.routes.set('/api/news', (req, res) => {
      auth = req.headers.authorization;
      res.writeHead(200, { 'content-type': 'application/json' }).end(
        JSON.stringify({
          data: {
            items: [
              {
                uid: 'a1',
                href: `${base}/api/a1`,
                headline: 'Fixture: Licensed item',
                abstract: 'Synthetic.',
                ts: '2026-10-19T05:00:00Z',
              },
            ],
          },
        }),
      );
    });
    const source = await createTestSource(prisma, {
      url: `${base}/api/news`,
      kind: 'LICENSED_API',
      providerConfig: config,
    });
    const ctx = testProviderContext(server.port, { env: { LICENSED_API_TEST: 'test-key-123' } });
    const res = await runSource(
      { sourceId: source.id, trigger: 'test' },
      { prisma, providerContext: ctx },
    );
    expect(res).toMatchObject({ status: 'SUCCESS', inserted: 1 });
    expect(auth).toBe('Bearer test-key-123');
  });

  it('fails with CONFIG_ERROR (external gate) when the licence key is missing', async () => {
    const source = await createTestSource(prisma, {
      url: `${base}/api/news`,
      kind: 'LICENSED_API',
      providerConfig: config,
    });
    const res = await runSource({ sourceId: source.id, trigger: 'test' }, deps());
    expect(res).toMatchObject({ status: 'FAILED', errorCode: 'CONFIG_ERROR' });
  });
});

function testDepsWithoutRobots() {
  return { prisma, providerContext: testProviderContext(server.port, { respectRobots: false }) };
}

describe('source policy enforcement in the worker', () => {
  it('never fetches a real (non-fixture) feed whose terms have not been reviewed', async () => {
    server.routes.set('/real.xml', xml(feedFixture('rss1-rdf.xml')));
    const source = await createTestSource(prisma, { url: `${base}/real.xml` });
    await prisma.feedSource.update({ where: { id: source.id }, data: { isFixture: false } });
    const res = await runSource({ sourceId: source.id, trigger: 'manual' }, deps());
    expect(res).toMatchObject({ status: 'SKIPPED', skippedReason: 'terms-not-reviewed' });
    expect(server.totalHits()).toBe(0);
  });
});
