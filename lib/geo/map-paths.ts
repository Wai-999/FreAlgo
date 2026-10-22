import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Country outlines of the 2D map (public/geo/world-map.v3.svg, Natural Earth, public domain) as
 * data, so server-rendered views such as World Pulse can shade them without client JavaScript.
 * Parsed once per process.
 */
let cache: { iso2: string; d: string }[] | null = null;

export function worldMapPaths(): { iso2: string; d: string }[] {
  if (cache) return cache;
  const svg = readFileSync(path.join(process.cwd(), 'public/geo/world-map.v3.svg'), 'utf8');
  const out: { iso2: string; d: string }[] = [];
  const re = /data-iso2="([A-Z]{2})"><path d="([^"]+)"/g;
  for (let m = re.exec(svg); m; m = re.exec(svg)) out.push({ iso2: m[1]!, d: m[2]! });
  cache = out;
  return out;
}

export const WORLD_MAP_VIEWBOX = '0 0 960 500';
