import { describe, expect, it } from 'vitest';
import { myWorldHref } from '@/components/my-world/my-world-bootstrap';
import { latestCompleteDay, seededIndex } from '@/lib/discover/select';
import { whyReasons } from '@/lib/explore/why';
import { DEFAULT_PREFERENCES } from '@/lib/preferences/schema';
import type { ArticleListItem } from '@/lib/search/articles';

const article = (over: Partial<ArticleListItem> = {}): ArticleListItem => ({
  id: 'a1',
  title: 'Peru approves new mining law',
  excerpt: null,
  url: 'https://news.example/a1',
  language: 'en',
  author: null,
  publishedAt: '2026-10-21T08:00:00.000Z',
  publishedAtRaw: null,
  publishedOffsetMinutes: null,
  publishedAtEstimated: false,
  firstSeenAt: '2026-10-21T08:05:00.000Z',
  isFixture: false,
  outlet: {
    id: 'o1',
    slug: 'ledger',
    name: 'Test Ledger',
    paywall: 'NONE',
    country: { iso2: 'MM', name: 'Myanmar' },
    label: {
      level: 'source',
      orientation: 'UNRATED',
      status: 'UNRATED',
      confidence: null,
      ideologyTags: [],
      methodology: null,
      sourceUrl: null,
      reviewedAt: null,
      context: null,
      isMachine: false,
    },
  },
  articleLabel: null,
  articleType: 'UNKNOWN',
  articleTypeBasis: null,
  countries: [
    {
      iso2: 'PE',
      name: 'Peru',
      basis: 'TEXT_MATCH',
      role: 'SUBJECT',
      matchedTerm: 'Peru (rules v2)',
    },
    {
      iso2: 'MM',
      name: 'Myanmar',
      basis: 'SOURCE_COUNTRY',
      role: 'PUBLISHER_HOME',
      matchedTerm: null,
    },
  ],
  sectors: [
    {
      slug: 'business-economics',
      name: 'Business & Economics',
      basis: 'KEYWORD_RULE',
      ruleId: 'business-economics.kw.v1',
    },
  ],
  ...over,
});

describe('whyReasons', () => {
  it('explains a country match with its stored evidence, the order and the absence of profiling', () => {
    const r = whyReasons(article(), { query: { country: 'PE' }, sort: 'newest' });
    expect(r[0]).toBe('It is about Peru: the text mentions “Peru”.');
    expect(r.some((x) => x.startsWith('Ordered by publication time, newest first.'))).toBe(true);
    expect(r.at(-1)).toMatch(/Nothing about you/);
  });

  it('is explicit when a story is shown only because publisher-home stories were included', () => {
    const r = whyReasons(article(), { query: { country: 'MM', scope: 'all' }, sort: 'newest' });
    expect(r[0]).toMatch(/based in Myanmar\. It is shown because you included/);
  });

  it('names the sector rule and states when no filter applies', () => {
    expect(
      whyReasons(article(), { query: { sector: ['business-economics'] }, sort: 'oldest' })[0],
    ).toBe('Sector Business & Economics: a keyword rule matched (business-economics.kw.v1).');
    expect(whyReasons(article(), { query: {}, sort: 'newest' })[0]).toMatch(/No filters/);
  });

  it('puts page-specific reasons first', () => {
    const r = whyReasons(article(), {
      query: {},
      sort: 'newest',
      reasons: ['Chosen by Surprise me.'],
    });
    expect(r[0]).toBe('Chosen by Surprise me.');
  });
});

describe('seeded selection', () => {
  it('is deterministic for a seed and within range', () => {
    expect(seededIndex('123456', 27)).toBe(seededIndex('123456', 27));
    for (let i = 0; i < 200; i++) {
      const v = seededIndex(String(i), 7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(7);
    }
  });

  it('is close to uniform over many seeds (no hidden weighting)', () => {
    const n = 10;
    const counts = new Array(n).fill(0);
    for (let i = 0; i < 20_000; i++) counts[seededIndex(`seed-${i}`, n)]++;
    for (const c of counts) expect(Math.abs(c - 2000)).toBeLessThan(200); // within 10 %
  });

  it('uses the latest complete UTC day for the daily discovery', () => {
    expect(latestCompleteDay(new Date('2026-10-22T00:30:00Z'))).toBe('2026-10-21');
    expect(latestCompleteDay(new Date('2026-01-01T12:00:00Z'))).toBe('2025-12-31');
  });
});

describe('My World link', () => {
  it('encodes only explicit choices and is null when there are none', () => {
    expect(myWorldHref(DEFAULT_PREFERENCES)).toBeNull();
    const href = myWorldHref({
      ...DEFAULT_PREFERENCES,
      pinnedCountries: ['MM', 'TH'],
      sectors: ['agriculture'],
      orientations: ['CENTER_LEFT'],
      preferredSort: 'oldest',
    });
    expect(href).toBe(
      '/my-world?country=MM&country=TH&sector=agriculture&orientation=center-left&sort=oldest',
    );
  });
});
