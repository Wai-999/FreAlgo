import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { articleQuerySchema } from '@/lib/api/contracts';
import { canonicalUrlHash } from '@/lib/ingest/canonical-url';
import { listArticles, type ArticleListItem } from '@/lib/search/articles';
import { encodeCursor } from '@/lib/search/cursor';
import { seedCountries, seedSectors } from '@/prisma/seed';
import { GET as countryArticles } from '@/app/api/v1/countries/[iso2]/articles/route';
import { GET as search } from '@/app/api/v1/articles/search/route';
import { GET as countries } from '@/app/api/v1/countries/route';
import { closeTestPrisma, testPrisma, truncateContent } from '../support/db';

const prisma = testPrisma();
const T0 = new Date('2026-10-01T00:00:00Z');
const hours = (h: number) => new Date(T0.getTime() + h * 3_600_000);

interface Spec {
  key: string;
  outlet: 'ledger' | 'herald' | 'wire';
  title: string;
  excerpt?: string;
  at: Date;
  countries: string[];
  sectors: string[];
  language: string;
  status?: 'PUBLISHED' | 'REMOVED' | 'QUARANTINED';
  fixture?: boolean;
}

const SPECS: Spec[] = [
  {
    key: 'a1',
    outlet: 'ledger',
    title: 'Rice farmers adopt new irrigation in Myanmar',
    at: hours(1),
    countries: ['MM'],
    sectors: ['agriculture'],
    language: 'en',
  },
  {
    key: 'a2',
    outlet: 'ledger',
    title: 'Parliament debates election law',
    at: hours(2),
    countries: ['MM'],
    sectors: ['politics'],
    language: 'en',
  },
  {
    key: 'a3',
    outlet: 'herald',
    title: 'Election commission publishes timetable',
    excerpt: 'Elections are due next year.',
    at: hours(3),
    countries: ['MM', 'TH'],
    sectors: ['politics'],
    language: 'en',
  },
  {
    key: 'a4',
    outlet: 'herald',
    title: 'Monsoon rainfall advisory for farmers',
    at: hours(3),
    countries: ['MM'],
    sectors: ['agriculture', 'history-context'],
    language: 'en',
  },
  {
    key: 'a5',
    outlet: 'wire',
    title: '中国の経済と農業',
    at: hours(4),
    countries: ['MM', 'CN'],
    sectors: ['business-economics', 'agriculture'],
    language: 'ja',
  },
  {
    key: 'a6',
    outlet: 'wire',
    title: 'Broadband rollout reaches rural schools',
    at: hours(5),
    countries: ['TH'],
    sectors: ['technology', 'education'],
    language: 'en',
  },
  {
    key: 'a7',
    outlet: 'ledger',
    title: 'University admissions reform',
    at: hours(6),
    countries: ['MM'],
    sectors: ['education'],
    language: 'my',
  },
  {
    key: 'a8',
    outlet: 'herald',
    title: 'Removed story about elections',
    at: hours(7),
    countries: ['MM'],
    sectors: ['politics'],
    language: 'en',
    status: 'REMOVED',
  },
  {
    key: 'a9',
    outlet: 'herald',
    title: 'Quarantined story about farmers',
    at: hours(8),
    countries: ['MM'],
    sectors: ['agriculture'],
    language: 'en',
    status: 'QUARANTINED',
  },
  {
    key: 'a10',
    outlet: 'wire',
    title: 'Fixture-only story about irrigation',
    at: hours(9),
    countries: ['MM'],
    sectors: ['agriculture'],
    language: 'en',
    fixture: true,
  },
  // Same timestamp as a3/a4 to exercise the id tie-break.
  {
    key: 'a11',
    outlet: 'ledger',
    title: 'Seed cooperative trial results',
    at: hours(3),
    countries: ['MM'],
    sectors: ['agriculture'],
    language: 'en',
  },
];

const ids = new Map<string, string>();

