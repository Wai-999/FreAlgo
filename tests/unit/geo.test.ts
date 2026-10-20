import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { identifyFeature, topologyToFeatures, UNCODED_AREAS } from '@/lib/geo/features';

const topology = JSON.parse(readFileSync('public/geo/countries-110m.v1.json', 'utf8'));
const { countries } = JSON.parse(readFileSync('prisma/data/countries.json', 'utf8')) as {
  countries: { iso2: string; isoNumeric: string | null }[];
};
const numericToIso2 = new Map(
  countries.filter((c) => c.isoNumeric).map((c) => [c.isoNumeric!, c.iso2]),
);

describe('country boundary mapping', () => {
  const features = topologyToFeatures(topology);

  it('maps every drawn boundary to an ISO alpha-2 code or an explicit uncoded area', () => {
    const unmapped = features
      .map((f) => identifyFeature(f, numericToIso2))
      .filter((id) => !id.iso2 && !id.uncoded)
      .map((id) => id.name);
    expect(unmapped).toEqual([]);
  });

  it('maps well-known countries correctly', () => {
    const byName = new Map(
      features.map((f) => [f.properties.name, identifyFeature(f, numericToIso2)]),
    );
    expect(byName.get('Myanmar')?.iso2).toBe('MM');
    expect(byName.get('Kenya')?.iso2).toBe('KE');
    expect(byName.get('Brazil')?.iso2).toBe('BR');
    expect(byName.get('Kosovo')?.iso2).toBe('XK');
  });

  it('routes uncoded areas transparently to a related ISO country', () => {
    for (const [name, info] of Object.entries(UNCODED_AREAS)) {
      expect(countries.some((c) => c.iso2 === info.relatedIso2)).toBe(true);
      const f = features.find((x) => x.properties.name === name);
      expect(f, name).toBeDefined();
      expect(identifyFeature(f!, numericToIso2).iso2).toBeNull();
    }
  });

  it('country reference data is normalized and unique', () => {
    const iso2 = countries.map((c) => c.iso2);
    expect(new Set(iso2).size).toBe(iso2.length);
    expect(iso2.every((c) => /^[A-Z]{2}$/.test(c))).toBe(true);
    expect(countries.length).toBeGreaterThanOrEqual(249);
  });
});
