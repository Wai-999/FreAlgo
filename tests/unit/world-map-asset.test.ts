import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { WORLD_MAP_VIEWBOX, worldMapPaths } from '@/lib/geo/map-paths';

const svg = readFileSync('public/geo/world-map.v4.svg', 'utf8');

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

  it('stays within its first-load budget (compact paths, see docs/performance.md)', () => {
    // The map downloads alongside the Explore page's scripts on every first visit.
    expect(svg).toContain('viewBox="0 0 1920 1000"');
    expect(svg).not.toMatch(/ d="M/);
    expect(gzipSync(svg).length).toBeLessThan(20_000);
  });

  it('feeds the server-rendered World Pulse map on the same grid', () => {
    expect(svg).toContain(`viewBox="${WORLD_MAP_VIEWBOX}"`);
    const paths = worldMapPaths();
    expect(paths).toHaveLength(links.length);
    expect(paths.find((p) => p.iso2 === 'MM')?.d).toMatch(/^m\d+ \d+/);
  });
});