async function seedDataset() {
  await truncateContent();
  const [mm, cn] = await Promise.all([
    prisma.country.findUniqueOrThrow({ where: { iso2: 'MM' } }),
    prisma.country.findUniqueOrThrow({ where: { iso2: 'CN' } }),
  ]);
  const outlets = {
    ledger: await prisma.mediaOutlet.create({
      data: {
        slug: 'test-ledger',
        name: 'Test Ledger',
        homepageUrl: 'https://ledger.example/',
        countryId: mm.id,
        orientation: 'CENTER_LEFT',
        labelStatus: 'PROVISIONAL',
        labelSourceUrl: 'https://example.org/m',
        labelMethodology: 'test',
      },
    }),
    herald: await prisma.mediaOutlet.create({
      data: {
        slug: 'test-herald',
        name: 'Agri Herald',
        homepageUrl: 'https://herald.example/',
        countryId: mm.id,
        orientation: 'RIGHT',
        labelStatus: 'PROVISIONAL',
        labelSourceUrl: 'https://example.org/m',
        labelMethodology: 'test',
      },
    }),
    wire: await prisma.mediaOutlet.create({
      data: {
        slug: 'test-wire',
        name: 'Zeta Wire',
        homepageUrl: 'https://wire.example/',
        countryId: cn.id,
        orientation: 'UNRATED',
      },
    }),
  };
  const countryIds = new Map(
    (await prisma.country.findMany({ select: { id: true, iso2: true } })).map((c) => [
      c.iso2,
      c.id,
    ]),
  );
  const sectorIds = new Map(
    (await prisma.sector.findMany({ select: { id: true, slug: true } })).map((s) => [s.slug, s.id]),
  );
  for (const s of SPECS) {
    const url = `https://news.example/${s.key}`;
    const a = await prisma.article.create({
      data: {
        outletId: outlets[s.outlet].id,
        canonicalUrl: url,
        canonicalUrlHash: canonicalUrlHash(url),
        title: s.title,
        excerpt: s.excerpt ?? null,
        language: s.language,
        publishedAt: s.at,
        status: s.status ?? 'PUBLISHED',
        isFixture: s.fixture ?? false,
        countries: {
          create: s.countries.map((c, i) => ({
            countryId: countryIds.get(c)!,
            basis: i === 0 ? 'SOURCE_COUNTRY' : 'TEXT_MATCH',
            publishedAt: s.at,
          })),
        },
        sectors: {
          create: s.sectors.map((slug) => ({
            sectorId: sectorIds.get(slug)!,
            basis: 'KEYWORD_RULE',
            ruleId: 'test',
            publishedAt: s.at,
          })),
        },
      },
    });
    ids.set(s.key, a.id);
  }
}

const keysOf = (items: ArticleListItem[]) =>
  items.map((i) => [...ids].find(([, id]) => id === i.id)?.[0]);
const visible = SPECS.filter((s) => (s.status ?? 'PUBLISHED') === 'PUBLISHED' && !s.fixture);
const run = (q: Record<string, unknown>, includeFixtures = false) =>
  listArticles(prisma, articleQuerySchema.parse(q), { includeFixtures, now: hours(10) });

function expectedOrder(specs: Spec[], cmp: (a: Spec, b: Spec) => number) {
  return [...specs]
    .sort((a, b) => cmp(a, b) || (ids.get(b.key)! < ids.get(a.key)! ? -1 : 1))
    .map((s) => s.key);
}

beforeAll(async () => {
  await seedCountries(prisma);
  await seedSectors(prisma);
  await seedDataset();
});

afterAll(async () => {
  await closeTestPrisma();
});

