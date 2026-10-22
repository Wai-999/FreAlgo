import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPrisma } from '@/lib/db/client';
import { countryConnections } from '@/lib/db/connections';
import { listCountrySummaries } from '@/lib/db/countries';
import { getEnv } from '@/lib/env';
import type { RawSearchParams } from '@/lib/explore/params';
import { isEnabled } from '@/lib/flags';
import { formatUtc } from '@/lib/format';

export const metadata: Metadata = {
  title: 'Country connections',
  description: 'Countries named together in reports of the same event, with dates and links.',
};

/**
 * Country connections (FreAlgo 2.0, spec §3; flag "countryConnections"): a text list, which is
 * also the accessible equivalent of any map overlay. Alphabetical, never ranked by count.
 */
export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  if (!isEnabled('countryConnections') || !isEnabled('eventClustering')) notFound();
  const env = getEnv();
  const sp = await searchParams;
  const raw = Array.isArray(sp.country) ? sp.country[0] : sp.country;
  const countries = (await listCountrySummaries({ includeFixtures: env.SHOW_FIXTURES })).filter(
    (c) => c.articleCount > 0,
  );
  const selected = countries.find((c) => c.iso2 === raw?.toUpperCase()) ?? null;
  const connections = selected
    ? await countryConnections(getPrisma(), selected.iso2, { includeFixtures: env.SHOW_FIXTURES })
    : [];

  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">Country connections</h1>
      <p className="measure mt-2 text-muted">
        Countries that are named together in reports grouped into the same event. That is the only
        kind of connection shown: it means “reported together”, not a trade, political or historical
        relationship.
      </p>
      <form action="/connections" method="get" className="mt-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Country
          <select
            name="country"
            defaultValue={selected?.iso2 ?? ''}
            className="min-h-11 rounded-md border border-border-strong bg-surface px-3 text-text"
          >
            <option value="">Choose a country</option>
            {countries.map((c) => (
              <option key={c.iso2} value={c.iso2}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="min-h-11 rounded-md border border-border-strong px-4 text-sm text-text hover:bg-surface-raised"
        >
          Show connections
        </button>
      </form>

      {selected ? (
        <section aria-labelledby="conn-h" className="mt-8" data-testid="connections">
          <h2 id="conn-h" className="text-xl font-semibold">
            {selected.name}
          </h2>
          {connections.length ? (
            <ul className="mt-3 space-y-4">
              {connections.map((c) => (
                <li key={c.iso2}>
                  <p>
                    <Link href={`/connections?country=${c.iso2}`}>{c.name}</Link>{' '}
                    <span className="text-sm text-muted">
                      · relationship: shared event cluster ({c.events.length}{' '}
                      {c.events.length === 1 ? 'event' : 'events'})
                    </span>
                  </p>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                    {c.events.map((e) => (
                      <li key={e.slug}>
                        <Link href={`/stories/${e.slug}`}>{e.title}</Link>{' '}
                        <span className="text-muted">
                          ({formatUtc(e.startAt)} to {formatUtc(e.lastAt)})
                        </span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-muted" data-testid="connections-empty">
              No event in FreAlgo names {selected.name} together with another country.
            </p>
          )}
        </section>
      ) : null}
    </>
  );
}
