import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseFeed } from '@/lib/ingest/feed-parser';
import { normalizeItem, normalizeLanguage } from '@/lib/ingest/normalize';

const feed = parseFeed(readFileSync('tests/fixtures/feeds/rss2-basic.xml', 'utf8'));
const ctx = {
  feedUrl: 'https://feeds.test/feed.xml',
  feedLanguage: feed.language,
  outletLanguage: 'en',
  excerptAllowed: true,
  firstSeenAt: new Date('2026-10-19T12:00:00Z'),
};

describe('normalizeItem', () => {
  const results = feed.items.map((i) => normalizeItem(i, ctx));

  it('normalizes a well-formed item: plain-text excerpt, canonical URL, UTC time, language', () => {
    const r = results[0]!;
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.item.canonicalUrl).toBe('https://feeds.test/articles/rice?id=7');
    expect(r.item.excerpt).toBe('Synthetic fixture excerpt about farmers.');
    expect(r.item.excerpt).not.toMatch(/[<>]/);
    expect(r.item.publishedAt.toISOString()).toBe('2026-10-19T02:00:00.000Z');
    expect(r.item.publishedOffsetMinutes).toBe(390);
    expect(r.item.publishedAtRaw).toBe('Mon, 19 Oct 2026 08:30:00 +0630');
    expect(r.item.language).toBe('en-US');
    expect(r.item.status).toBe('PUBLISHED');
  });

  it('maps tracking-param variants of the same link to the same hash', () => {
    const a = results[0]!;
    const b = results[2]!;
    expect(a.ok && b.ok && a.item.canonicalUrlHash === b.item.canonicalUrlHash).toBe(true);
  });

  it('rejects unsafe links and items without a headline', () => {
    expect(results[3]).toMatchObject({ ok: false, reason: 'invalid-url' });
    expect(results[4]).toMatchObject({ ok: false, reason: 'missing-title' });
  });

  it('quarantines far-future items and estimates missing dates', () => {
    expect(results[5]).toMatchObject({
      ok: true,
      item: { status: 'QUARANTINED', statusReason: 'future-timestamp' },
    });
    expect(results[6]).toMatchObject({
      ok: true,
      item: { publishedAtEstimated: true, publishedAt: ctx.firstSeenAt },
    });
  });

  it('omits excerpts when the source licence does not allow them', () => {
    const r = normalizeItem(feed.items[0]!, { ...ctx, excerptAllowed: false });
    expect(r.ok && r.item.excerpt).toBeNull();
  });
});

describe('normalizeLanguage', () => {
  it.each([
    ['en-us', 'en-US'],
    ['EN_gb', 'en-GB'],
    ['my', 'my'],
    ['zh-hant', 'zh-Hant'],
    ['english', null],
    ['', null],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeLanguage(input)).toBe(expected);
  });
});
