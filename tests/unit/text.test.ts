import { describe, expect, it } from 'vitest';
import { decodeEntities, htmlToText, truncateText } from '@/lib/ingest/text';

describe('htmlToText', () => {
  it('removes tags, scripts and event handlers, keeping readable text', () => {
    expect(
      htmlToText('<p>Hello <b>world</b><script>alert(1)</script></p><img src=x onerror=alert(2)>'),
    ).toBe('Hello world');
    expect(htmlToText('<style>p{}</style>Text<iframe src="x">inner</iframe>')).toBe('Text');
  });

  it('decodes entities (including double-encoded) and collapses whitespace', () => {
    expect(htmlToText('A &amp;amp; B &#8212; C&nbsp;&nbsp; D &hellip;')).toBe('A & B — C D …');
    expect(decodeEntities('&#x1F600;')).toBe('😀');
    expect(decodeEntities('&#0;&#xD800;')).toBe('');
  });

  it('preserves non-Latin scripts', () => {
    expect(htmlToText('<p>မြန်မာ — 日本 — العربية</p>')).toBe('မြန်မာ — 日本 — العربية');
  });
});

describe('truncateText', () => {
  it('cuts on a word boundary and adds an ellipsis', () => {
    expect(truncateText('one two three four five', 12)).toBe('one two…');
    expect(truncateText('short', 12)).toBe('short');
  });

  it('never splits surrogate pairs', () => {
    const out = truncateText('😀'.repeat(10), 5);
    expect(out.endsWith('…')).toBe(true);
    expect(out).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  });
});
