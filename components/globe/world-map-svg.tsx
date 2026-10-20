import Link from 'next/link';
import { MAP_HEIGHT, MAP_WIDTH, getWorldMapShapes } from '@/lib/geo/world-map';

/**
 * Server-rendered 2D map. Works with no JavaScript and no WebGL. Pointer users can click a
 * country; keyboard and screen-reader users get the equivalent country list (the map links are
 * removed from the tab order to avoid ~180 tab stops).
 */
export function WorldMapSvg({
  numericToIso2,
  countsByIso2,
  selectedIso2,
  hrefForCountry,
  className,
}: {
  numericToIso2: ReadonlyMap<string, string>;
  countsByIso2: ReadonlyMap<string, number>;
  selectedIso2: string | null;
  hrefForCountry: (iso2: string) => string;
  className?: string;
}) {
  const shapes = getWorldMapShapes(numericToIso2);
  return (
    <>
      <p className="sr-only">
        World map for pointer users. Keyboard and screen-reader users can choose any country from
        the country list, which offers the same options.
      </p>
      <svg
        viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
        className={className}
        aria-hidden="true"
        focusable="false"
        data-testid="world-map-svg"
        preserveAspectRatio="xMidYMid meet"
      >
        {shapes.map((s, i) => {
          const shape = (
            <path
              d={s.d}
              className="map-country"
              data-iso2={s.iso2 ?? undefined}
              data-has-news={s.iso2 && (countsByIso2.get(s.iso2) ?? 0) > 0 ? 'true' : undefined}
              data-selected={s.iso2 && s.iso2 === selectedIso2 ? 'true' : undefined}
            >
              <title>{s.uncoded ? `${s.name} — ${s.uncoded.note}` : s.name}</title>
            </path>
          );
          if (!s.iso2) return <g key={`u-${i}`}>{shape}</g>;
          return (
            <Link
              key={s.iso2 + i}
              href={hrefForCountry(s.iso2)}
              scroll={false}
              prefetch={false}
              tabIndex={-1}
              aria-hidden="true"
            >
              {shape}
            </Link>
          );
        })}
      </svg>
    </>
  );
}
