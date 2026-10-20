import { feature } from 'topojson-client';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type { GeometryCollection, Topology } from 'topojson-specification';

/**
 * Boundary data: Natural Earth 1:110m admin-0 countries via world-atlas@2.0.2 (ISC; data in the
 * public domain). Feature ids are ISO 3166-1 numeric codes. A few areas have no ISO code of their
 * own; they are shown but routed transparently (see UNCODED_AREAS) instead of being silently
 * merged into another country.
 */

export type CountryFeatureProps = { name: string };
export type CountryFeature = Feature<Geometry, CountryFeatureProps> & { id?: string | number };

export const GEO_ASSET_URL = '/geo/countries-110m.v1.json';

/** Areas drawn by Natural Earth without an ISO 3166-1 numeric id. */
export const NAMED_AREA_CODES: Record<string, string> = { Kosovo: 'XK' };
export const UNCODED_AREAS: Record<string, { relatedIso2: string; note: string }> = {
  'N. Cyprus': {
    relatedIso2: 'CY',
    note: 'No separate ISO 3166-1 code. Coverage may appear under Cyprus.',
  },
  Somaliland: {
    relatedIso2: 'SO',
    note: 'No separate ISO 3166-1 code. Coverage may appear under Somalia.',
  },
};

export function topologyToFeatures(topology: unknown): CountryFeature[] {
  const topo = topology as Topology<{ countries: GeometryCollection<CountryFeatureProps> }>;
  const fc = feature(topo, topo.objects.countries) as FeatureCollection<
    Geometry,
    CountryFeatureProps
  >;
  return fc.features as CountryFeature[];
}

export interface FeatureIdentity {
  iso2: string | null;
  name: string;
  uncoded?: { relatedIso2: string; note: string };
}

/** Resolve a boundary feature to an ISO alpha-2 code using the numeric->alpha-2 map. */
export function identifyFeature(
  f: CountryFeature,
  numericToIso2: ReadonlyMap<string, string>,
): FeatureIdentity {
  const name = f.properties?.name ?? 'Unknown area';
  if (f.id !== undefined && f.id !== null) {
    const numeric = String(f.id).padStart(3, '0');
    const iso2 = numericToIso2.get(numeric);
    if (iso2) return { iso2, name };
  }
  const named = NAMED_AREA_CODES[name];
  if (named) return { iso2: named, name };
  const uncoded = UNCODED_AREAS[name];
  return uncoded ? { iso2: null, name, uncoded } : { iso2: null, name };
}
