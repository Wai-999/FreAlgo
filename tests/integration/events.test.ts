import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { canonicalUrlHash } from '@/lib/ingest/canonical-url';
import { countryConnections } from '@/lib/db/connections';
import { corpusOutlets, getEvent, listEvents } from '@/lib/db/events';
import { pulseCounts } from '@/lib/db/pulse';
import { excludeFromEvents, runEventClustering } from '@/lib/events/job';
import { buildPerspectives } from '@/lib/events/perspectives';
import { seedCountries, seedFixtures, seedSectors } from '@/prisma/seed';
import { closeTestPrisma, testPrisma, truncateContent } from '../support/db';

/** Event clustering job, event read side, Perspectives and the flagged extras (FreAlgo 2.0, M4). */
const prisma = testPrisma();
const NOW = new Date('2026-10-22T12:00:00Z');
const at = (h: number) => new Date(NOW.getTime() - h * 3_600_000);
const outlets: Record<string, string> = {};
const ids: Record<string, string> = {};

async function article(
  key: string,
  outlet: string,
  hoursAgo: number,
  title: string,
  named: string[],
  extra: { language?: string; fixture?: boolean; type?: 'NEWS' | 'OPINION' } = {},
) {
  const url = `https://events.example/${key}`;
  const countries = await prisma.country.findMany({ where: { iso2: { in: named } } });
  const a = await prisma.article.create({
    data: {
      outletId: outlets[outlet]!,
      canonicalUrl: url,
      canonicalUrlHash: canonicalUrlHash(url),
      title,
      language: extra.language ?? 'en-GB',
      publishedAt: at(hoursAgo),
      isFixture: extra.fixture ?? false,
      articleType: extra.type ?? 'UNKNOWN',
      countries: {
        create: countries.map((c) => ({
          countryId: c.id,
          basis: 'TEXT_MATCH' as const,
          role: 'SUBJECT' as const,
          matchedTerm: c.name,
          publishedAt: at(hoursAgo),
        })),
      },
    },
  });
  ids[key] = a.id;
}

beforeAll(async () => {
  await seedCountries(prisma);
  await seedSectors(prisma);
  await truncateContent();
  const country = async (iso2: string) =>
    (await prisma.country.findUniqueOrThrow({ where: { iso2 } })).id;
  const mk = async (slug: string, iso2: string, label: Record<string, unknown> = {}) => {
    const o = await prisma.mediaOutlet.create({
      data: {
        slug,
        name: slug.toUpperCase(),
        homepageUrl: `https://${slug}.example/`,
        countryId: await country(iso2),
        ...label,
      },
    });
    outlets[slug] = o.id;
  };
  await mk('wire-gb', 'GB');
  await mk('daily-us', 'US', {
    orientation: 'CENTER_LEFT',
    labelStatus: 'REVIEWED',
    labelMethodology: 'Test methodology',
    labelSourceUrl: 'https://labels.example/daily-us',
    labelReviewedAt: new Date('2026-09-01T00:00:00Z'),
  });
  await mk('post-ke', 'KE', {
    orientation: 'CENTER_RIGHT',
    labelStatus: 'REVIEWED',
    labelMethodology: 'Test methodology',
    labelSourceUrl: 'https://labels.example/post-ke',
    labelReviewedAt: new Date('2026-09-01T00:00:00Z'),
  });
  await mk('folha-br', 'BR');

  // Event 1: three outlets, one opinion piece.
  await article('q1', 'wire-gb', 30, 'Magnitude 6.1 earthquake strikes western Nepal', ['NP']);
  await article('q2', 'daily-us', 28, 'Western Nepal earthquake damages roads and schools', ['NP']);
  await article(
    'q3',
    'wire-gb',
    20,
    'Opinion: Nepal earthquake shows why building codes matter',
    ['NP'],
    { type: 'OPINION' },
  );
  // Event 2: one outlet only.
  await article('r1', 'post-ke', 10, 'Kenya central bank cuts interest rate to 9 percent', ['KE']);
  await article('r2', 'post-ke', 8, 'Kenya central bank rate cut welcomed by businesses', ['KE']);
  // Different countries, shared wording: never grouped.
  await article('x1', 'daily-us', 9, 'US central bank holds interest rate steady', ['US']);
  // Same story in Portuguese: never grouped with English.
  await article('p1', 'folha-br', 29, 'Terremoto atinge o oeste do Nepal', ['NP'], {
    language: 'pt-BR',
  });
  // Fixture copy of event 1 wording: never mixed with real reports.
  await article('f1', 'wire-gb', 27, 'Fixture: Nepal earthquake western roads', ['NP'], {
    fixture: true,
  });
  await article('f2', 'daily-us', 26, 'Fixture: Western Nepal earthquake roads closed', ['NP'], {
    fixture: true,
  });
});

