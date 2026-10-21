import { readFileSync } from 'node:fs';
import { geoEqualEarth, geoPath } from 'd3-geo';
import { describe, expect, it } from 'vitest';
import { topologyToFeatures } from '@/lib/geo/features';
import { compactPath } from '@/lib/geo/svg-path';

/** Decodes the compact form back to absolute rings (relative moves, implicit line-tos, `z`). */
function decode(d: string): [number, number][][] {
  const rings: [number, number][][] = [];
  let ring: [number, number][] = [];
  let cx = 0;
  let cy = 0;
  let pending: number[] = [];
  for (const token of d.match(/[mz]|-?\d+/g) ?? []) {
    if (token === 'm') {
      ring = [];
      rings.push(ring);
    } else if (token === 'z') {
      [cx, cy] = ring[0]!;
    } else {
      pending.push(Number(token));
      if (pending.length === 2) {
        cx += pending[0]!;
        cy += pending[1]!;
        ring.push([cx, cy]);
        pending = [];
      }
    }
  }
  return rings;
}

/** Absolute rings of a d3 path, without consecutive duplicate points. */
function parse(d: string): [number, number][][] {
  return d
    .split('Z')
    .filter(Boolean)
    .map((r) =>
      r
        .slice(1)
        .split('L')
        .map((p) => p.split(',').map(Number) as [number, number])
        .filter((p, i, all) => i === 0 || p[0] !== all[i - 1]![0] || p[1] !== all[i - 1]![1]),
    );
}

describe('compact SVG paths for the flat map', () => {
  it('encodes relative steps with implicit line-tos and minimal separators', () => {
    expect(compactPath('M100,50L102,48L102,48L99,53Z')).toBe('m100 50 2-2-3 5z');
    // A closed subpath returns to its start, so the next move is relative to that point.
    expect(compactPath('M10,10L20,10ZM15,30L16,31Z')).toBe('m10 10 10 0zm5 20 1 1z');
  });

  it('round-trips every country of the generated map exactly', () => {
    const topology = JSON.parse(readFileSync('public/geo/countries-110m.v1.json', 'utf8'));
    const features = topologyToFeatures(topology).filter(
      (f) => f.properties?.name !== 'Antarctica',
    );
    const projection = geoEqualEarth().fitExtent(
      [
        [16, 16],
        [1904, 984],
      ],
      { type: 'FeatureCollection', features },
    );
    const path = geoPath(projection).digits(0);
    let checked = 0;
    for (const f of features) {
      const d = path(f);
      if (!d) continue;
      expect(decode(compactPath(d))).toEqual(parse(d));
      checked++;
    }
    expect(checked).toBeGreaterThan(170);
  });

  it('refuses input it cannot encode losslessly', () => {
    expect(() => compactPath('M1.5,2L3,4Z')).toThrow(/Unsupported path/);
    expect(() => compactPath('M1,2C3,4,5,6,7,8Z')).toThrow(/Unsupported path/);
  });
});
