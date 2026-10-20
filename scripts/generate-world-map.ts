/**
 * Builds public/geo/world-map.v2.svg (bump the version when the output changes: the asset is
 * served as immutable): the flat (2D) map used as the no-JS / no-WebGL fallback and
 * as the stage skeleton before the globe loads. Served as a static, immutable asset so the map is
 * not inlined (twice: markup + server payload) into every page.
 *
 * Each country is a plain link (`target="_top"`, so it works without JavaScript) that is removed
 * from the tab order: keyboard and screen-reader users use the equivalent country list.
 * Run: node --import tsx scripts/generate-world-map.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { geoEqualEarth, geoPath } from 'd3-geo';
import { identifyFeature, topologyToFeatures } from '../lib/geo/features';

const WIDTH = 960;
const HEIGHT = 500;
const topology = JSON.parse(readFileSync('public/geo/countries-110m.v1.json', 'utf8'));
const { countries } = JSON.parse(readFileSync('prisma/data/countries.json', 'utf8')) as {
  countries: { iso2: string; isoNumeric: string | null; name: string }[];
};
const numericToIso2 = new Map(
  countries.filter((c) => c.isoNumeric).map((c) => [c.isoNumeric!, c.iso2]),
);
const names = new Map(countries.map((c) => [c.iso2, c.name]));

const features = topologyToFeatures(topology).filter((f) => f.properties?.name !== 'Antarctica');
const projection = geoEqualEarth().fitExtent(
  [
    [8, 8],
    [WIDTH - 8, HEIGHT - 8],
  ],
  { type: 'FeatureCollection', features },
);
const path = geoPath(projection).digits(1);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

const parts: string[] = [];
for (const f of features) {
  const id = identifyFeature(f, numericToIso2);
  const d = path(f);
  if (!d) continue;
  if (id.iso2) {
    const name = names.get(id.iso2) ?? id.name;
    parts.push(
      `<a href="/?country=${id.iso2}" target="_top" tabindex="-1" data-iso2="${id.iso2}"><path d="${d}"><title>${esc(name)}</title></path></a>`,
    );
  } else {
    const note = id.uncoded ? ` (${id.uncoded.note})` : '';
    parts.push(`<path class="uncoded" d="${d}"><title>${esc(id.name + note)}</title></path>`);
  }
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" preserveAspectRatio="xMidYMid meet" role="presentation">
<style>
html,svg{background:transparent;margin:0}
:root{color-scheme:dark}
path{fill:#1a2638;stroke:#3a4a62;stroke-width:.4;vector-effect:non-scaling-stroke;transition:fill .12s}
a[data-news] path{fill:#23415f}
a:hover path,a[data-selected] path{fill:#1d9bff}
a{cursor:pointer}
a:focus{outline:none}
</style>
${parts.join('\n')}
</svg>
`;
writeFileSync('public/geo/world-map.v2.svg', svg);
console.log(
  `Wrote public/geo/world-map.v2.svg (${(svg.length / 1024).toFixed(1)} KB, ${parts.length} shapes)`,
);
