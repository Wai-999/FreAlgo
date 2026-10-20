import type { CountryFeature, FeatureIdentity } from './features';

/**
 * Draws the globe's equirectangular texture from the same Natural Earth vectors used for picking.
 * No raster download: a 2048×1024 texture is generated in a few milliseconds on the client.
 */
export interface TextureColors {
  ocean: string;
  graticule: string;
  land: string;
  landWithNews: string;
  border: string;
}

export const GLOBE_COLORS: TextureColors = {
  ocean: '#070c16',
  graticule: '#0d1524',
  land: '#1a2638',
  landWithNews: '#23415f',
  border: '#4a5b75',
};

export function drawGlobeTexture(
  ctx: CanvasRenderingContext2D,
  width: number,
  features: { feature: CountryFeature; identity: FeatureIdentity }[],
  hasNews: ReadonlySet<string>,
  colors: TextureColors = GLOBE_COLORS,
): void {
  const height = width / 2;
  const x = (lon: number) => ((lon + 180) / 360) * width;
  const y = (lat: number) => ((90 - lat) / 180) * height;

  ctx.fillStyle = colors.ocean;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = colors.graticule;
  ctx.lineWidth = Math.max(1, width / 2048);
  ctx.beginPath();
  for (let lon = -180; lon <= 180; lon += 30) {
    ctx.moveTo(x(lon), 0);
    ctx.lineTo(x(lon), height);
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    ctx.moveTo(0, y(lat));
    ctx.lineTo(width, y(lat));
  }
  ctx.stroke();

  for (const { feature, identity } of features) {
    const geom = feature.geometry;
    const polygons =
      geom.type === 'Polygon'
        ? [geom.coordinates]
        : geom.type === 'MultiPolygon'
          ? geom.coordinates
          : [];
    ctx.beginPath();
    for (const polygon of polygons) {
      for (const ring of polygon) {
        let prevLon: number | null = null;
        ring.forEach((pt, i) => {
          const [lon, lat] = pt as [number, number];
          if (i === 0 || (prevLon !== null && Math.abs(lon - prevLon) > 180))
            ctx.moveTo(x(lon), y(lat));
          else ctx.lineTo(x(lon), y(lat));
          prevLon = lon;
        });
        ctx.closePath();
      }
    }
    ctx.fillStyle = identity.iso2 && hasNews.has(identity.iso2) ? colors.landWithNews : colors.land;
    ctx.fill('evenodd');
    ctx.strokeStyle = colors.border;
    ctx.lineWidth = Math.max(1, width / 2600);
    ctx.stroke();
  }
}