describe('deterministic sorting and cursor pagination', () => {
  async function walk(q: Record<string, unknown>) {
    const pages: ArticleListItem[][] = [];
    let res = await run({ ...q, limit: 2 });
    pages.push(res.items);
    while (res.page.nextCursor) {
      res = await run({ ...q, limit: 2, cursor: res.page.nextCursor });
      pages.push(res.items);
    }
    // Walk back with prev cursors and check we retrace the same pages.
    const back: ArticleListItem[][] = [res.items];
    while (res.page.prevCursor) {
      res = await run({ ...q, limit: 2, cursor: res.page.prevCursor });
      back.unshift(res.items);
    }
    return { pages, back };
  }

  it('newest-first visits every visible article exactly once, ties broken by id', async () => {
    const { pages, back } = await walk({});
    const all = pages.flat();
    expect(new Set(all.map((a) => a.id)).size).toBe(all.length);
    expect(keysOf(all)).toEqual(expectedOrder(visible, (a, b) => b.at.getTime() - a.at.getTime()));
    expect(back.map(keysOf)).toEqual(pages.map(keysOf));
    expect(pages.every((p) => p.length <= 2)).toBe(true);
  });

  it('oldest-first is the exact reverse of newest-first', async () => {
    const newest = (await walk({ sort: 'newest' })).pages.flat().map((a) => a.id);
    const oldest = (await walk({ sort: 'oldest' })).pages.flat().map((a) => a.id);
    expect(oldest).toEqual([...newest].reverse());
  });

  it('outlet-name sort groups alphabetically, newest first within an outlet', async () => {
    const { pages, back } = await walk({ sort: 'outlet' });
    const names = pages.flat().map((a) => a.outlet.name);
    expect(names).toEqual(
      [...names].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())),
    );
    expect(back.map(keysOf)).toEqual(pages.map(keysOf));
  });

  it('country pages (index-driven) use the same order and cursors', async () => {
    const { pages } = await walk({ country: 'MM' });
    const mm = visible.filter((s) => s.countries.includes('MM'));
    expect(keysOf(pages.flat())).toEqual(
      expectedOrder(mm, (a, b) => b.at.getTime() - a.at.getTime()),
    );
  });

  it('a story inserted between page loads does not duplicate or shift later pages', async () => {
    const p1 = await run({ limit: 3 });
    const outlet = await prisma.mediaOutlet.findUniqueOrThrow({ where: { slug: 'test-ledger' } });
    const late = await prisma.article.create({
      data: {
        outletId: outlet.id,
        canonicalUrl: 'https://news.example/late',
        canonicalUrlHash: canonicalUrlHash('https://news.example/late'),
        title: 'Late breaking',
        publishedAt: hours(9.5),
      },
    });
    try {
      const p2 = await run({ limit: 3, cursor: p1.page.nextCursor! });
      const seen = [...p1.items, ...p2.items].map((a) => a.id);
      expect(new Set(seen).size).toBe(seen.length);
      expect(seen).not.toContain(late.id);
      expect(p2.page.number).toBe(2);
    } finally {
      await prisma.article.delete({ where: { id: late.id } });
    }
  });

  it('reports a finite total and ends with no next cursor', async () => {
    const res = await run({ limit: 30 });
    expect(res.page.total).toBe(visible.length);
    expect(res.page.totalIsCapped).toBe(false);
    expect(res.page.nextCursor).toBeNull();
    expect(res.page.prevCursor).toBeNull();
  });
});

describe('filters', () => {
  it('intersects dimensions (AND) and unions values within a dimension (OR)', async () => {
    const res = await run({
      country: 'MM',
      sector: ['agriculture', 'politics'],
      orientation: ['center-left', 'right'],
      language: ['en'],
      from: '2026-10-01',
      to: '2026-10-01',
    });
    const expected = visible
      .filter((s) => s.countries.includes('MM'))
      .filter((s) => s.sectors.some((x) => x === 'agriculture' || x === 'politics'))
      .filter((s) => s.outlet === 'ledger' || s.outlet === 'herald')
      .filter((s) => s.language === 'en')
      .map((s) => s.key)
      .sort();
    expect(keysOf(res.items).sort()).toEqual(expected);
  });

  it('filters by outlet, period and region', async () => {
    expect(keysOf((await run({ outlet: ['test-wire'] })).items).sort()).toEqual(['a5', 'a6']);
    expect(keysOf((await run({ period: '24h' })).items)).toHaveLength(visible.length);
    expect(keysOf((await run({ from: '2026-10-02' })).items)).toEqual([]);
    expect(keysOf((await run({ region: 'Eastern Asia' })).items)).toEqual(['a5']);
  });

  it('never shows removed or quarantined stories, and hides fixtures unless enabled', async () => {
    const all = keysOf((await run({ limit: 30 })).items);
    expect(all).not.toContain('a8');
    expect(all).not.toContain('a9');
    expect(all).not.toContain('a10');
    expect(keysOf((await run({ limit: 30 }, true)).items)).toContain('a10');
  });
});

