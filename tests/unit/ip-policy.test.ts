import { describe, expect, it } from 'vitest';
import { isPublicAddress } from '@/lib/ingest/ip-policy';
import { assertFetchableUrl } from '@/lib/ingest/safe-fetch';

describe('SSRF address policy', () => {
  it.each([
    '127.0.0.1',
    '127.1.2.3',
    '10.0.0.5',
    '172.16.0.1',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '255.255.255.255',
    '192.0.2.10',
    '198.18.0.1',
    '240.0.0.1',
    '::1',
    '::',
    'fe80::1',
    'fc00::1',
    'fd12:3456::1',
    '::ffff:127.0.0.1',
    '::ffff:10.0.0.1',
    'ff02::1',
    '64:ff9b::7f00:1',
    'not-an-ip',
  ])('blocks %s', (ip) => {
    expect(isPublicAddress(ip)).toBe(false);
  });

  it.each(['93.184.216.34', '1.1.1.1', '8.8.8.8', '2606:4700:4700::1111', '::ffff:8.8.8.8'])(
    'allows public %s',
    (ip) => {
      expect(isPublicAddress(ip)).toBe(true);
    },
  );
});

describe('assertFetchableUrl', () => {
  it('accepts ordinary https feed URLs', () => {
    expect(assertFetchableUrl('https://feeds.example.org/rss.xml').hostname).toBe(
      'feeds.example.org',
    );
  });

  it.each([
    'file:///etc/passwd',
    'gopher://example.org/',
    'ftp://example.org/feed',
    'http://user:pass@example.org/',
    'http://localhost/feed',
    'http://app.localhost/feed',
    'http://printer.local/',
    'http://metadata.google.internal/',
    'http://127.0.0.1/feed',
    'http://[::1]/feed',
    'http://169.254.169.254/latest/meta-data/',
    'http://10.1.2.3/',
    'http://example.org:6379/',
    'http://example.org:22/',
  ])('blocks %s', (url) => {
    expect(() => assertFetchableUrl(url)).toThrow();
  });
});
