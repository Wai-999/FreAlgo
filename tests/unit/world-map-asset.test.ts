import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const svg = readFileSync('public/geo/world-map.v3.svg', 'utf8');

describe('static flat-map asset', () => {
  const links = [...svg.matchAll(/<a ([^>]*)>/g)].map((m) => m[1]!);

  it('links every coded country to its page, navigating the top window without JS', () => {
    expect(links.length).toBeGreaterThan(160);
    for (const attrs of links) {
      expect(attrs).toMatch(/href="\/\?country=[A-Z]{2}"/);
      expect(attrs).toContain('target="_top"');
      // Pointer-only: keyboard users use the equivalent country list.
      expect(attrs).toContain('tabindex="-1"');
    }
    expect(svg).toContain('data-iso2="MM"');
    expect(svg).toContain('data-iso2="XK"');
  });

  it('contains no scripts or external references', () => {
    expect(svg).not.toMatch(/<script|javascript:|https?:\/\/(?!www\.w3\.org)/i);
  });

  it('declares the same color scheme as the app, so the iframe stays transparent', () => {
    // Browsers paint an opaque (white) backdrop behind an iframe whose document's color-scheme
    // differs from the embedding page's (the app is dark-only).
    expect(svg).toContain(':root{color-scheme:dark}');
  });

  it('labels uncoded areas transparently instead of merging them', () => {
    expect(svg).toMatch(/Somaliland \(No separate ISO 3166-1 code/);
  });
});