afterAll(async () => {
  await closeTestPrisma();
});

describe('clustering job', () => {
  it('a dry run decides but writes nothing', async () => {
    const r = await runEventClustering(prisma, { now: NOW, dryRun: true });
    expect(r.created).toBeGreaterThan(0);
    expect(r.decisions?.length).toBe(r.created + r.joined);
    expect(await prisma.newsEvent.count()).toBe(0);
  });

  it('fixturesOnly (the seed) never touches real reports', async () => {
    await runEventClustering(prisma, { now: NOW, fixturesOnly: true });
    const events = await prisma.newsEvent.findMany({ include: { articles: true } });
    expect(events).toHaveLength(1);
    expect(events[0]!.isFixture).toBe(true);
    expect(events[0]!.articles.map((a) => a.articleId).sort()).toEqual([ids.f1, ids.f2].sort());
  });

  it('groups real reports, keeps languages, countries and fixtures apart, and is idempotent', async () => {
    const first = await runEventClustering(prisma, { now: NOW });
    expect(first.skipped).toBeUndefined();
    const of = async (key: string) =>
      (await prisma.eventArticle.findUnique({ where: { articleId: ids[key]! } }))?.eventId;
    expect(await of('q1')).toBeDefined();
    expect(await of('q2')).toBe(await of('q1'));
    expect(await of('q3')).toBe(await of('q1'));
    expect(await of('r2')).toBe(await of('r1'));
    expect(await of('x1')).toBeUndefined();
    expect(await of('p1')).toBeUndefined();
    expect(await of('f1')).not.toBe(await of('q1'));

    const quake = await prisma.newsEvent.findUniqueOrThrow({ where: { id: (await of('q1'))! } });
    expect(quake).toMatchObject({ articleCount: 3, outletCount: 2, language: 'en' });
    expect(quake.startAt).toEqual(at(30));
    expect(quake.lastAt).toEqual(at(20));
    expect([
      'Magnitude 6.1 earthquake strikes western Nepal',
      'Western Nepal earthquake damages roads and schools',
      'Opinion: Nepal earthquake shows why building codes matter',
    ]).toContain(quake.title); // a member headline, verbatim
    expect(quake.sharedTerms).toEqual(expect.arrayContaining(['earthquake', 'nepal']));

    const membership = await prisma.eventArticle.findUniqueOrThrow({
      where: { articleId: ids.q2! },
    });
    expect(membership.sharedTerms.length).toBeGreaterThanOrEqual(2);
    expect(membership.score).toBeGreaterThan(0);
    expect(membership.score).toBeLessThanOrEqual(1);

    const again = await runEventClustering(prisma, { now: NOW });
    expect(again).toMatchObject({ joined: 0, created: 0, eventsTouched: 0, eventsRefreshed: 0 });
  });

  it('runs one at a time (advisory lock)', async () => {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('frealgo:event-clustering'))`;
      const r = await runEventClustering(prisma, { now: NOW });
      expect(r.skipped).toBe('locked');
    });
  });
});

describe('event read side', () => {
  it('lists events newest first, filters fixtures, outlets and countries, and pages with a cursor', async () => {
    const all = await listEvents(prisma, { includeFixtures: true, limit: 50 });
    expect(all.items.map((e) => e.lastAt)).toEqual(
      [...all.items.map((e) => e.lastAt)].sort().reverse(),
    );
    const real = await listEvents(prisma, { includeFixtures: false });
    expect(real.items.every((e) => !e.isFixture)).toBe(true);
    expect(real.items).toHaveLength(2);
    const comparable = await listEvents(prisma, { includeFixtures: false, minOutlets: 2 });
    expect(comparable.items).toHaveLength(1);
    expect(comparable.items[0]!.countries).toEqual([{ iso2: 'NP', name: 'Nepal', reports: 3 }]);
    const ke = await listEvents(prisma, { includeFixtures: false, country: 'KE' });
    expect(ke.items).toHaveLength(1);

    const p1 = await listEvents(prisma, { includeFixtures: false, limit: 1 });
    expect(p1.nextCursor).not.toBeNull();
    const p2 = await listEvents(prisma, {
      includeFixtures: false,
      limit: 1,
      cursor: p1.nextCursor,
    });
    expect(p2.items[0]!.id).not.toBe(p1.items[0]!.id);
    expect(p2.nextCursor).toBeNull();
  });

  it('returns every report oldest first with its evidence, and splits curated past and future', async () => {
    const eventId = (await prisma.eventArticle.findUniqueOrThrow({ where: { articleId: ids.q1! } }))
      .eventId;
    await prisma.timelineEntry.createMany({
      data: [
        {
          eventId,
          occurredAt: new Date('2015-04-25T00:00:00Z'),
          datePrecision: 'DAY',
          kind: 'FACT',
          text: 'An earlier earthquake struck the region.',
          sourceUrl: 'https://history.example/2015',
          sourceName: 'History Example',
          curatedBy: 'Test curator',
          curatedAt: NOW,
        },
        {
          eventId,
          occurredAt: new Date('2026-11-05T00:00:00Z'),
          datePrecision: 'DAY',
          kind: 'FACT',
          text: 'Reconstruction conference scheduled.',
          sourceUrl: 'https://history.example/conf',
          sourceName: 'History Example',
          curatedBy: 'Test curator',
          curatedAt: NOW,
        },
      ],
    });
    const event = await prisma.newsEvent.findUniqueOrThrow({ where: { id: eventId } });
    const d = (await getEvent(prisma, event.slug, { includeFixtures: false, now: NOW }))!;
    expect(d.members.map((m) => m.id)).toEqual([ids.q1, ids.q2, ids.q3]);
    expect(d.members[1]!.membership.matchedArticleId).toBeTruthy();
    expect(d.timeline.map((t) => t.text)).toEqual(['An earlier earthquake struck the region.']);
    expect(d.upcoming.map((t) => t.text)).toEqual(['Reconstruction conference scheduled.']);
    expect(await getEvent(prisma, event.id, { includeFixtures: false })).not.toBeNull();
    expect(await getEvent(prisma, 'no-such-event', { includeFixtures: false })).toBeNull();
  });

  it('rejects curated entries without a web source (database constraint)', async () => {
    const eventId = (await prisma.newsEvent.findFirstOrThrow()).id;
    await expect(
      prisma.timelineEntry.create({
        data: {
          eventId,
          occurredAt: NOW,
          kind: 'FACT',
          text: 'Unsourced',
          sourceUrl: 'not a url',
          sourceName: 'x',
          curatedBy: 'x',
          curatedAt: NOW,
        },
      }),
    ).rejects.toThrow();
  });

  it('builds perspectives from labels and wording, with corpus gaps instead of guesses', async () => {
    const eventId = (await prisma.eventArticle.findUniqueOrThrow({ where: { articleId: ids.q1! } }))
      .eventId;
    const d = (await getEvent(prisma, eventId, { includeFixtures: false, now: NOW }))!;
    const corpus = await corpusOutlets(prisma, { includeFixtures: false, now: NOW });
    const p = buildPerspectives(d, corpus);
    expect(p.columns.map((c) => c.outlet.slug)).toEqual(['wire-gb', 'daily-us']); // first report order
    expect(p.columns[0]!.types).toMatchObject({ OPINION: 1, UNKNOWN: 1 });
    expect(p.columns[0]!.distinctWording).toEqual(
      expect.arrayContaining(['building', 'codes', 'magnitude']),
    );
    expect(p.columns[0]!.distinctWording).not.toContain('earthquake');
    expect(p.labels).toMatchObject({ rated: 1, unrated: 1 });
    const gaps = p.gaps.map((g) => g.message).join('\n');
    expect(gaps).toMatch(/No report from an outlet labelled Center-Right/);
    expect(gaps).toMatch(/1 of 2 outlets here has no orientation label/);
    expect(gaps).toMatch(/FreAlgo has no source based in Nepal/);
    expect(gaps).toMatch(/Portuguese/);
    expect(p.claimsInDispute.assessed).toBe(false);
  });

  it('drops withdrawn reports everywhere, and an event below two reports disappears', async () => {
    await prisma.article.update({ where: { id: ids.r2! }, data: { status: 'REMOVED' } });
    const ke = await listEvents(prisma, { includeFixtures: false, country: 'KE' });
    expect(ke.items).toHaveLength(0);
    const quake = await listEvents(prisma, { includeFixtures: false, country: 'NP' });
    expect(quake.items[0]!.reports).toBe(3);
    await prisma.article.update({ where: { id: ids.r2! }, data: { status: 'PUBLISHED' } });
  });
});

describe('operator correction', () => {
  it('excludes a wrongly grouped report for good, with an audit entry and a refreshed event', async () => {
    const eventId = (await prisma.eventArticle.findUniqueOrThrow({ where: { articleId: ids.q3! } }))
      .eventId;
    const r = await excludeFromEvents(prisma, ids.q3!, {
      reason: 'Opinion piece, test',
      by: 'Tester',
    });
    expect(r.eventId).toBe(eventId);
    expect(await prisma.eventArticle.findUnique({ where: { articleId: ids.q3! } })).toBeNull();
    const ev = await prisma.newsEvent.findUniqueOrThrow({ where: { id: eventId } });
    expect(ev).toMatchObject({ articleCount: 2, lastAt: at(28) });
    expect(ev.titleArticleId).not.toBe(ids.q3);
    const audit = await prisma.adminAuditLog.findFirstOrThrow({
      where: { action: 'event.exclude' },
    });
    expect(audit).toMatchObject({ actor: 'Tester', targetId: ids.q3 });
    await runEventClustering(prisma, { now: NOW });
    expect(await prisma.eventArticle.findUnique({ where: { articleId: ids.q3! } })).toBeNull();
    await expect(excludeFromEvents(prisma, ids.q2!, { reason: ' ', by: 'x' })).rejects.toThrow();
  });
});

describe('flagged extras', () => {
  it('connects countries only through shared event clusters', async () => {
    await article('c1', 'wire-gb', 5, 'Nepal and India agree joint earthquake relief corridor', [
      'NP',
      'IN',
    ]);
    await article('c2', 'daily-us', 4, 'India and Nepal open earthquake relief corridor', [
      'IN',
      'NP',
    ]);
    await runEventClustering(prisma, { now: NOW });
    const np = await countryConnections(prisma, 'NP', { includeFixtures: false });
    expect(np.map((c) => c.iso2)).toEqual(['IN']);
    expect(np[0]!.relationship).toBe('shared-event-cluster');
    expect(np[0]!.events).toHaveLength(1);
    expect(await countryConnections(prisma, 'KE', { includeFixtures: false })).toEqual([]);
  });

  it('counts reports about each country (not publisher home) for World Pulse', async () => {
    const day = await pulseCounts(prisma, { includeFixtures: false, period: '24h', now: NOW });
    const week = await pulseCounts(prisma, { includeFixtures: false, period: '7d', now: NOW });
    const n = (d: typeof day, iso2: string) =>
      d.countries.find((c) => c.iso2 === iso2)?.reports ?? 0;
    expect(n(day, 'KE')).toBe(2);
    expect(n(day, 'NP')).toBe(3); // the opinion piece (20 h) and the two corridor reports
    expect(n(week, 'NP')).toBe(6); // 3 quake + 1 Portuguese + 2 corridor
    expect(n(week, 'GB')).toBe(0); // GB is only a publisher home
  });
});

describe('fixture events', () => {
  it('seeds three fictional events, a curated timeline and a journey, idempotently', async () => {
    await truncateContent();
    await seedFixtures(prisma);
    const count = async () => ({
      events: await prisma.newsEvent.count(),
      links: await prisma.eventArticle.count(),
      timeline: await prisma.timelineEntry.count(),
      nodes: await prisma.journeyNode.count(),
    });
    const first = await count();
    expect(first).toEqual({ events: 3, links: 11, timeline: 4, nodes: 4 });
    expect(await prisma.newsEvent.count({ where: { isFixture: false } })).toBe(0);
    await seedFixtures(prisma, new Date(Date.now() + 3_600_000));
    expect(await count()).toEqual(first);
  });
});
