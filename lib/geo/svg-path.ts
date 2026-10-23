/**
 * Compact SVG path encoding for the static flat map (scripts/generate-world-map.ts).
 *
 * d3-geo writes absolute `M x,y L x,y … Z` paths. Rewritten as relative moves with implicit
 * line-tos and the fewest separators, the same outline is far smaller once gzipped (mostly
 * one- and two-digit steps). The map loads with every Explore page, so this is time each first
 * visit saves.
 *
 * Lossless for integer coordinates (`geoPath().digits(0)`; the map draws on a grid fine enough
 * for that), so relative steps never accumulate rounding error. Consecutive duplicate points
 * (zero-length segments) are dropped.
 */
export function compactPath(d: string): string {
  let out = '';
  let cx = 0; // current point
  let cy = 0;
  for (const ring of d.split('Z')) {
    if (!ring) continue;
    if (!/^M-?\d+,-?\d+(L-?\d+,-?\d+)*$/.test(ring)) throw new Error(`Unsupported path: ${ring}`);
    const points = ring
      .slice(1)
      .split('L')
      .map((p) => p.split(',').map(Number) as [number, number]);
    let body = '';
    const push = (v: number) => {
      // A minus sign already ends the previous number; otherwise separate with a space.
      body += !body || v < 0 ? `${v}` : ` ${v}`;
    };
    points.forEach(([x, y], i) => {
      if (i > 0 && x === cx && y === cy) return;
      push(x - cx);
      push(y - cy);
      cx = x;
      cy = y;
    });
    out += `m${body}z`;
    // Closing a subpath returns the current point to its start.
    [cx, cy] = points[0]!;
  }
  return out;
}
