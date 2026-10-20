import { readFileSync } from 'node:fs';
import { SphereGeometry } from 'three';
import { describe, expect, it } from 'vitest';
import { topologyToFeatures } from '@/lib/geo/features';
import {
  FrameMonitor,
  buildCountryIndex,
  cappedDpr,
  chooseQuality,
  isTap,
  lonLatToVector3,
  ringsToSegments,
  uvToLonLat,
  vector3ToLonLat,
} from '@/lib/geo/globe-math';

const topology = JSON.parse(readFileSync('public/geo/countries-110m.v1.json', 'utf8'));
const { countries } = JSON.parse(readFileSync('prisma/data/countries.json', 'utf8')) as {
  countries: { iso2: string; isoNumeric: string | null }[];
};
const numericToIso2 = new Map(
  countries.filter((c) => c.isoNumeric).map((c) => [c.isoNumeric!, c.iso2]),
);
const index = buildCountryIndex(topologyToFeatures(topology), numericToIso2);

describe('globe coordinate mapping', () => {
  it('matches three.js SphereGeometry vertices for their UVs', () => {
    const geo = new SphereGeometry(1, 24, 16);
    const pos = geo.getAttribute('position');
    const uv = geo.getAttribute('uv');
    for (let i = 0; i < pos.count; i += 7) {
      const [lon, lat] = uvToLonLat(uv.getX(i), uv.getY(i));
      const [x, y, z] = lonLatToVector3(lon, lat, 1);
      expect(x).toBeCloseTo(pos.getX(i), 5);
      expect(y).toBeCloseTo(pos.getY(i), 5);
      expect(z).toBeCloseTo(pos.getZ(i), 5);
    }
  });

  it('round-trips lon/lat through 3D', () => {
    for (const [lon, lat] of [
      [96.1, 19.7],
      [-74, 40.7],
      [151.2, -33.9],
      [0, 0],
      [179.9, 10],
    ] as const) {
      const [lon2, lat2] = vector3ToLonLat(lonLatToVector3(lon, lat, 2.5));
      expect(lon2).toBeCloseTo(lon, 6);
      expect(lat2).toBeCloseTo(lat, 6);
    }
  });
});

describe('country picking', () => {
  it.each([
    [96.1, 19.7, 'MM'],
    [37.9, 0.0, 'KE'],
    [-47.9, -15.8, 'BR'],
    [10.4, 51.1, 'DE'],
    [138.2, 36.2, 'JP'],
    [-100, 40, 'US'],
    [21.0, 42.6, 'XK'],
  ])('(%s, %s) is %s', (lon, lat, iso2) => {
    expect(index.lookup(lon, lat)?.iso2).toBe(iso2);
  });

  it('returns null over the ocean and flags uncoded areas transparently', () => {
    expect(index.lookup(-30, 0)).toBeNull();
    const somaliland = index.lookup(46, 9.5);
    expect(somaliland?.iso2).toBeNull();
    expect(somaliland?.uncoded?.relatedIso2).toBe('SO');
  });

  it('handles countries spanning the antimeridian', () => {
    expect(index.lookup(178, 66)?.iso2).toBe('RU');
    expect(index.lookup(-178, 66)?.iso2).toBe('RU');
  });

  it('computes centroids inside the country for typical shapes', () => {
    const [lon, lat] = index.centroid('KE')!;
    expect(index.lookup(lon, lat)?.iso2).toBe('KE');
    expect(index.centroid('ZZ')).toBeNull();
  });

  it('builds outline segments on the sphere surface', () => {
    const seg = ringsToSegments(index.feature('MM')!, 1.005);
    expect(seg.length % 6).toBe(0);
    for (let i = 0; i < seg.length; i += 3) {
      expect(Math.hypot(seg[i]!, seg[i + 1]!, seg[i + 2]!)).toBeCloseTo(1.005, 5);
    }
  });
});

describe('adaptive quality', () => {
  it('does not treat all phones equally', () => {
    expect(chooseQuality({ coarsePointer: true, deviceMemory: 2, hardwareConcurrency: 8 })).toBe(
      'low',
    );
    expect(chooseQuality({ coarsePointer: true, deviceMemory: 8, hardwareConcurrency: 8 })).toBe(
      'medium',
    );
    expect(chooseQuality({ deviceMemory: 8, hardwareConcurrency: 10 })).toBe('high');
    expect(chooseQuality({ saveData: true, deviceMemory: 16, hardwareConcurrency: 16 })).toBe(
      'low',
    );
    expect(chooseQuality({})).toBe('medium');
  });

  it('caps device pixel ratio at 1.5 on touch devices', () => {
    expect(cappedDpr('high', 3, true)).toBe(1.5);
    expect(cappedDpr('high', 3, false)).toBe(2);
    expect(cappedDpr('low', 3, false)).toBe(1);
    expect(cappedDpr('medium', 1, false)).toBe(1);
  });

  it('flags sustained slow frames but ignores idle gaps', () => {
    const m = new FrameMonitor(10, 34);
    for (let i = 0; i < 9; i++) expect(m.push(50)).toBe(false);
    expect(m.push(50)).toBe(true);
    const ok = new FrameMonitor(10, 34);
    for (let i = 0; i < 20; i++) expect(ok.push(i % 5 === 0 ? 5000 : 16)).toBe(false);
  });
});

describe('tap vs drag', () => {
  it('only short, still presses count as taps', () => {
    expect(isTap({ x: 0, y: 0, t: 0 }, { x: 3, y: 4, t: 200 })).toBe(true);
    expect(isTap({ x: 0, y: 0, t: 0 }, { x: 30, y: 0, t: 200 })).toBe(false);
    expect(isTap({ x: 0, y: 0, t: 0 }, { x: 1, y: 1, t: 900 })).toBe(false);
  });
});
