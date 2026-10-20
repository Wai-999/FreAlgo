import { geoEqualEarth, geoPath } from 'd3-geo';
import topology from '@/public/geo/countries-110m.v1.json';
import { identifyFeature, topologyToFeatures, type FeatureIdentity } from './features';

/**
 * Server-side 2D map geometry. Used as the SSR/no-JS stage, the loading skeleton for the 3D globe
 * and the fallback when WebGL is unavailable. Computed once per process and memoized.
 */
export const MAP_WIDTH = 960;
export const MAP_HEIGHT = 500;

export interface MapShape extends FeatureIdentity {
  d: string;
}

let cache: { key: string; shapes: MapShape[] } | undefined;

export function getWorldMapShapes(numericToIso2: ReadonlyMap<string, string>): MapShape[] {
  const key = [...numericToIso2.entries()].length.toString();
  if (cache && cache.key === key) return cache.shapes;
  const features = topologyToFeatures(topology).filter((f) => f.properties?.name !== 'Antarctica');
  const projection = geoEqualEarth().fitExtent(
    [
      [8, 8],
      [MAP_WIDTH - 8, MAP_HEIGHT - 8],
    ],
    { type: 'FeatureCollection', features },
  );
  const path = geoPath(projection).digits(1);
  const shapes = features
    .map((f) => ({ ...identifyFeature(f, numericToIso2), d: path(f) ?? '' }))
    .filter((s) => s.d.length > 0);
  cache = { key, shapes };
  return shapes;
}
