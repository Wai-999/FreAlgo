import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPrisma } from '@/lib/db/client';
import {
  PULSE_BUCKETS,
  PULSE_PERIODS,
  pulseBucket,
  pulseCounts,
  type PulsePeriod,
} from '@/lib/db/pulse';
import { getEnv } from '@/lib/env';
import type { RawSearchParams } from '@/lib/explore/params';
import { isEnabled } from '@/lib/flags';
import { formatUtc } from '@/lib/format';
import { WORLD_MAP_VIEWBOX, worldMapPaths } from '@/lib/geo/map-paths';

export const metadata: Metadata = {
  title: 'World Pulse',
  description: 'How many reports in FreAlgo are about each country: a measure of coverage.',
};

// One hue, lighter to stronger: more reports, not "more important". Zero has its own pattern.
const FILL = [
  'url(#pulse-none)',
  'color-mix(in srgb, var(--accent) 22%, var(--surface))',
  'color-mix(in srgb, var(--accent) 42%, var(--surface))',
  'color-mix(in srgb, var(--accent) 66%, var(--surface))',
  'color-mix(in srgb, var(--accent) 90%, var(--surface))',
];

function bucketLabel(b: number): string {
  if (b === 0) return 'No reports in FreAlgo';
  const lo = PULSE_BUCKETS[b - 1]!;
  const hi = PULSE_BUCKETS[b];
  return hi ? (hi - 1 === lo ? `${lo}` : `${lo}–${hi - 1}`) : `${lo} or more`;
}

/**
 * World Pulse (FreAlgo 2.0, spec §3; flag "worldPulse"): measured report counts per country on
 * the 2D map, with legend, timestamp, denominator and a full text table. Counts describe
 * FreAlgo's sources, not the world.
 */
export default async function WorldPulsePage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  if (!isEnabled('worldPulse')) notFound();
  const sp = await searchParams;
  const raw = Array.isArray(sp.period) ? sp.period[0] : sp.period;
  const period: PulsePeriod = raw === '24h' ? '24h' : '7d';
  const data = await pulseCounts(getPrisma(), {
    includeFixtures: getEnv().SHOW_FIXTURES,
    period,
  });
  const counts = new Map(data.countries.map((c) => [c.iso2, c]));
  const paths = worldMapPaths();
  const byName = [...data.countries].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">World Pulse</h1>
      <p className="measure mt-2 text-muted">
        How many reports in FreAlgo are about each country. This measures FreAlgo’s coverage, not
        importance and not how much is happening: a pale or empty country may simply have no outlet
        in FreAlgo’s sources.
      </p>
      <nav aria-label="Period" className="mt-4 flex gap-2 text-sm">
        {(Object.keys(PULSE_PERIODS) as PulsePeriod[]).map((p) => (
          <Link
            key={p}
            href={`/world-pulse?period=${p}`}
            aria-current={p === period ? 'page' : undefined}
            className={`inline-flex min-h-11 items-center rounded-md border px-3 no-underline ${p === period ? 'border-accent text-text' : 'border-border-strong text-muted'}`}
          >
            {p === '24h' ? 'Last 24 hours' : 'Last 7 days'}
          </Link>
        ))}
      </nav>

      <figure className="mt-4" data-testid="pulse-map">
        <svg
          viewBox={WORLD_MAP_VIEWBOX}
          role="img"
          aria-labelledby="pulse-title pulse-desc"
          className="h-auto w-full rounded-lg border border-border bg-surface"
        >
          <title id="pulse-title">
            Reports per country, {period === '24h' ? 'last 24 hours' : 'last 7 days'}
          </title>
          <desc id="pulse-desc">
            Map shading by number of reports about each country. The same numbers are in the table
            below.
          </desc>
          <defs>
            <pattern id="pulse-none" width="4" height="4" patternUnits="userSpaceOnUse">
              <rect width="4" height="4" fill="var(--surface)" />
              <path d="M0 4L4 0" stroke="var(--border)" strokeWidth="0.6" />
            </pattern>
          </defs>
          {paths.map((p) => {
            const c = counts.get(p.iso2);
            return (
              <path
                key={p.iso2}
                d={p.d}
                fill={FILL[pulseBucket(c?.reports ?? 0)]}
                stroke="var(--border-strong)"
                strokeWidth="0.4"
                vectorEffect="non-scaling-stroke"
              >
                <title>{`${c?.name ?? p.iso2}: ${c?.reports ?? 0} reports`}</title>
              </path>
            );
          })}
        </svg>
        <figcaption className="mt-3 text-sm">
          <ul
            className="flex flex-wrap gap-x-4 gap-y-2"
            aria-label="Legend"
            data-testid="pulse-legend"
          >
            {FILL.map((f, b) => (
              <li key={f} className="flex items-center gap-2">
                <svg width="18" height="12" aria-hidden="true">
                  <rect width="18" height="12" fill={f} stroke="var(--border-strong)" />
                </svg>
                {bucketLabel(b)}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-muted" data-testid="pulse-notes">
            Counted {formatUtc(data.since)} to {formatUtc(data.generatedAt)}: {data.totalReports}{' '}
            reports from {data.outlets} outlets based in {data.outletCountries} countries. A report
            counts for a country when its text names the country or its feed declares the country as
            its scope; where the outlet is based is not counted. Raw counts, not adjusted for
            population or for how many outlets FreAlgo has in each country. Boundaries: Natural
            Earth (public domain). Very small countries may not be visible; the table lists all of
            them.
          </p>
        </figcaption>
      </figure>

      <section aria-labelledby="pulse-table-h" className="mt-8">
        <h2 id="pulse-table-h" className="text-xl font-semibold">
          Reports per country
        </h2>
        <p className="text-sm text-muted">
          Alphabetical. {byName.length} countries have at least one report in this period; every
          other country has none in FreAlgo, which does not mean nothing happened there.
        </p>
        {byName.length ? (
          <div className="table-scroll mt-3">
            <table className="w-full text-sm" data-testid="pulse-table">
              <thead>
                <tr className="text-left text-muted">
                  <th scope="col" className="py-1 pr-4 font-medium">
                    Country
                  </th>
                  <th scope="col" className="py-1 text-right font-medium">
                    Reports
                  </th>
                </tr>
              </thead>
              <tbody>
                {byName.map((c) => (
                  <tr key={c.iso2} className="border-t border-border">
                    <td className="py-1 pr-4">
                      <Link href={`/?country=${c.iso2}`}>{c.name}</Link>
                    </td>
                    <td className="py-1 text-right tabular-nums">{c.reports}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-3 text-muted">No reports in this period.</p>
        )}
      </section>
    </>
  );
}
