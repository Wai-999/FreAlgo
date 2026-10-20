import { describe, expect, it } from 'vitest';
import {
  articleQuerySchema,
  effectiveSort,
  resolveDateRange,
  toSearchParams,
} from '@/lib/api/contracts';
import { decodeCursor, encodeCursor, InvalidCursorError } from '@/lib/search/cursor';
import { filterSummary, parseExploreQuery } from '@/lib/explore/params';

describe('article query parser', () => {
  it('normalises codes and accepts repeated values', () => {
    const q = articleQuerySchema.parse({
      country: 'mm',
      sector: ['agriculture', 'politics'],
      orientation: 'center-left',
      language: 'EN',
    });
    expect(q).toMatchObject({
      country: 'MM',
      sector: ['agriculture', 'politics'],
      orientation: ['CENTER_LEFT'],
      language: ['en'],
      limit: 24,
    });
  });

  it('enforces query-cost limits', () => {
    expect(() => articleQuerySchema.parse({ limit: '31' })).toThrow();
    expect(() => articleQuerySchema.parse({ q: 'x'.repeat(201) })).toThrow();
    expect(() =>
      articleQuerySchema.parse({ outlet: Array.from({ length: 21 }, (_, i) => `outlet-${i}`) }),
    ).toThrow();
    expect(() => articleQuerySchema.parse({ from: '2000-01-01', to: '2020-01-01' })).toThrow(
      /10 years/,
    );
  });

  it('allows only allow-listed sorts and requires q for relevance', () => {
    expect(() => articleQuerySchema.parse({ sort: 'popularity' })).toThrow();
    expect(() => articleQuerySchema.parse({ sort: 'relevance' })).toThrow(
      /requires a search query/,
    );
    expect(effectiveSort(articleQuerySchema.parse({ q: 'rice' }))).toBe('relevance');
    expect(effectiveSort(articleQuerySchema.parse({}))).toBe('newest');
  });

  it('rejects malformed values without echoing them into SQL', () => {
    expect(() => articleQuerySchema.parse({ outlet: "x'; drop table" })).toThrow();
    expect(() => articleQuerySchema.parse({ sector: 'sports' })).toThrow();
    expect(() => articleQuerySchema.parse({ orientation: 'liberal' })).toThrow();
  });

  it('resolves periods and inclusive "to" dates as half-open UTC ranges', () => {
    const now = new Date('2026-10-19T12:00:00Z');
    expect(
      resolveDateRange(articleQuerySchema.parse({ period: '24h' }), now).from?.toISOString(),
    ).toBe('2026-10-18T12:00:00.000Z');
    const r = resolveDateRange(
      articleQuerySchema.parse({ from: '2026-10-01', to: '2026-10-01' }),
      now,
    );
    expect([r.from?.toISOString(), r.to?.toISOString()]).toEqual([
      '2026-10-01T00:00:00.000Z',
      '2026-10-02T00:00:00.000Z',
    ]);
  });

  it('round-trips through URL parameters', () => {
    const q = articleQuerySchema.parse({
      country: 'KE',
      sector: ['culture'],
      orientation: ['center'],
      limit: '5',
      cursor: 'abc',
      period: '7d',
    });
    const again = articleQuerySchema.parse(
      Object.fromEntries(
        [...new Set(toSearchParams(q).keys())].map((k) => [
          k,
          toSearchParams(q).getAll(k).length > 1
            ? toSearchParams(q).getAll(k)
            : toSearchParams(q).get(k),
        ]),
      ),
    );
    expect(again).toEqual(q);
  });
});

describe('cursor generation', () => {
  it('round-trips and binds the cursor to its sort order', () => {
    const c = encodeCursor({
      v: 1,
      s: 'newest',
      d: 'next',
      k: ['2026-10-19T00:00:00.000Z', 'abc'],
      p: 2,
    });
    expect(decodeCursor(c, 'newest')).toMatchObject({ p: 2, d: 'next' });
    expect(() => decodeCursor(c, 'oldest')).toThrow(InvalidCursorError);
  });

  it('rejects tampered or malformed cursors', () => {
    expect(() => decodeCursor('###', 'newest')).toThrow(InvalidCursorError);
    expect(() => decodeCursor(Buffer.from('{"v":2}').toString('base64url'), 'newest')).toThrow(
      InvalidCursorError,
    );
    const badDate = encodeCursor({ v: 1, s: 'newest', d: 'next', k: ['not-a-date', 'abc'], p: 2 });
    expect(() => decodeCursor(badDate, 'newest')).toThrow(InvalidCursorError);
    const badScore = encodeCursor({
      v: 1,
      s: 'relevance',
      d: 'next',
      k: ['1; drop', '2026-10-19T00:00:00.000Z', 'a'],
      p: 2,
    });
    expect(() => decodeCursor(badScore, 'relevance')).toThrow(InvalidCursorError);
  });
});

describe('explore page params', () => {
  it('drops invalid parameters and reports them instead of failing', () => {
    const { query, ignored } = parseExploreQuery({
      country: 'KE',
      sort: 'popularity',
      orientation: 'liberal',
      sector: 'culture',
    });
    expect(query).toMatchObject({ country: 'KE', sector: ['culture'] });
    expect(query.sort).toBeUndefined();
    expect(ignored.sort()).toEqual(['orientation', 'sort']);
  });

  it('summarises active filters in plain words', () => {
    const q = articleQuerySchema.parse({
      sector: 'agriculture',
      orientation: ['center-left', 'right'],
      language: 'en',
      period: '7d',
    });
    expect(filterSummary(q)).toEqual({
      text: 'Agriculture · Center-Left or Right · English · Last 7 days',
      count: 4,
    });
  });
});
