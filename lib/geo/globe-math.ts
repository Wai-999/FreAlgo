import { geoBounds, geoCentroid, geoContains } from 'd3-geo';
import { identifyFeature, type CountryFeature, type FeatureIdentity } from './features';

export * from './globe-quality';

/**
 * Pure globe geometry, shared by the WebGL globe and unit tests.
 *
 * The mapping matches three.js SphereGeometry UVs exactly, so the equirectangular texture, the
 * country outlines and pointer picking agree without any per-axis guesswork:
 *   u = (lon + 180) / 360,  v = (lat + 90) / 180
 *   phi = 2π·u,  theta = π·(1 − v)
 *   x = −r·cos(phi)·sin(theta),  y = r·cos(theta),  z = r·sin(phi)·sin(theta)
 */
export type Vec3 = [number, number, number];

export function lonLatToVector3(lon: number, lat: number, r = 1): Vec3 {
  const phi = ((lon + 180) / 360) * 2 * Math.PI;
  const theta = ((90 - lat) / 180) * Math.PI;
  return [
    -r * Math.cos(phi) * Math.sin(theta),
    r * Math.cos(theta),
    r * Math.sin(phi) * Math.sin(theta),
  ];
}

export function vector3ToLonLat([x, y, z]: Vec3): [number, number] {
  const r = Math.hypot(x, y, z) || 1;
  const theta = Math.acos(Math.max(-1, Math.min(1, y / r)));
  let phi = Math.atan2(z, -x);
  if (phi < 0) phi += 2 * Math.PI;
  const lon = (phi / (2 * Math.PI)) * 360 - 180;
  const lat = 90 - (theta / Math.PI) * 180;
  return [lon, lat];
}

export function uvToLonLat(u: number, v: number): [number, number] {
  return [u * 360 - 180, v * 180 - 90];
}

interface IndexedFeature {
  feature: CountryFeature;
  identity: FeatureIdentity;
  bounds: [[number, number], [number, number]];
}

export interface CountryIndex {
  /** Country (or uncoded area) containing the point, if any. */
  lookup(lon: number, lat: number): FeatureIdentity | null;
  centroid(iso2: string): [number, number] | null;
  feature(iso2: string): CountryFeature | null;
  size: number;
}

function inBounds(
  lon: number,
  lat: number,
  [[w, s], [e, n]]: [[number, number], [number, number]],
): boolean {
  if (lat < s || lat > n) return false;
  // Bounds crossing the antimeridian have west > east.
  return w <= e ? lon >= w && lon <= e : lon >= w || lon <= e;
}

export function buildCountryIndex(
  features: CountryFeature[],
  numericToIso2: ReadonlyMap<string, string>,
): CountryIndex {
  const items: IndexedFeature[] = features.map((feature) => ({
    feature,
    identity: identifyFeature(feature, numericToIso2),
    bounds: geoBounds(feature) as [[number, number], [number, number]],
  }));
  const byIso = new Map(items.filter((i) => i.identity.iso2).map((i) => [i.identity.iso2!, i]));
  const centroids = new Map<string, [number, number]>();
  return {
    size: items.length,
    lookup(lon, lat) {
      for (const item of items) {
        if (!inBounds(lon, lat, item.bounds)) continue;
        if (geoContains(item.feature, [lon, lat])) return item.identity;
      }
      return null;
    },
    centroid(iso2) {
      if (centroids.has(iso2)) return centroids.get(iso2)!;
      const item = byIso.get(iso2);
      if (!item) return null;
      const c = geoCentroid(item.feature) as [number, number];
      centroids.set(iso2, c);
      return c;
    },
    feature(iso2) {
      return byIso.get(iso2)?.feature ?? null;
    },
  };
}

/**
 * Converts polygon rings to line-segment vertex pairs on a sphere, subdividing long edges so
 * outlines follow the curvature. Edges crossing the antimeridian are skipped (Natural Earth
 * already splits those rings).
 */
export function ringsToSegments(
  feature: CountryFeature,
  radius: number,
  maxStepDeg = 2,
): Float32Array {
  const out: number[] = [];
  const geom = feature.geometry;
  const polygons =
    geom.type === 'Polygon'
      ? [geom.coordinates]
      : geom.type === 'MultiPolygon'
        ? geom.coordinates
        : [];
  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (let i = 0; i < ring.length - 1; i++) {
        const [lon1, lat1] = ring[i] as [number, number];
        const [lon2, lat2] = ring[i + 1] as [number, number];
        if (Math.abs(lon2 - lon1) > 180) continue;
        const steps = Math.max(
          1,
          Math.ceil(Math.max(Math.abs(lon2 - lon1), Math.abs(lat2 - lat1)) / maxStepDeg),
        );
        for (let s = 0; s < steps; s++) {
          const a = lonLatToVector3(
            lon1 + ((lon2 - lon1) * s) / steps,
            lat1 + ((lat2 - lat1) * s) / steps,
            radius,
          );
          const b = lonLatToVector3(
            lon1 + ((lon2 - lon1) * (s + 1)) / steps,
            lat1 + ((lat2 - lat1) * (s + 1)) / steps,
            radius,
          );
          out.push(...a, ...b);
        }
      }
    }
  }
  return new Float32Array(out);
}

/** Rolling frame-time monitor; returns true when the device is struggling. */
export class FrameMonitor {
  private samples: number[] = [];
  constructor(
    private readonly window = 45,
    private readonly budgetMs = 34,
  ) {}
  push(deltaMs: number): boolean {
    if (deltaMs <= 0 || deltaMs > 1000) return false; // ignore idle gaps (render-on-demand)
    this.samples.push(deltaMs);
    if (this.samples.length > this.window) this.samples.shift();
    if (this.samples.length < this.window) return false;
    const sorted = [...this.samples].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)]!;
    return median > this.budgetMs;
  }
  reset() {
    this.samples = [];
  }
}

/** Distinguishes a tap/click from a drag. */
export function isTap(
  down: { x: number; y: number; t: number },
  up: { x: number; y: number; t: number },
  opts = { maxMove: 8, maxMs: 600 },
): boolean {
  return Math.hypot(up.x - down.x, up.y - down.y) <= opts.maxMove && up.t - down.t <= opts.maxMs;
}
