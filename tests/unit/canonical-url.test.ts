import { describe, expect, it } from 'vitest';
import {
  InvalidArticleUrlError,
  canonicalUrlHash,
  canonicalizeUrl,
} from '@/lib/ingest/canonical-url';

describe('canonicalizeUrl', () => {
  it('lower-cases scheme/host, drops default ports and fragments', () => {
    expect(canonicalizeUrl('HTTPS://News.Example.COM:443/Path/A#comments')).toBe(
      'https://news.example.com/Path/A',
    );
    expect(canonicalizeUrl('http://example.com:80/')).toBe('http://example.com/');
  });

  it('strips tracking parameters and sorts the rest deterministically', () => {
    expect(
      canonicalizeUrl(
        'https://ex.com/a?utm_source=rss&b=2&fbclid=x&a=1&UTM_Campaign=y&gclid=z&ocid=1',
      ),
    ).toBe('https://ex.com/a?a=1&b=2');
    expect(canonicalizeUrl('https://ex.com/a?b=2&a=1')).toBe(
      canonicalizeUrl('https://ex.com/a?a=1&b=2'),
    );
  });

  it('keeps paths verbatim (case and trailing slash can matter)', () => {
    expect(canonicalizeUrl('https://ex.com/Story/')).toBe('https://ex.com/Story/');
    expect(canonicalizeUrl('https://ex.com/Story')).toBe('https://ex.com/Story');
  });

  it('resolves relative links against the feed URL', () => {
    expect(canonicalizeUrl('/news/1', 'https://ex.com/feed.xml')).toBe('https://ex.com/news/1');
  });

  it('handles internationalised domains via punycode', () => {
    expect(canonicalizeUrl('https://bücher.example/x')).toBe('https://xn--bcher-kva.example/x');
  });

  it('rejects non-http(s) and credential-bearing URLs', () => {
    expect(() => canonicalizeUrl('javascript:alert(1)')).toThrow(InvalidArticleUrlError);
    expect(() => canonicalizeUrl('ftp://ex.com/a')).toThrow(InvalidArticleUrlError);
    expect(() => canonicalizeUrl('https://user:pw@ex.com/a')).toThrow(InvalidArticleUrlError);
    expect(() => canonicalizeUrl('not a url')).toThrow(InvalidArticleUrlError);
  });

  it('produces a stable sha256 hex hash', () => {
    const h = canonicalUrlHash('https://ex.com/a');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(canonicalUrlHash('https://ex.com/a')).toBe(h);
  });
});
