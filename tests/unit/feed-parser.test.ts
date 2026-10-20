import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseFeed } from '@/lib/ingest/feed-parser';

const fixture = (name: string) => readFileSync(`tests/fixtures/feeds/${name}`, 'utf8');

describe('parseFeed', () => {
  it('parses RSS 2.0 items with namespaces, CDATA, categories and media', () => {
    const feed = parseFeed(fixture('rss2-basic.xml'));
    expect(feed.format).toBe('RSS2');
    expect(feed.language).toBe('en-us');
    expect(feed.items).toHaveLength(7);
    const first = feed.items[0]!;
    expect(first).toMatchObject({
      guid: 'test-gazette-1',
      guidIsPermaLink: false,
      title: 'Fixture: Rice harvest & irrigation planning in Thailand',
      author: 'Fixture Reporter',
      categories: ['Agriculture'],
      imageUrl: 'https://feeds.test/img/rice.jpg',
      published: 'Mon, 19 Oct 2026 08:30:00 +0630',
    });
    expect(first.summary).toContain('<script>');
  });

  it('parses RSS 1.0 (RDF) with dc:date and rdf:about guids', () => {
    const feed = parseFeed(fixture('rss1-rdf.xml'));
    expect(feed.format).toBe('RSS1');
    expect(feed.language).toBe('de');
    expect(feed.items[0]).toMatchObject({
      guid: 'https://feeds.test/rdf/1',
      published: '2026-10-19T06:00:00+02:00',
      categories: ['Wirtschaft'],
    });
  });

  it('parses Atom, choosing the alternate HTML link and xml:lang', () => {
    const feed = parseFeed(fixture('atom.xml'));
    expect(feed.format).toBe('ATOM');
    expect(feed.items[0]).toMatchObject({
      guid: 'urn:test:atom:1',
      link: 'https://feeds.test/atom/1',
      author: '試験 記者',
      language: 'ja',
      categories: ['科学'],
      published: '2026-10-19T09:00:00+09:00',
    });
  });

  it('rejects DOCTYPE/ENTITY payloads (XXE / billion laughs)', () => {
    expect(() => parseFeed(fixture('doctype-bomb.xml'))).toThrow(/DOCTYPE or ENTITY/);
  });

  it('rejects malformed XML and non-feeds', () => {
    expect(() => parseFeed(fixture('malformed.xml'))).toThrow();
    expect(() => parseFeed('<html><body>Just a page</body></html>')).toThrow(/not an XML feed/);
    expect(() => parseFeed('<?xml version="1.0"?><note>hi</note>')).toThrow(/Unrecognised/);
  });

  it('caps the number of items processed per feed', () => {
    const items = Array.from(
      { length: 400 },
      (_, i) => `<item><title>T${i}</title><link>https://feeds.test/${i}</link></item>`,
    ).join('');
    expect(parseFeed(`<rss><channel>${items}</channel></rss>`).items).toHaveLength(300);
  });
});
