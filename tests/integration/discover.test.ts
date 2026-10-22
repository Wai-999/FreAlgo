import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { canonicalUrlHash } from '@/lib/ingest/canonical-url';
import { dailyDiscovery, eligibleCountries, seededIndex, surprise } from '@/lib/discover/select';
import { seedCountries, seedSectors } from '@/prisma/seed';
import { closeTestPrisma, testPrisma, truncateContent } from '../support/db';

/** Discover (FreAlgo 2.0, M3): eligibility, determinism, constraints and honest empty states. */
const prisma = testPrisma();
const NOW = new Date('2026-10-22T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);
const opts = { includeFixtures: false, now: NOW };

beforeAll(async () => {
  await seedCountries(prisma);
  await seedSectors(prisma);
  await truncateContent();
  const cid = async (iso2: string) =>
    (await prisma.country.findUniqueOrThrow({ where: { iso2 } })).id;
  const outlet = await prisma.mediaOutlet.create({
    data: {
      slug: 'disc-wire',
      name: 'Discover Wire',
      homepageUrl: 'https://wire.example/',
      countryId: await cid('GB'),
    },
  });
  const agriculture = await prisma.sector.findUniqueOrThrow({ where: { slug: 'agriculture' } });
  let n = 0;
  const mk = async (
    iso2: string,
    role: 'SUBJECT' | 'FEED_SCOPE' | 'PUBLISHER_HOME',
    at: Date,
    extra: { language?: string; sector?: boolean; fixture?: boolean } = {},
  ) => {
    const url = `https://wire.example/${++n}`;
    await prisma.article.create({
      data: {
        outletId: outlet.id,
        canonicalUrl: url,
        canonicalUrlHash: canonicalUrlHash(url),
        title: `Story ${n} about ${iso2}`,
        language: extra.language ?? 'en',
        publishedAt: at,
        isFixture: extra.fixture ?? false,
        countries: {
          create: [
            {
              countryId: await cid(iso2),
              basis:
                role === 'PUBLISHER_HOME'
                  ? 'SOURCE_COUNTRY'
                  : role === 'FEED_SCOPE'
                    ? 'FEED_DEFAULT'
                    : 'TEXT_MATCH',
              role,
              publishedAt: at,
            },
          ],
        },
        ...(extra.sector
          ? {
              sectors: {
                create: [
                  { sectorId: agriculture.id, basis: 'KEYWORD_RULE', ruleId: 't', publishedAt: at },
                ],
              },
            }
          : {}),
      },
    });
  };
  await mk('PE', 'SUBJECT', hoursAgo(5), { sector: true });
  await mk('PE', 'SUBJECT', hoursAgo(30)); // 2026-10-21
  await mk('KE', 'FEED_SCOPE', hoursAgo(40), { language: 'sw' }); // 2026-10-20
  await mk('JP', 'SUBJECT', hoursAgo(20)); // 2026-10-21
  await mk('GB', 'PUBLISHER_HOME', hoursAgo(10)); // not "about" GB → not eligible
  await mk('FR', 'SUBJECT', hoursAgo(24 * 9)); // outside the 7-day window
  await mk('CL', 'SUBJECT', hoursAgo(3), { fixture: true }); // fixtures hidden
});

afterAll(async () => {
  await closeTestPrisma();
});

describe('discover', () => {
  it('counts only countries with stories about them in the window, sorted by ISO code', async () => {
    const pool = await eligibleCountries(prisma, {}, opts);
    expect(pool.map((c) => [c.iso2, c.stories])).toEqual([
      ['JP', 1],
      ['KE', 1],
      ['PE', 2],
    ]);
  });

  it('applies constraints (language, sector)', async () => {
    expect((await eligibleCountries(prisma, { language: 'sw' }, opts)).map((c) => c.iso2)).toEqual([
      'KE',
    ]);
    expect(
      (await eligibleCountries(prisma, { sector: 'agriculture' }, opts)).map((c) => c.iso2),
    ).toEqual(['PE']);
  });

  it('is deterministic for a seed, follows the documented index and returns the country’s stories', async () => {
    const a = await surprise(prisma, '424242', {}, opts);
    const b = await surprise(prisma, '424242', {}, opts);
    expect(a.pick).toEqual(b.pick);
    expect(a.pick!.index).toBe(seededIndex('424242', 3));
    expect(a.eligible.count).toBe(3);
    expect(a.method.description).toMatch(/Uniform choice among 3 eligible countries/);
    expect(a.stories.length).toBeGreaterThan(0);
    expect(a.stories.every((s) => s.countries.some((c) => c.iso2 === a.pick!.iso2))).toBe(true);
  });

  it('reports an empty pool instead of inventing a pick', async () => {
    const r = await surprise(prisma, '1', { language: 'zz' }, opts);
    expect(r.pick).toBeNull();
    expect(r.eligible.count).toBe(0);
  });

  it('picks one daily story from the day’s eligible stories, and none on an empty day', async () => {
    const day = await dailyDiscovery(prisma, '2026-10-21', { includeFixtures: false });
    expect(day.poolSize).toBe(2); // PE (30 h ago) and JP (20 h ago); GB is publisher-home only
    expect(day.story?.publishedAt.slice(0, 10)).toBe('2026-10-21');
    expect(await dailyDiscovery(prisma, '2026-10-21', { includeFixtures: false })).toEqual(day);
    const empty = await dailyDiscovery(prisma, '2026-10-10', { includeFixtures: false });
    expect(empty).toMatchObject({ poolSize: 0, story: null, index: null });
  });
});