describe('search', () => {
  it('matches headline and excerpt with language stemming', async () => {
    expect(keysOf((await run({ q: 'elections' })).items).sort()).toEqual(['a2', 'a3']);
  });

  it('matches outlet names', async () => {
    expect(keysOf((await run({ q: 'Agri Herald' })).items).sort()).toEqual(['a3', 'a4']);
  });

  it('tolerates small typos via trigram word similarity', async () => {
    expect(keysOf((await run({ q: 'irrigaton' })).items)).toContain('a1');
  });

  it('finds substrings in scripts written without spaces', async () => {
    expect(keysOf((await run({ q: '経済' })).items)).toEqual(['a5']);
  });

  it('orders by text relevance deterministically and pages without duplicates', async () => {
    const first = await run({ q: 'farmers', limit: 1 });
    const second = await run({ q: 'farmers', limit: 1, cursor: first.page.nextCursor! });
    expect(first.page.sort).toBe('relevance');
    expect(first.items[0]!.relevance).toBeGreaterThanOrEqual(second.items[0]!.relevance!);
    expect(first.items[0]!.id).not.toBe(second.items[0]!.id);
    const again = await run({ q: 'farmers', limit: 1 });
    expect(again.items[0]!.id).toBe(first.items[0]!.id);
  });

  it('treats SQL-like input purely as data', async () => {
    const before = await prisma.article.count();
    for (const q of ['\'; DROP TABLE "Article"; --', "%' OR 1=1 --", '\\', '_%_']) {
      const res = await run({ q });
      expect(Array.isArray(res.items)).toBe(true);
    }
    expect(await prisma.article.count()).toBe(before);
  });
});

describe('HTTP contracts', () => {
  const get = (url: string) =>
    new NextRequest(`http://localhost:3000${url}`, {
      headers: { 'x-forwarded-for': `api-test-${Math.random()}` },
    });

  it('returns items, finite page info and an ordering explanation', async () => {
    const res = await countryArticles(
      get('/api/v1/countries/mm/articles?sector=agriculture&limit=2'),
      { params: Promise.resolve({ iso2: 'mm' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(2);
    expect(body.page).toMatchObject({ limit: 2, sort: 'newest', number: 1 });
    expect(body.page.nextCursor).toBeTruthy();
    expect(body.ordering.explanation).toMatch(/newest first/);
    expect(body.items[0].outlet.label.level).toBe('source');
    expect(body.items[0].articleLabel).toBeNull();
    expect(res.headers.get('cache-control')).toMatch(/stale-while-revalidate/);
  });

  it.each([
    ['/api/v1/articles/search?limit=100', 'VALIDATION_ERROR'],
    ['/api/v1/articles/search?sort=relevance', 'VALIDATION_ERROR'],
    ['/api/v1/articles/search?sort=popularity', 'VALIDATION_ERROR'],
    ['/api/v1/articles/search?orientation=liberal', 'VALIDATION_ERROR'],
    ['/api/v1/articles/search?from=2026-10-05&to=2026-10-01', 'VALIDATION_ERROR'],
    ['/api/v1/articles/search?country=MMR', 'VALIDATION_ERROR'],
    ['/api/v1/articles/search?cursor=not-a-cursor', 'INVALID_CURSOR'],
    [
      `/api/v1/articles/search?sort=oldest&cursor=${encodeCursor({ v: 1, s: 'newest', d: 'next', k: ['2026-10-01T00:00:00.000Z', 'x'], p: 2 })}`,
      'INVALID_CURSOR',
    ],
  ])('rejects %s with %s', async (url, code) => {
    const res = await search(get(url), { params: Promise.resolve({}) });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe(code);
  });

  it('404s for unknown countries', async () => {
    const res = await countryArticles(get('/api/v1/countries/zz/articles'), {
      params: Promise.resolve({ iso2: 'zz' }),
    });
    expect(res.status).toBe(404);
  });

  it('lists every country including those without sources', async () => {
    const res = await countries(get('/api/v1/countries'), { params: Promise.resolve({}) });
    const body = await res.json();
    expect(body.countries).toHaveLength(250);
    expect(body.coverage.countriesWithSources).toBeGreaterThan(0);
    expect(body.countries.find((c: { iso2: string }) => c.iso2 === 'AQ').articleCount).toBe(0);
  });
});
